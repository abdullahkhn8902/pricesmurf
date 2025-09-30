import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { connectToDatabase } from "@/lib/mongodb"
import logger from "@/lib/logger"
import { ObjectId, GridFSBucket } from "mongodb"
import { parse } from "csv-parse/sync"
import * as XLSX from "xlsx"
import { VertexAI } from "@google-cloud/vertexai"

// Helper to safely get message from unknown errors
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  try {
    return typeof err === "string" ? err : JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function maskSecret(secret: string) {
  if (!secret || typeof secret !== "string") return "N/A"
  if (secret.length <= 4) return "***" + secret
  return "***" + secret.slice(-4)
}

function extractFirstJsonObj(text: string): any | null {
  if (!text || typeof text !== "string") return null
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return null
  const candidate = text.slice(start, end + 1)
  try {
    return JSON.parse(candidate)
  } catch {
    try {
      return JSON.parse(candidate.replace(/'/g, '"'))
    } catch {
      return null
    }
  }
}

async function parseRequestBodySafely(request: Request): Promise<any> {
  try {
    return await request.json()
  } catch {
    try {
      const text = await request.text()
      if (!text) return {}
      return JSON.parse(text)
    } catch {
      return {}
    }
  }
}

function normalizeColumn(col: any) {
  return (String(col || "").trim() || "Unnamed").replace(/[^a-zA-Z0-9\s_-]/g, "")
}

function processBufferToColumnsData(buffer: Buffer, filename: string, contentType: string) {
  const processRow = (row: any[], columns: string[]) => {
    return columns.reduce((obj: Record<string, any>, col, i) => {
      obj[col] = row[i] !== undefined && row[i] !== null ? row[i] : ""
      return obj
    }, {})
  }

  const isCSV = () => {
    if (contentType && typeof contentType === "string") {
      if (contentType.toLowerCase().includes("csv")) return true
      if (contentType.toLowerCase().includes("excel") || contentType.toLowerCase().includes("spreadsheet")) return false
    }
    if (filename && typeof filename === "string") {
      const n = filename.toLowerCase()
      if (n.endsWith(".csv")) return true
      if (n.endsWith(".xlsx") || n.endsWith(".xls")) return false
    }
    return false
  }

  let columns: string[] = []
  let data: any[] = []

  if (isCSV()) {
    const records: any[] = parse(buffer.toString("utf8"), {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    })

    const rawHeader = Array.isArray(records) && records.length > 0 ? records[0] : []
    const hasIndexColumn = Array.isArray(rawHeader) && rawHeader.length > 0 && /^\d+$/.test(String(rawHeader[0]).trim())
    const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader
    columns = Array.isArray(rawColumns) ? rawColumns.map(normalizeColumn) : []
    data = Array.isArray(records)
      ? records.slice(1).map((row: any[]) => {
          const processed = hasIndexColumn ? row.slice(1) : row
          return processRow(processed, columns)
        })
      : []
  } else {
    const workbook = XLSX.read(buffer, { type: "buffer" })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" })

    const rawHeader = Array.isArray(jsonData) && jsonData.length > 0 ? jsonData[0] : []
    const hasIndexColumn = Array.isArray(rawHeader) && rawHeader.length > 0 && /^\d+$/.test(String(rawHeader[0]).trim())
    const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader
    columns = Array.isArray(rawColumns) ? rawColumns.map(normalizeColumn) : []
    data = Array.isArray(jsonData)
      ? jsonData.slice(1).map((row: any[]) => {
          const processed = hasIndexColumn ? row.slice(1) : row
          return processRow(processed, columns)
        })
      : []
  }

  return { columns, data }
}

// Vertex AI init (attempt once; if fails -> requests will error)
let vertexAI: VertexAI | null = null
try {
  const PROJECT = (process.env.VERTEX_AI_PROJECT || "").toString().trim()
  const LOCATION = (process.env.VERTEX_AI_LOCATION || "").toString().trim()
  if (PROJECT && LOCATION) {
    const API_ENDPOINT = `${LOCATION}-aiplatform.googleapis.com`
    vertexAI = new VertexAI({ project: PROJECT, location: LOCATION, apiEndpoint: API_ENDPOINT })
    logger.info("Vertex AI initialized successfully for margin validation route", {
      project: PROJECT,
      location: LOCATION,
    })
  } else {
    logger.error("Vertex AI configuration missing at module init for margin validation")
  }
} catch (err: unknown) {
  logger.error("Vertex AI initialization error in margin validation route", { error: getErrorMessage(err) })
}

// ---------- Margin-specific Gemini handlers ----------

/* Compact Margin Validation (Gemini-only) */
async function handleCompactMarginValidation(
  vertexAI: any,
  columns: string[],
  data: any[],
  runId?: string | null,
  usedSource?: string,
  requestId?: string,
  userId?: string | null,
) {
  const sampleRows = Array.isArray(data) ? data.slice(0, 10) : []
  const friendlyCols = Array.isArray(columns) ? columns.map(normalizeColumn) : []

  const prompt = [
    "You are an expert schema detector for margin analysis. Given column headers and sample rows, determine presence and mapping for the canonical fields: product_id, cost, net_price (or list_price, sale_price).",
    "OUTPUT RULES (MUST FOLLOW):",
    " - RETURN EXACTLY ONE LINE: valid JSON and NOTHING ELSE.",
    " - JSON MUST be an object with EXACT keys: product_id, cost, net_price.",
    ' - Each value MUST be an object: { "present": 1|0, "column": "column_name_or_null", "confidence": 0.0-1.0, "numeric_ratio"?: 0.0-1.0 }',
    " - For 'cost' and 'net_price', include numeric_ratio estimating fraction of sample rows that look numeric for the chosen column.",
    " - Accept synonyms: cost (unit_cost, product_cost), net_price (list_price, sale_price, price)",
    "EXAMPLE:",
    ' {"product_id":{"present":1,"column":"SKU","confidence":0.95}, "cost":{"present":1,"column":"Unit_Cost","confidence":0.9,"numeric_ratio":0.95}, "net_price":{"present":1,"column":"Sale_Price","confidence":0.92,"numeric_ratio":0.9}}',
    `Columns: ${JSON.stringify(friendlyCols)}`,
    `SampleRows: ${JSON.stringify(sampleRows)}`,
    "Return JSON only.",
  ].join("\n")

  if (!vertexAI) {
    logger.error("Vertex AI not initialized (margin compact)", { request_id: requestId })
    return NextResponse.json(
      {
        validation_passed: false,
        missing_columns: ["product_id", "cost", "net_price"],
        message: "Vertex AI not initialized",
      },
      { status: 500 },
    )
  }

  try {
    const model = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })
    const startTs = Date.now()
    logger.info("vertex_margin_validation_compact_start", {
      request_id: requestId,
      user_id: userId,
      masked_token: maskSecret(process.env.VERTEX_AI_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS || "sa-key"),
    })

    const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] })

    const analysis = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}"

    logger.info("vertex_margin_validation_compact_end", {
      request_id: requestId,
      duration_ms: Date.now() - startTs,
      analysis_length: analysis.length,
    })

    const parsed = extractFirstJsonObj(analysis)
    if (!parsed || typeof parsed !== "object") {
      logger.error("margin compact: Gemini returned invalid JSON", { request_id: requestId, raw: analysis })
      return NextResponse.json(
        {
          validation_passed: false,
          missing_columns: ["product_id", "cost", "net_price"],
          message: "Vertex AI returned invalid JSON",
        },
        { status: 502 },
      )
    }

    const readField = (k: string) => {
      const v = parsed[k]
      if (!v || typeof v !== "object") return { present: 0, column: null, confidence: 0, numeric_ratio: undefined }
      return {
        present: v.present ? 1 : 0,
        column: v.column ?? null,
        confidence: Number(v.confidence ?? 0) || 0,
        numeric_ratio: typeof v.numeric_ratio === "number" ? v.numeric_ratio : undefined,
      }
    }

    const productField = readField("product_id")
    const costField = readField("cost")
    const priceField = readField("net_price")

    const compactResult = {
      product_id: productField.present ? 1 : 0,
      cost: costField.present ? 1 : 0,
      net_price: priceField.present ? 1 : 0,
    }

    const details = { product_id: productField, cost: costField, net_price: priceField }

    const missing: string[] = []
    if (!productField.present) missing.push("product_id")
    if (!costField.present) missing.push("cost")
    if (!priceField.present) missing.push("net_price")

    const validation_passed = missing.length === 0

    const response = {
      ...compactResult,
      validation_passed,
      validation_flag: validation_passed ? 1 : 0,
      missing_columns: missing,
      message: validation_passed
        ? "Validation passed (via Vertex AI)"
        : `This table is missing ${missing.join(", ")} for Margin Leakage Agent.`,
      details,
      columns: friendlyCols,
      source: "vertex_ai",
    }

    if (process.env.NODE_ENV === "development") {
      ;(response as any)._debug = { rawAnalysis: analysis?.slice(0, 2000) }
      logger.info("margin compact debug", { request_id: requestId, debug: (response as any)._debug })
    }

    if (runId) {
      try {
        const { db } = await connectToDatabase()
        await db.collection("margin_analyses").updateOne(
          { runId },
          {
            $set: {
              "steps.validation_compact": {
                status: validation_passed ? "done" : "failed",
                compactResult: response,
                source: "vertex_ai",
                raw: analysis,
              },
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        )
      } catch (e: unknown) {
        logger.error("persist margin compact (vertex) failed", { error: getErrorMessage(e) })
      }
    }

    return NextResponse.json(response)
  } catch (err: unknown) {
    logger.error("Vertex AI margin compact validation error (no fallback)", {
      request_id: requestId,
      error: getErrorMessage(err),
    })
    return NextResponse.json(
      {
        validation_passed: false,
        missing_columns: ["product_id", "cost", "net_price"],
        message: `Vertex AI error: ${getErrorMessage(err)}`,
      },
      { status: 502 },
    )
  }
}

