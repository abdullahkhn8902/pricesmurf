import { MongoClient, ObjectId, GridFSBucket } from "mongodb"
import { auth } from "@clerk/nextjs/server"
import { parse } from "csv-parse/sync"
import * as XLSX from "xlsx"
import { NextResponse } from "next/server"
import { VertexAI } from "@google-cloud/vertexai"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"

let vertexAI
try {
  const PROJECT = (process.env.VERTEX_AI_PROJECT || "neural-land-469712-t7").toString().trim()
  const LOCATION = (process.env.VERTEX_AI_LOCATION || "us-central1").toString().trim()
  const API_ENDPOINT = `${LOCATION}-aiplatform.googleapis.com`

  vertexAI = new VertexAI({
    project: PROJECT,
    location: LOCATION,
    apiEndpoint: API_ENDPOINT,
  })
  logger.info("Vertex AI initialized successfully", { project: PROJECT, location: LOCATION })
} catch (error) {
  logger.error("Vertex AI initialization error", { error: error?.message || String(error) })
}

async function processFileData(buffer, filename, contentType) {
  let columns = []
  let data = []

  const processRow = (row, columns) => {
    return columns.reduce((obj, col, i) => {
      obj[col] = row[i]?.toString()?.trim() || ""
      return obj
    }, {})
  }

  const isCSV = () => {
    if (contentType && typeof contentType === "string") {
      if (contentType.toLowerCase().includes("csv")) return true
      if (contentType.includes("excel") || contentType.includes("spreadsheet")) return false
    }
    if (filename && typeof filename === "string") {
      const lowerName = filename.toLowerCase()
      if (lowerName.endsWith(".csv")) return true
    }
    return false
  }

  if (isCSV()) {
    const records = parse(buffer.toString(), {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    })

    const rawHeader = records[0] || []
    const hasIndexColumn = typeof rawHeader[0] === "number"
    const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader

    columns = rawColumns.map((col) => {
      const colText = col?.toString()?.trim() || "Unnamed"
      return colText.replace(/[^a-zA-Z0-9\s_-]/g, "")
    })

    data = records.slice(1).map((row) => {
      const processedRow = hasIndexColumn ? row.slice(1) : row
      return processRow(processedRow, columns)
    })
  } else {
    const workbook = XLSX.read(buffer, { type: "buffer" })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" })

    const rawHeader = jsonData[0] || []
    const hasIndexColumn = typeof rawHeader[0] === "number"
    const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader

    columns = rawColumns.map((col) => {
      const colText = col?.toString()?.trim() || "Unnamed"
      return colText.replace(/[^a-zA-Z0-9\s_-]/g, "")
    })

    data = jsonData.slice(1).map((row) => {
      const processedRow = hasIndexColumn ? row.slice(1) : row
      return processRow(processedRow, columns)
    })
  }

  return { columns, data }
}

function maskSecret(secret) {
  if (!secret || typeof secret !== "string") return "N/A"
  if (secret.length <= 4) return "***" + secret
  return "***" + secret.slice(-4)
}

