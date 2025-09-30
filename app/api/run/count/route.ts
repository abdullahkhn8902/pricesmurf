import { NextResponse } from 'next/server'
import { getAuth } from '@clerk/nextjs/server'
import logger from '@/lib/logger'
import { ObjectId, GridFSBucket } from 'mongodb'
import { VertexAI } from '@google-cloud/vertexai'

/**
 * Dynamically import lib/mongodb and return connectToDatabase (supports named or default export)
 */
async function loadConnectToDatabase(): Promise<any> {
  const mod: any = await import('@/lib/mongodb')
  const fn = mod?.connectToDatabase ?? mod?.default
  if (typeof fn !== 'function') throw new Error('connectToDatabase not found in lib/mongodb')
  return fn
}

/**
 * Dynamically import fileProcessor and return processFileBuffer (your file exports this name)
 */
async function loadProcessFileBuffer(): Promise<(buffer: Buffer, filename?: string, contentType?: string) => Promise<{ columns: string[]; data: any[] }> | { columns: string[]; data: any[] }> {
  const modAny: any = await import('@/lib/fileProcessor')
  const fn =
    modAny?.processFileBuffer ??
    (modAny?.default && modAny.default.processFileBuffer) ??
    modAny?.default
  if (typeof fn !== 'function') throw new Error('processFileBuffer not found in lib/fileProcessor')
  return fn
}

/* ---------- Gemini (Vertex AI) helper ---------- */
async function initVertexAIOrThrow() {
  const PROJECT = (process.env.VERTEX_AI_PROJECT || '').toString().trim()
  const LOCATION = (process.env.VERTEX_AI_LOCATION || '').toString().trim()
  if (!PROJECT || !LOCATION) throw new Error('Vertex AI configuration missing')
  const API_ENDPOINT = `${LOCATION}-aiplatform.googleapis.com`
  return new VertexAI({ project: PROJECT, location: LOCATION, apiEndpoint: API_ENDPOINT })
}

/**
 * Call Gemini (Vertex) with a small retry loop. Returns { raw, result } where raw is the text.
 */
async function callGeminiWithRetry(model: any, prompt: string, requestId?: string, attempts = 2) {
  let lastRaw = ''
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
      const raw = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      lastRaw = String(raw).trim()
      if (lastRaw.includes('{')) {
        return { raw: lastRaw, result }
      }
      // otherwise try one re-prompt if allowed
      if (attempt < attempts) {
        const rePrompt = prompt + "\n\nREMINDER: Return valid JSON only, nothing else."
        const r2 = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: rePrompt }] }] })
        const raw2 = r2?.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        lastRaw = String(raw2).trim()
        if (lastRaw.includes('{')) return { raw: lastRaw, result: r2 }
      }
    } catch (e: any) {
      logger.warn('callGeminiWithRetry attempt failed', { request_id: requestId, attempt, error: String(e?.message ?? e) })
      lastRaw = lastRaw || String(e?.message ?? e)
      // continue to next attempt
    }
  }
  return { raw: lastRaw, result: null }
}

/* JSON extractor similar to your other routes */
function extractFirstJsonObj(text: string): any | null {
  if (!text || typeof text !== 'string') return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
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

/* Helper to normalize processed rows into array of objects { colName: value } */
function normalizeRows(columns: string[], data: any[]): Record<string, any>[] {
  const normalized: Record<string, any>[] = []
  const cols = Array.isArray(columns) ? columns : []
  if (!Array.isArray(data)) return normalized

  for (const row of data) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      normalized.push(row as Record<string, any>)
    } else if (Array.isArray(row)) {
      const obj: Record<string, any> = {}
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i] ?? `col_${i}`
        obj[col] = row[i] ?? null
      }
      normalized.push(obj)
    } else {
      // primitive or unexpected: put into a single-column object
      const colName = cols[0] ?? 'value'
      normalized.push({ [colName]: row })
    }
  }
  return normalized
}

