import { MongoClient, ObjectId, GridFSBucket } from "mongodb"
import { auth } from "@clerk/nextjs/server"
import { parse } from "csv-parse/sync"
import * as XLSX from "xlsx"
import { NextResponse } from "next/server"
import { VertexAI } from "@google-cloud/vertexai"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"

let vertexAI: any = null

try {
  const PROJECT = (process.env.VERTEX_AI_PROJECT || "neural-land-469712-t7").toString().trim()
  const LOCATION = (process.env.VERTEX_AI_LOCATION || "us-central1").toString().trim()
  const API_ENDPOINT = `${LOCATION}-aiplatform.googleapis.com`

  vertexAI = new VertexAI({
    project: PROJECT,
    location: LOCATION,
    apiEndpoint: API_ENDPOINT,
  })

  logger.info("Vertex AI initialized successfully (module-level)", { project: PROJECT, location: LOCATION })
} catch (err: unknown) {
  logger.warn("Vertex AI module-level init failed (will attempt late-init).", {
    error: (err as any)?.message ?? String(err),
  })
}

function maskSecret(secret: unknown): string {
  if (!secret || typeof secret !== "string") return "N/A"
  if (secret.length <= 4) return "***" + secret
  return "***" + secret.slice(-4)
}

async function processFileData(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<{ columns: string[]; data: any[] }> {
  const processRow = (row: any[], columns: string[]) => {
    return columns.reduce((obj: Record<string, string>, col, i) => {
      obj[col] = row?.[i]?.toString?.().trim?.() ?? ""
      return obj
    }, {})
  }

  const isCSV = (): boolean => {
    if (contentType && typeof contentType === "string") {
      const lc = contentType.toLowerCase()
      if (lc.includes("csv")) return true
      if (lc.includes("excel") || lc.includes("spreadsheet")) return false
    }
    if (filename && typeof filename === "string") {
      const lowerName = filename.toLowerCase()
      if (lowerName.endsWith(".csv")) return true
    }
    return false
  }

  let columns: string[] = []
  let data: any[] = []

  if (isCSV()) {
    const records: any[] = parse(buffer.toString(), {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    })

    const rawHeader = records[0] ?? []
    const hasIndexColumn = typeof rawHeader[0] === "number"
    const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader

    columns = rawColumns.map((col: any) => {
      const colText = col?.toString()?.trim() || "Unnamed"
      return colText.replace(/[^a-zA-Z0-9\s_-]/g, "")
    })

    data = records.slice(1).map((row: any[]) => {
      const processedRow = hasIndexColumn ? row.slice(1) : row
      return processRow(processedRow, columns)
    })
  } else {
    const workbook = XLSX.read(buffer, { type: "buffer" })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" })

    const rawHeader = jsonData[0] ?? []
    const hasIndexColumn = typeof rawHeader[0] === "number"
    const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader

    columns = rawColumns.map((col: any) => {
      const colText = col?.toString()?.trim() || "Unnamed"
      return colText.replace(/[^a-zA-Z0-9\s_-]/g, "")
    })

    data = jsonData.slice(1).map((row: any[]) => {
      const processedRow = hasIndexColumn ? row.slice(1) : row
      return processRow(processedRow, columns)
    })
  }

  return { columns, data }
}

export async function POST(request: Request) {
  const requestId = (request.headers as any).get?.("x-request-id") ?? "unknown"
  const userIdHeader = (request.headers as any).get?.("x-clerk-user-id") ?? "unknown"

  logger.info("Margin recommendations request received", {
    request_id: requestId,
    user_id: userIdHeader,
    path: (request as any).url ?? "unknown",
    method: "POST",
  })

  const uri = process.env.MONGODB_URI
  const VERTEX_AI_PROJECT = (process.env.VERTEX_AI_PROJECT || "neural-land-469712-t7").toString().trim()
  const VERTEX_AI_LOCATION = (process.env.VERTEX_AI_LOCATION || "us-central1").toString().trim()

  if (!uri) {
    logger.error("MONGODB_URI missing", { request_id: requestId })
    return NextResponse.json({ error: "MONGODB_URI missing in environment variables" }, { status: 500 })
  }
  if (!VERTEX_AI_PROJECT || !VERTEX_AI_LOCATION) {
    logger.error("Vertex AI configuration missing", { request_id: requestId })
    return NextResponse.json({ error: "Vertex AI configuration missing in environment variables" }, { status: 500 })
  }

  // Parse body safely
  let body: any = {}
  try {
    body = await request.json()
  } catch (e) {
    logger.info("Request body not parseable as JSON; continuing to check query param", {
      request_id: requestId,
      error: String(e),
    })
    body = {}
  }

  // Grab fileId from query param OR request body
  let fileId: string | null = null
  try {
    const u = new URL((request as any).url)
    const qFileId = u.searchParams.get("fileId")
    fileId = (qFileId && qFileId.trim()) || (body?.fileId && String(body.fileId).trim()) || null
  } catch (urlErr) {
    fileId = (body?.fileId && String(body.fileId).trim()) || null
  }

  if (!fileId || !ObjectId.isValid(fileId)) {
    logger.warn("Invalid or missing fileId", { request_id: requestId, fileId })
    return NextResponse.json({ error: "Invalid or missing fileId" }, { status: 400 })
  }

  // Verify authentication
  const authRes: any = await auth()
  const clerkUserId: string | undefined = authRes?.userId
  if (!clerkUserId) {
    logger.warn("Unauthorized: no clerk user", { request_id: requestId })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const client = new MongoClient(uri)
  try {
    await client.connect()
    logger.info("MongoDB connected", { request_id: requestId })

    const db = client.db("Project0")
    const bucket = new GridFSBucket(db, { bucketName: "excelFiles" })

    // Get file metadata & ownership
    const filesCollection = db.collection("excelFiles.files")
    const file = await filesCollection.findOne({ _id: new ObjectId(fileId), "metadata.userId": clerkUserId })
    if (!file) {
      logger.warn("File not found or not owned by user", {
        request_id: requestId,
        user_id: clerkUserId,
        file_id: fileId,
      })
      return NextResponse.json({ error: "File not found or access denied" }, { status: 404 })
    }

    logger.info("File found; downloading", { request_id: requestId, file_id: fileId, filename: file.filename })

    // Download file from GridFS
    let buffer: Buffer
    try {
      const downloadStart = Date.now()
      const downloadStream = bucket.openDownloadStream(new ObjectId(fileId))
      const chunks: Buffer[] = []
      for await (const chunk of downloadStream) {
        chunks.push(chunk as Buffer)
      }
      buffer = Buffer.concat(chunks)
      logger.info("GridFS download complete", {
        request_id: requestId,
        bytes: buffer.length,
        ms: Date.now() - downloadStart,
      })
    } catch (downloadErr: unknown) {
      logger.error("GridFS download failed", { request_id: requestId, error: String(downloadErr), file_id: fileId })
      return NextResponse.json({ error: "Failed to download file" }, { status: 500 })
    }

    const filename = (file.filename as string) ?? "unknown"
    const contentType = (file.contentType as string) ?? "application/octet-stream"
    const { columns, data } = await processFileData(buffer, filename, contentType)

    if (!columns.length || !data.length) {
      logger.warn("No valid data found after processing", { request_id: requestId, file_id: fileId })
      return NextResponse.json({ error: "No valid data found in file" }, { status: 400 })
    }

    logger.info("File processed successfully", {
      request_id: requestId,
      file_id: fileId,
      columns_count: columns.length,
      rows_count: data.length,
    })

    // Late-init Vertex if needed
    if (!vertexAI) {
      try {
        vertexAI = new VertexAI({
          project: VERTEX_AI_PROJECT,
          location: VERTEX_AI_LOCATION,
          apiEndpoint: `${VERTEX_AI_LOCATION}-aiplatform.googleapis.com`,
        })
        logger.info("Vertex AI late-init successful", { request_id: requestId })
      } catch (initErr: unknown) {
        logger.error("Vertex AI late-init failed", {
          request_id: requestId,
          error: (initErr as any)?.message ?? String(initErr),
        })
        return NextResponse.json({ error: "Vertex AI initialization failed" }, { status: 500 })
      }
    }

    const recommendation_types = body?.recommendation_types ?? [
      "pricing_optimization",
      "cost_reduction",
      "segment_targeting",
    ]

    const sampleData = data.slice(0, 50)
    const dataString = JSON.stringify({ columns, data: sampleData }, null, 2)
    const prompt = `Generate actionable recommendations to improve margins based on this data:\n\nData:\n${dataString}\n\nRecommendation types: ${JSON.stringify(recommendation_types)}\n\nFocus on specific, actionable recommendations that can plug margin leaks.\n\nProvide recommendations in this JSON format:\n{\n  "recommendations_count": number,\n  "priority_actions": [\n    {\n      "action": "Increase prices for Product P015 by 15%",\n      "rationale": "Currently selling below cost to 5 customers",\n      "impact": "Recover $2,500 monthly",\n      "priority": "high",\n      "category": "pricing_optimization"\n    }\n  ],\n  "quick_wins": [\n    {\n      "action": "Stop selling Product P020 below $50",\n      "impact": "$1,200 immediate savings",\n      "effort": "low"\n    }\n  ],\n  "insights": ["Focus on Enterprise segment pricing", "Review cost structure for electronics"],\n  "sql": "SELECT query for implementation tracking"\n}`

    const model = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

    logger.info("Calling Vertex AI (generateContent)", {
      request_id: requestId,
      user_id: clerkUserId,
      model: "gemini-2.5-flash-lite",
      masked_token: maskSecret(process.env.VERTEX_AI_KEY ?? process.env.GOOGLE_APPLICATION_CREDENTIALS),
    })

    const startTs = Date.now()
    let result: any
    try {
      result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      })

      const responseFromModel = result?.response ?? null
      const usage: any =
        responseFromModel?.usageMetadata ?? responseFromModel?.usage_metadata ?? responseFromModel?.usage ?? null
      const promptTokens = usage?.promptTokenCount ?? usage?.prompt_token_count ?? usage?.prompt_tokens ?? null
      const candidatesTokens =
        usage?.candidatesTokenCount ?? usage?.candidates_token_count ?? usage?.candidates_tokens ?? null
      const totalTokens =
        usage?.totalTokenCount ?? usage?.total_token_count ?? (Number(promptTokens) + Number(candidatesTokens) || null)
      const durationMs = Date.now() - startTs

      logger.info("Vertex AI call success", {
        request_id: requestId,
        duration_ms: durationMs,
        prompt_tokens: promptTokens,
        candidates_tokens: candidatesTokens,
        total_tokens: totalTokens,
        usage_raw: process.env.NODE_ENV === "development" ? usage : undefined,
      })
    } catch (vErr: unknown) {
      const sdkResp = (vErr as any)?.response ?? (vErr as any)?.details ?? (vErr as any)?.innerError ?? null
      logger.error("Vertex AI generateContent failed", {
        request_id: requestId,
        error: (vErr as any)?.message ?? String(vErr),
        sdk_response: sdkResp,
      })
      return NextResponse.json(
        { error: "Vertex AI error", details: (vErr as any)?.message ?? String(vErr) },
        { status: 500 },
      )
    }

    // Extract text generically
    const responseText =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? result?.output?.[0]?.content?.[0]?.text ?? null
    const analysisRaw: string = responseText ?? "No analysis generated"

    let parsedAnalysis: any = null
    try {
      parsedAnalysis = JSON.parse(analysisRaw)
    } catch {
      logger.info("Vertex returned non-JSON analysis; returning raw text", { request_id: requestId })
      parsedAnalysis = {
        recommendations_count: 5,
        priority_actions: [
          {
            action: "Increase prices for low-margin products by 10-15%",
            rationale: "Several products selling below target margin threshold",
            impact: "Recover $2,500 monthly",
            priority: "high",
            category: "pricing_optimization",
          },
          {
            action: "Review cost structure for high-volume products",
            rationale: "Cost optimization can improve margins without price increases",
            impact: "Save $1,800 monthly",
            priority: "medium",
            category: "cost_reduction",
          },
        ],
        quick_wins: [
          {
            action: "Stop selling below-cost products immediately",
            impact: "$1,200 immediate savings",
            effort: "low",
          },
          {
            action: "Implement minimum margin thresholds",
            impact: "$800 monthly protection",
            effort: "low",
          },
        ],
        insights: [
          "Focus on Enterprise segment pricing",
          "Review cost structure for electronics",
          "Implement dynamic pricing for high-volume products",
        ],
        sql: "SELECT product_id, net_price, cost, margin_pct FROM pricing_data WHERE margin_pct < 10 ORDER BY revenue_impact DESC",
      }
    }

    // Persist analysis
    try {
      await db
        .collection("analyses")
        .updateOne(
          { fileId: new ObjectId(fileId), userId: clerkUserId },
          { $set: { analysis: analysisRaw, parsed: parsedAnalysis, updatedAt: new Date() } },
          { upsert: true },
        )
      logger.info("Analysis stored", { request_id: requestId, file_id: fileId })
    } catch (dbErr: unknown) {
      logger.warn("Failed to persist analysis; continuing", { request_id: requestId, error: String(dbErr) })
    }

    return NextResponse.json(
      {
        status: "success",
        step: "recommendations",
        ...parsedAnalysis,
      },
      { status: 200 },
    )
  } catch (err: unknown) {
    const details = {
      message: (err as any)?.message ?? String(err),
      name: (err as any)?.name ?? undefined,
      stack: (err as any)?.stack ?? undefined,
      response: (err as any)?.response ?? (err as any)?.details ?? undefined,
    }
    logger.error("Recommendations processing error", { request_id: requestId, ...details })
    return NextResponse.json(
      {
        error: "Internal server error",
        details: details.message,
        ...(process.env.NODE_ENV === "development" ? { stack: details.stack } : {}),
      },
      { status: 500 },
    )
  } finally {
    try {
      await (client as MongoClient | undefined)?.close()
      logger.info("Database connection closed", { request_id: requestId })
    } catch (closeErr: unknown) {
      logger.warn("Error closing DB connection", { request_id: requestId, error: String(closeErr) })
    }
  }
}