/* Full Margin Validation (Gemini-only) */
async function handleFullMarginValidation(
  vertexAI: any,
  columns: string[],
  data: any[],
  runId?: string | null,
  usedSource?: string,
  requestId?: string,
  userId?: string | null,
) {
  const sampleRows = Array.isArray(data) ? data.slice(0, 50) : []
  const friendlyCols = Array.isArray(columns) ? columns.map(normalizeColumn) : []

  const prompt = [
    "You are an expert data validation specialist for margin analysis. Given column headers and sample rows, MAP required canonical fields to column headers and provide presence, confidences, and numeric evidence for cost and price fields.",
    "OUTPUT RULES (MUST FOLLOW):",
    " - RETURN EXACTLY ONE valid JSON object and NOTHING ELSE.",
    " - JSON MUST follow EXACT structure:",
    `{
      "mapping": { "product_id":"column_name_or_null", "cost":"column_name_or_null", "net_price":"column_name_or_null" },
      "presence": { "product_id":1|0, "cost":1|0, "net_price":1|0 },
      "confidence": { "product_id":0.0-1.0, "cost":0.0-1.0, "net_price":0.0-1.0 },
      "numeric_evidence": { "cost":0.0-1.0, "net_price":0.0-1.0 }
    }`,
    " - mapping values should be exact column headers from the Columns list when possible, or null.",
    " - Accept synonyms: cost (unit_cost, product_cost), net_price (list_price, sale_price, price)",
    `Columns: ${JSON.stringify(friendlyCols)}`,
    `SampleRows (first 50): ${JSON.stringify(sampleRows)}`,
    "Return JSON only.",
  ].join("\n")

  if (!vertexAI) {
    logger.error("Vertex AI not initialized (margin full)", { request_id: requestId })
    return NextResponse.json(
      {
        validation_passed: false,
        missing_columns: ["product_id", "cost", "net_price"],
        message: "Vertex AI not initialized",
      },
      { status: 500 },
    )
  }

  try {
    const model = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })
    const startTs = Date.now()
    logger.info("vertex_margin_validation_full_start", {
      request_id: requestId,
      user_id: userId,
      masked_token: maskSecret(process.env.VERTEX_AI_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS || "sa-key"),
    })

    const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
    const analysis = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}"

    logger.info("vertex_margin_validation_full_end", {
      request_id: requestId,
      duration_ms: Date.now() - startTs,
      analysis_length: analysis.length,
    })

    const parsed = extractFirstJsonObj(analysis)
    if (!parsed || typeof parsed !== "object" || !parsed.mapping || !parsed.presence) {
      logger.error("margin full: Gemini returned invalid structure", { request_id: requestId, raw: analysis })
      return NextResponse.json(
        {
          validation_passed: false,
          missing_columns: ["product_id", "cost", "net_price"],
          message: "Vertex AI returned invalid JSON structure",
        },
        { status: 502 },
      )
    }

    const mappingFromVertex = parsed.mapping || {}
    const presenceFromVertex = parsed.presence || {}
    const confidenceFromVertex = parsed.confidence || {}
    const numericEvidenceFromVertex = parsed.numeric_evidence || {}

    const mapping: Record<string, string | null> = {
      product_id: mappingFromVertex.product_id ?? null,
      cost: mappingFromVertex.cost ?? null,
      net_price: mappingFromVertex.net_price ?? null,
    }

    const mapping_confidence: Record<string, number> = {
      product_id: Number(confidenceFromVertex.product_id ?? 0) || 0,
      cost: Number(confidenceFromVertex.cost ?? 0) || 0,
      net_price: Number(confidenceFromVertex.net_price ?? 0) || 0,
    }

    const presence = {
      product_id: presenceFromVertex.product_id ? 1 : 0,
      cost: presenceFromVertex.cost ? 1 : 0,
      net_price: presenceFromVertex.net_price ? 1 : 0,
    }

    const numeric_evidence = {
      cost: Number(numericEvidenceFromVertex.cost ?? null),
      net_price: Number(numericEvidenceFromVertex.net_price ?? null),
    }

    const missing: string[] = []
    if (!presence.product_id) missing.push("product_id")
    if (!presence.cost) missing.push("cost")
    if (!presence.net_price) missing.push("net_price")

    const validation_passed = missing.length === 0

    const responseObj: any = {
      validation_passed,
      validation_flag: validation_passed ? 1 : 0,
      missing_columns: missing,
      message: validation_passed
        ? "Validation passed (via Vertex AI)"
        : `This table is missing ${missing.join(", ")} for Margin Leakage Agent.`,
      mapping,
      mapping_confidence,
      presence,
      numeric_evidence,
      rows_preview: Array.isArray(data) ? data.length : 0,
      columns: friendlyCols,
      usedSource,
      source: "vertex_ai",
    }

    if (process.env.NODE_ENV === "development") {
      responseObj._debug = { rawAnalysis: analysis?.slice(0, 2000) }
      logger.info("margin full debug", { request_id: requestId, debug: responseObj._debug })
    }

    if (runId) {
      try {
        const { db } = await connectToDatabase()
        await db.collection("margin_analyses").updateOne(
          { runId },
          {
            $set: {
              steps: {
                validation: {
                  status: validation_passed ? "success" : "failed",
                  mapping,
                  missing,
                  message: responseObj.message,
                  usedSource,
                  source: "vertex_ai",
                  raw: analysis?.slice(0, 2000),
                },
              },
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        )
      } catch (e: unknown) {
        logger.error("persist margin full validation failed", { error: getErrorMessage(e) })
      }
    }

    return NextResponse.json(responseObj)
  } catch (err: unknown) {
    logger.error("Vertex AI margin full validation error (no fallback)", {
      request_id: requestId,
      error: getErrorMessage(err),
    })
    return NextResponse.json(
      {
        validation_passed: false,
        missing_columns: ["product_id", "cost", "net_price"],
        message: `Vertex AI error: ${getErrorMessage(err)}`,
      },
      { status: 502 },
    )
  }
}

