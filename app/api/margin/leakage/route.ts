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

  logger.info("Margin leakage analysis request received", {
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

    const leakage_rules = body?.leakage_rules ?? ["net_price < cost", "margin_pct < 5", "discount_pct > 50"]
    const priority_threshold = body?.priority_threshold ?? 1000

    const sampleData = data.slice(0, 200)
    const dataString = JSON.stringify({ columns, data: sampleData }, null, 2)
    const prompt = `You are an expert revenue optimization analyst. Identify ALL margin leakage instances in this ACTUAL dataset.

DATASET COLUMNS: ${JSON.stringify(columns)}
DATASET SAMPLE (${sampleData.length} rows from ${data.length} total):
${dataString}

LEAKAGE DETECTION RULES:
${JSON.stringify(leakage_rules)}

ANALYSIS REQUIREMENTS:
1. Find EVERY instance where products are sold below cost (net_price < cost)
2. Identify excessive discounts that erode margins
3. Calculate the ACTUAL financial impact per instance
4. Group leakage by type and severity
5. Identify specific product-customer pairs with issues

CRITICAL: Use ONLY actual data from the dataset. Extract real product IDs, customer IDs, prices, and costs. Calculate real loss amounts.

Return ONLY valid JSON in this exact format:
{
  "leakage_instances": <actual count of margin leaks found>,
  "revenue_impact": <total $ lost, calculated from actual data>,
  "leakage_types": {
    "below_cost_sales": {
      "count": <actual count where net_price < cost>,
      "impact": <$ amount lost>
    },
    "excessive_discounts": {
      "count": <actual count where discount > 50%>,
      "impact": <$ amount lost>
    },
    "low_margin_products": {
      "count": <actual count where margin < 5%>,
      "impact": <$ amount at risk>
    }
  },
  "top_leaks": [
    {
      "product_id": "<actual product ID from data>",
      "customer_id": "<actual customer ID from data>",
      "leak_type": "<below_cost_sale|excessive_discount|low_margin>",
      "net_price": <actual net_price from data>,
      "cost": <actual cost from data>,
      "list_price": <actual list_price if available>,
      "discount_pct": <calculated from data>,
      "loss_per_unit": <calculated: cost - net_price>,
      "quantity": <actual quantity from data>,
      "total_impact": <loss_per_unit * quantity>
    }
  ],
  "insights": [
    "<specific insight about actual leakage patterns>",
    "<which products/customers have the most leakage>",
    "<root cause analysis from the data>"
  ],
  "sql": "SELECT product_id, customer_id, net_price, cost, quantity, (cost - net_price) * quantity as total_loss FROM pricing_data WHERE net_price < cost OR (list_price - net_price) / list_price > 0.5 ORDER BY total_loss DESC LIMIT 100",
  "samples": [<array of 10-20 actual rows showing margin leakage>]
}`

    const model = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })

    logger.info("Calling Vertex AI (generateContent)", {
      request_id: requestId,
      user_id: clerkUserId,
      model: "gemini-2.0-flash-exp",
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
    const analysisRaw: string = responseText ?? ""

    let parsedAnalysis: any = null
    try {
      let jsonText = analysisRaw.trim()
      if (jsonText.includes("```json")) {
        const match = jsonText.match(/```json\s*([\s\S]*?)\s*```/)
        if (match) jsonText = match[1].trim()
      } else if (jsonText.includes("```")) {
        const match = jsonText.match(/```\s*([\s\S]*?)\s*```/)
        if (match) jsonText = match[1].trim()
      }

      parsedAnalysis = JSON.parse(jsonText)

      if (!parsedAnalysis.leakage_instances || !Array.isArray(parsedAnalysis.top_leaks)) {
        throw new Error("Invalid response structure from Gemini")
      }
    } catch (parseErr) {
      logger.error("Failed to parse Gemini leakage response as valid JSON", {
        request_id: requestId,
        error: String(parseErr),
        response_preview: analysisRaw.substring(0, 500),
      })
      return NextResponse.json(
        {
          error: "AI analysis failed to return valid leakage data",
          details: "The AI model did not return properly structured margin leakage analysis. Please try again.",
          raw_response: process.env.NODE_ENV === "development" ? analysisRaw : undefined,
        },
        { status: 500 },
      )
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
        step: "leakage_analysis",
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
    logger.error("Leakage analysis processing error", { request_id: requestId, ...details })
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