/* ---------- POST handler (Gemini-only counting) ---------- */
export async function POST(request: Request) {
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`
  let clientToClose: any = null

  try {
    // Auth check
    const { userId } = getAuth(request as any)
    if (!userId) {
      logger.warn('Unauthorized call to /api/run/count', { request_id: requestId })
      return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 })
    }

    // parse body safely
    let body: any = {}
    try { body = await request.json() } catch { body = {} }
    const { fileId, runId } = body ?? {}
    if (!fileId || typeof fileId !== 'string') {
      return NextResponse.json({ status: 'error', error: 'fileId required' }, { status: 400 })
    }

    // dynamic imports
    const connectToDatabase = await loadConnectToDatabase()
    const processFileBuffer = await loadProcessFileBuffer()

    // Connect
    const conn = await connectToDatabase()
    const { client, db } = conn
    clientToClose = client

    if (!ObjectId.isValid(fileId)) {
      logger.warn('Invalid ObjectId in /api/run/count', { request_id: requestId, fileId, userId })
      return NextResponse.json({ status: 'error', error: 'Invalid fileId' }, { status: 400 })
    }

    // find file doc and ensure ownership
    const filesColl = db.collection('excelFiles.files')
    const fileDoc = await filesColl.findOne({ _id: new ObjectId(fileId), 'metadata.userId': userId })
    if (!fileDoc) {
      return NextResponse.json({ status: 'error', error: 'File not found' }, { status: 404 })
    }

    // stream file from GridFS
    const bucket = new GridFSBucket(db, { bucketName: 'excelFiles' })
    const download = bucket.openDownloadStream(new ObjectId(fileId))
    const chunks: Buffer[] = []
    for await (const chunk of download) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    // call your processor (supports async or sync)
    const processed = await Promise.resolve(processFileBuffer(buffer, fileDoc.filename || 'file', fileDoc.contentType || ''))
    const columns = Array.isArray(processed?.columns) ? processed.columns : []
    const data = Array.isArray(processed?.data) ? processed.data : []
    const usedSource = `gridfs:${fileId}`

    // Normalize rows for samples and all_rows output
    const normalizedRows = normalizeRows(columns, data)

    // ---------------- Gemini-only counting ----------------
    // Initialize Vertex AI (Gemini)
    let vertexAI: any
    try {
      vertexAI = await initVertexAIOrThrow()
    } catch (e: any) {
      logger.error('Vertex AI init failed (count)', { request_id: requestId, error: String(e?.message ?? e) })
      return NextResponse.json({ status: 'error', error: 'Vertex AI not configured' }, { status: 500 })
    }

    const model = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    // Cap the number of sample rows included in the prompt to avoid enormous prompts.
    const SAMPLE_ROW_CAP = 2000
    const sampleRowsForPrompt = data.slice(0, SAMPLE_ROW_CAP)

    const prompt = [
      "You are a precise data inspector. Given the Columns list and the full dataset rows (JSON array), RETURN ONLY a single-line valid JSON object with EXACT keys: rows, cols.",
      "Definitions:",
      " - rows: integer number of data rows (count any non-empty row).",
      " - cols: integer number of columns (length of the Columns list).",
      "REQUIREMENTS:",
      " - Output EXACTLY: {\"rows\": <integer>, \"cols\": <integer>} and NOTHING ELSE (no commentary, no code fences).",
      " - Use the provided data only (do not assume external info).",
      `Columns: ${JSON.stringify(columns)}`,
      `SampleRows (first ${sampleRowsForPrompt.length} rows): ${JSON.stringify(sampleRowsForPrompt)}`,
      "If you cannot parse the input or the result is ambiguous, still respond with rows and cols as integers (0 if unknown).",
      "Return JSON only."
    ].join("\n")

    // Call Gemini (2 attempts max)
    const { raw, result: gemResult } = await callGeminiWithRetry(model, prompt, requestId, 2)
    const analysis = (raw || "{}").trim()
    const parsed = extractFirstJsonObj(analysis)

    if (!parsed || typeof parsed !== 'object') {
      logger.error('Count: Gemini returned invalid JSON', { request_id: requestId, raw: analysis })
      return NextResponse.json({ status: 'error', error: 'Vertex AI returned invalid JSON for count', raw: analysis }, { status: 502 })
    }

    // Expect integers; coerce safely
    const rows = Number.isFinite(Number(parsed.rows)) ? Math.max(0, Math.floor(Number(parsed.rows))) : null
    const cols = Number.isFinite(Number(parsed.cols)) ? Math.max(0, Math.floor(Number(parsed.cols))) : null

    if (rows === null || cols === null) {
      logger.error('Count: Gemini returned JSON but rows/cols missing or invalid', { request_id: requestId, parsed })
      return NextResponse.json({ status: 'error', error: 'Vertex AI returned missing/invalid rows or cols', parsed }, { status: 502 })
    }

    // Build insights and samples/all_rows
    const insights: string[] = []
    insights.push(`Found ${rows} rows and ${cols} columns in the dataset.`)

    // samples: first 5 normalized rows for quick preview in UI
    const SAMPLE_PREVIEW = 5
    const samples = normalizedRows.slice(0, SAMPLE_PREVIEW)

    // all_rows: full normalized rows (UI can show "Show All")
    const all_rows = normalizedRows

    // persist results into analyses collection if runId passed
    if (runId) {
      try {
        await db.collection('analyses').updateOne(
          { runId, userId },
          {
            $set: {
              'steps.count': {
                status: 'success',
                rows,
                cols,
                insights,
                samples,
                all_rows,
                raw: analysis,
                updatedAt: new Date()
              },
              updatedAt: new Date()
            }
          },
          { upsert: true }
        )
      } catch (e: any) {
        logger.error('persist count step failed', { request_id: requestId, error: String(e) })
      }
    }

    logger.info('Count completed (via Gemini)', { request_id: requestId, fileId, rows, cols })
    return NextResponse.json({ status: 'success', rows, cols, insights, samples, all_rows })

  } catch (err: any) {
    logger.error('POST /api/run/count error', { request_id: requestId, error: String(err) })
    return NextResponse.json({ status: 'error', error: 'Failed to count rows and columns', details: String(err?.message ?? err) }, { status: 500 })
  } finally {
    // close DB client if we opened it via connectToDatabase
    try {
      if (clientToClose && typeof clientToClose.close === 'function') {
        await clientToClose.close()
        logger.info('DB connection closed (count)', { request_id: requestId })
      }
    } catch (closeErr: any) {
      logger.warn('Error closing DB client (count)', { request_id: requestId, error: String(closeErr) })
    }
  }
}