// ---------- POST handler (uses Gemini-only handlers) ----------
export async function POST(request: Request) {
  const requestId = (request.headers.get("x-request-id") || `req_${Date.now()}`).toString()
  const userId = request.headers.get("x-clerk-user-id") || "unknown"

  logger.info("POST /api/validate-margin called", {
    request_id: requestId,
    user_id: userId,
    path: request.url,
    method: "POST",
  })

  // require Vertex config to be present server-side
  const VERTEX_AI_PROJECT = (process.env.VERTEX_AI_PROJECT || "").toString().trim()
  const VERTEX_AI_LOCATION = (process.env.VERTEX_AI_LOCATION || "").toString().trim()
  if (!VERTEX_AI_PROJECT || !VERTEX_AI_LOCATION) {
    logger.error("Vertex AI configuration missing in margin validation route", { request_id: requestId })
    return NextResponse.json({ error: "Vertex AI configuration missing in environment variables" }, { status: 500 })
  }

  try {
    const authRes = getAuth(request as any)
    const clerkUserId: string | null = authRes?.userId ?? null
    if (!clerkUserId) {
      logger.warn("No Clerk userId present for /api/validate-margin request", { request_id: requestId })
    }

    const body: any = await parseRequestBodySafely(request)
    const url = new URL(request.url)
    const qFileId = url.searchParams.get("fileId") ?? undefined

    const fileId: string | undefined =
      body?.fileId !== undefined && body.fileId !== null ? String(body.fileId) : qFileId
    const filenameFromBody: string | undefined = body?.filename ? String(body.filename) : undefined
    const runId: string | undefined | null = body?.runId ?? body?.runID ?? body?.run_id
    const compact = body?.compact === true || body?.compact === "true"

    // prefer inline preview if provided
    let columns: string[] = Array.isArray(body?.columns) ? body.columns.map(normalizeColumn) : []
    let data: any[] = Array.isArray(body?.data) ? body.data : []
    let usedSource = body?.source ?? "inline"

    // if not inline and fileId provided, try to fetch file from GridFS (optional)
    if ((!columns || columns.length === 0) && fileId) {
      try {
        const { db, client } = await connectToDatabase()
        const filesColl = db.collection("fs.files")
        const fileDoc = await filesColl.findOne({ _id: new ObjectId(String(fileId)) })
        if (fileDoc) {
          const bucket = new GridFSBucket(db)
          const downloadStream = bucket.openDownloadStream(fileDoc._id)
          const chunks: Buffer[] = []
          await new Promise<void>((resolve, reject) => {
            downloadStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
            downloadStream.on("error", (err) => reject(err))
            downloadStream.on("end", () => resolve())
          })
          const buffer = Buffer.concat(chunks)
          const { columns: parsedCols, data: parsedData } = processBufferToColumnsData(
            buffer,
            fileDoc.filename ?? filenameFromBody ?? "file",
            fileDoc.contentType ?? "",
          )
          columns = parsedCols
          data = parsedData
          usedSource = `gridfs:${fileId}`
        } else {
          logger.warn("fileId provided but file not found in fs.files", { request_id: requestId, fileId })
        }
      } catch (e: unknown) {
        logger.error("failed to fetch file preview from GridFS", { request_id: requestId, error: getErrorMessage(e) })
        return NextResponse.json(
          {
            validation_passed: false,
            missing_columns: [],
            message: `Failed to load file preview: ${getErrorMessage(e)}`,
          },
          { status: 400 },
        )
      }
    }

    // require columns/data for Gemini validation
    if (!Array.isArray(columns) || columns.length === 0) {
      logger.error("No columns available for margin validation", { request_id: requestId })
      return NextResponse.json(
        { validation_passed: false, missing_columns: [], message: "No columns provided for validation" },
        { status: 400 },
      )
    }

    // ensure vertexAI object exists
    if (!vertexAI) {
      // attempt late init once
      try {
        vertexAI = new VertexAI({
          project: VERTEX_AI_PROJECT,
          location: VERTEX_AI_LOCATION,
          apiEndpoint: `${VERTEX_AI_LOCATION}-aiplatform.googleapis.com`,
        })
        logger.info("Vertex AI late-init successful for margin validation", {
          request_id: requestId,
          user_id: clerkUserId,
        })
      } catch (initErr: unknown) {
        logger.error("Vertex AI late-init error in margin validation", {
          request_id: requestId,
          user_id: clerkUserId,
          error: getErrorMessage(initErr),
        })
        // **NO FALLBACK** — return error
        return NextResponse.json(
          { validation_passed: false, missing_columns: [], message: "Vertex AI initialization failed" },
          { status: 500 },
        )
      }
    }

    // call Gemini-only handlers
    if (compact) {
      return await handleCompactMarginValidation(vertexAI, columns, data, runId, usedSource, requestId, clerkUserId)
    } else {
      return await handleFullMarginValidation(vertexAI, columns, data, runId, usedSource, requestId, clerkUserId)
    }
  } catch (err: unknown) {
    const errMsg = getErrorMessage(err)
    logger.error("validate-margin endpoint error", {
      request_id: requestId,
      error: errMsg,
      stack: err instanceof Error ? err.stack : undefined,
    })
    return NextResponse.json(
      { validation_passed: false, missing_columns: [], message: "Internal server error", details: errMsg },
      { status: 500 },
    )
  }
}