export async function POST(request) {
  const requestId = request.headers.get("x-request-id") || "unknown"
  const incomingUserId = request.headers.get("x-clerk-user-id") || "unknown"

  logger.info("Margin pricing analysis request received", {
    request_id: requestId,
    user_id: incomingUserId,
    path: request.url,
    method: "POST",
  })

  const uri = process.env.MONGODB_URI
  const VERTEX_AI_PROJECT = (process.env.VERTEX_AI_PROJECT || "neural-land-469712-t7").toString().trim()
  const VERTEX_AI_LOCATION = (process.env.VERTEX_AI_LOCATION || "us-central1").toString().trim()

  if (!uri) {
    logger.error("MongoDB URI missing", { request_id: requestId, user_id: incomingUserId })
    return NextResponse.json({ error: "MONGODB_URI missing in environment variables" }, { status: 500 })
  }

  if (!VERTEX_AI_PROJECT || !VERTEX_AI_LOCATION) {
    logger.error("Vertex AI configuration missing", { request_id: requestId, user_id: incomingUserId })
    return NextResponse.json({ error: "Vertex AI configuration missing in environment variables" }, { status: 500 })
  }

  const client = new MongoClient(uri)

  try {
    await client.connect()
    logger.info("MongoDB connected successfully", { request_id: requestId, user_id: incomingUserId })

    // Authenticate early
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      logger.warn("Unauthorized access attempt", { request_id: requestId })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const db = client.db("Project0")
    const bucket = new GridFSBucket(db, { bucketName: "excelFiles" })

    // Parse request body safely and read query params
    const body = await request.json().catch((e) => ({}))
    const { searchParams } = new URL(request.url || "")
    const queryFileId = searchParams.get("fileId")

    // Prefer query param, fallback to body.fileId or body.id
    const incomingFileId = queryFileId || body.fileId || body.id || null
    const filenameFallback = body.filename || body.fileName || null

    // Log what we received
    logger.info("Received file identifier", {
      request_id: requestId,
      user_id: clerkUserId,
      queryFileId,
      bodyFileId: body.fileId ?? null,
      filenameFallback,
    })

    // Resolve file query: by ObjectId _id OR by filename
    let fileQuery = null
    if (incomingFileId && ObjectId.isValid(incomingFileId)) {
      fileQuery = { _id: new ObjectId(incomingFileId), "metadata.userId": clerkUserId }
    } else if (filenameFallback || incomingFileId) {
      const filenameToFind = (filenameFallback || incomingFileId).toString()
      fileQuery = { filename: filenameToFind, "metadata.userId": clerkUserId }
    } else {
      logger.warn("Invalid or missing file identifier", {
        request_id: requestId,
        user_id: clerkUserId,
        file_id: incomingFileId,
      })
      return NextResponse.json({ error: "Invalid file ID" }, { status: 400 })
    }

    // Get file metadata
    const filesCollection = db.collection("excelFiles.files")
    const file = await filesCollection.findOne(fileQuery)

    if (!file) {
      logger.warn("File not found", { request_id: requestId, user_id: clerkUserId, file_query: fileQuery })
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const resolvedFileId = file._id // MongoDB ObjectId
    logger.info("File found, downloading content", {
      request_id: requestId,
      user_id: clerkUserId,
      file_id: resolvedFileId?.toString?.() ?? String(resolvedFileId),
      filename: file.filename,
    })

    // Download file content using resolved _id
    const downloadStream = bucket.openDownloadStream(resolvedFileId)
    const chunks = []
    for await (const chunk of downloadStream) chunks.push(chunk)
    if (!chunks.length) {
      logger.warn("Downloaded file had no data", {
        request_id: requestId,
        user_id: clerkUserId,
        file_id: resolvedFileId?.toString?.() ?? String(resolvedFileId),
      })
      return NextResponse.json({ error: "Downloaded file is empty" }, { status: 400 })
    }
    const buffer = Buffer.concat(chunks)

    // Process file data
    const filename = file.filename || "unknown"
    const contentType = file.contentType || "application/octet-stream"
    const { columns, data } = await processFileData(buffer, filename, contentType)

    if (!columns.length || !data.length) {
      logger.warn("No valid data found in file", {
        request_id: requestId,
        user_id: clerkUserId,
        file_id: resolvedFileId?.toString?.() ?? String(resolvedFileId),
      })
      return NextResponse.json({ error: "No valid data found" }, { status: 400 })
    }

    logger.info("File processed successfully", {
      request_id: requestId,
      user_id: clerkUserId,
      file_id: resolvedFileId?.toString?.() ?? String(resolvedFileId),
      columns_count: columns.length,
      rows_count: data.length,
    })

    // Ensure vertexAI is initialized (late-init if needed)
    if (!vertexAI) {
      try {
        vertexAI = new VertexAI({
          project: VERTEX_AI_PROJECT,
          location: VERTEX_AI_LOCATION,
          apiEndpoint: `${VERTEX_AI_LOCATION}-aiplatform.googleapis.com`,
        })
        logger.info("Vertex AI late-init successful", { request_id: requestId, user_id: clerkUserId })
      } catch (initErr) {
        logger.error("Vertex AI late-init error", {
          request_id: requestId,
          user_id: clerkUserId,
          error: initErr?.message || String(initErr),
        })
        throw new Error("Vertex AI not initialized and late-init failed")
      }
    }

    const sampleRows = data.slice(0, 200)
    const dataString = JSON.stringify({ columns, data: sampleRows }, null, 2)

    const analyze_fields = body?.analyze_fields ?? ["list_price", "net_price", "discount_pct", "cost"]
    const price_thresholds = body?.price_thresholds ?? {}
    const customPrompt = body?.customPrompt ?? null

    const prompt =
      (customPrompt && customPrompt.toString().trim()) ||
      `You are an expert pricing analyst. Analyze the pricing structure and discount patterns from this ACTUAL dataset.

DATASET COLUMNS: ${JSON.stringify(columns)}
DATASET SAMPLE (${sampleRows.length} rows from ${data.length} total):
${dataString}

ANALYSIS REQUIREMENTS:
1. Calculate REAL pricing metrics from the actual data
2. Identify discount patterns and anomalies
3. Find products with excessive discounts
4. Analyze price-cost relationships
5. Provide specific insights based on actual numbers

CRITICAL: Use ONLY the actual data provided. Calculate real averages, identify real products with issues.

Return ONLY valid JSON in this exact format:
{
  "total_products": <actual count from data>,
  "avg_list_price": <calculated from actual list_price values>,
  "avg_net_price": <calculated from actual net_price values>,
  "avg_discount_pct": <calculated from actual data>,
  "price_range": {
    "min": <actual minimum price>,
    "max": <actual maximum price>
  },
  "discount_distribution": {
    "0-10%": <count of products>,
    "10-25%": <count>,
    "25-50%": <count>,
    "50%+": <count>
  },
  "high_discount_products": [
    {
      "product_id": "<actual product ID>",
      "list_price": <actual value>,
      "net_price": <actual value>,
      "discount_pct": <calculated>,
      "quantity": <actual if available>
    }
  ],
  "pricing_insights": [
    "<specific insight about actual pricing patterns>",
    "<discount anomalies found in real data>",
    "<actionable recommendation>"
  ],
  "sql": "SELECT product_id, list_price, net_price, (list_price - net_price) / list_price * 100 as discount_pct FROM pricing_data WHERE (list_price - net_price) / list_price > 0.25 ORDER BY discount_pct DESC LIMIT 50",
  "samples": [<array of 5-10 actual rows with pricing issues>]
}`

    const model = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })

    logger.info("Calling Vertex AI for pricing analysis", {
      request_id: requestId,
      user_id: clerkUserId,
      model: "gemini-2.0-flash-exp",
    })

    const startTs = Date.now()
    logger.info("vertex_call_start", {
      request_id: requestId,
      user_id: clerkUserId,
      model: "gemini-2.0-flash-exp",
      masked_token: maskSecret(process.env.VERTEX_AI_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS || "sa-key"),
      note: "pricing_analysis_start",
    })

    let result
    try {
      result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      })

      const response = result?.response || null
      const rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "No analysis generated"

      const usage = response?.usageMetadata ?? response?.usage_metadata ?? response?.usage ?? null
      const promptTokens = usage?.promptTokenCount ?? usage?.prompt_token_count ?? usage?.prompt_tokens ?? null
      const candidatesTokens =
        usage?.candidatesTokenCount ?? usage?.candidates_token_count ?? usage?.candidates_tokens ?? null
      const totalTokens =
        usage?.totalTokenCount ?? usage?.total_token_count ?? (Number(promptTokens) + Number(candidatesTokens) || null)

      const durationMs = Date.now() - startTs

      logger.info("Vertex AI pricing analysis successful", {
        request_id: requestId,
        user_id: clerkUserId,
        model: "gemini-2.0-flash-exp",
        duration_ms: durationMs,
        prompt_tokens: promptTokens,
        candidates_tokens: candidatesTokens,
        total_tokens: totalTokens,
        usage_raw: process.env.NODE_ENV === "development" ? usage : undefined,
        note: "pricing_analysis_success",
      })

      let analysisObj = null
      try {
        let jsonText = rawText.trim()
        if (jsonText.includes("```json")) {
          const match = jsonText.match(/```json\s*([\s\S]*?)\s*```/)
          if (match) jsonText = match[1].trim()
        } else if (jsonText.includes("```")) {
          const match = jsonText.match(/```\s*([\s\S]*?)\s*```/)
          if (match) jsonText = match[1].trim()
        }

        analysisObj = JSON.parse(jsonText)

        if (!analysisObj.total_products) {
          throw new Error("Invalid pricing analysis structure")
        }
      } catch (parseErr) {
        logger.error("Failed to parse pricing analysis", {
          request_id: requestId,
          user_id: clerkUserId,
          parse_error: parseErr?.message || String(parseErr),
          response_preview: rawText.substring(0, 500),
        })

        return NextResponse.json(
          {
            error: "AI pricing analysis failed",
            details: "The AI model did not return valid pricing analysis. Please try again.",
            raw_response: process.env.NODE_ENV === "development" ? rawText : undefined,
          },
          { status: 500 },
        )
      }

      // Store analysis into DB - use resolvedFileId from the file doc
      try {
        await db
          .collection("pricingAnalyses")
          .updateOne(
            { fileId: resolvedFileId, userId: clerkUserId },
            { $set: { analysis: analysisObj, updatedAt: new Date(), model: "gemini-2.0-flash-exp" } },
            { upsert: true },
          )
        logger.info("Analysis stored in database", {
          request_id: requestId,
          user_id: clerkUserId,
          file_id: resolvedFileId?.toString?.() ?? String(resolvedFileId),
        })
      } catch (dbErr) {
        logger.error("Failed to store analysis in DB", {
          request_id: requestId,
          user_id: clerkUserId,
          error: dbErr?.message || String(dbErr),
        })
      }

      try {
        const durationMs = Date.now() - startTs
        logger.info("vertex_call_end", {
          request_id: requestId,
          user_id: clerkUserId,
          model: "gemini-2.0-flash-exp",
          duration_ms: durationMs,
          analysis_length: rawText.length,
          note: "vertex_call_end",
        })
      } catch (logErr) {
        logger.error("vertex_call_end_logging_error", {
          request_id: requestId,
          error: logErr?.message || String(logErr),
        })
      }

      const sheetName = filename.includes(".") ? filename.split(".")[0] : "Unnamed Sheet"

      logger.info("Pricing analysis completed successfully", {
        request_id: requestId,
        user_id: clerkUserId,
        file_id: resolvedFileId?.toString?.() ?? String(resolvedFileId),
        columns_count: columns.length,
        rows_count: data.length,
      })

      return NextResponse.json(
        {
          status: "success",
          sheetName,
          columns,
          data: data.slice(0, 100),
          analysis: analysisObj,
        },
        { status: 200 },
      )
    } catch (vErr) {
      const durationMs = Date.now() - startTs
      logger.error("vertex_call_error", {
        request_id: requestId,
        user_id: clerkUserId,
        model: "gemini-2.0-flash-exp",
        duration_ms: durationMs,
        error: vErr?.message || String(vErr),
        note: "pricing_analysis_error",
      })
      throw vErr
    }
  } catch (error) {
    logger.error("Pricing analysis processing error", {
      request_id: requestId,
      user_id: incomingUserId,
      error: error?.message || String(error),
      stack: error?.stack,
    })

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error?.message || String(error),
        ...(process.env.NODE_ENV === "development" && { stack: error?.stack }),
      },
      { status: 500 },
    )
  } finally {
    try {
      await client.close()
      logger.info("Database connection closed", { request_id: requestId, user_id: incomingUserId })
    } catch (closeErr) {
      logger.error("Error closing DB client", { request_id: requestId, error: closeErr?.message || String(closeErr) })
    }
  }
}
