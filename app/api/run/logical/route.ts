// route.ts
import { NextResponse } from 'next/server'
import { getAuth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/mongodb'
import { processFileBuffer } from '@/lib/fileProcessor'
import logger from '@/lib/logger'
import { ObjectId, GridFSBucket } from 'mongodb'
import { VertexAI } from '@google-cloud/vertexai' // imports value and type

export const dynamic = 'force-dynamic'

// Explicit type for vertexAI
let vertexAI: VertexAI | undefined
try {
  const PROJECT = (process.env.VERTEX_AI_PROJECT || '').toString().trim()
  const LOCATION = (process.env.VERTEX_AI_LOCATION || '').toString().trim()
  const API_ENDPOINT = LOCATION ? `${LOCATION}-aiplatform.googleapis.com` : undefined

  vertexAI = new VertexAI({
    project: PROJECT || undefined,
    location: LOCATION || undefined,
    apiEndpoint: API_ENDPOINT || undefined,
  })
  logger.info('Vertex AI initialized (module)', { project: PROJECT, location: LOCATION })
} catch (e: unknown) {
  logger.warn('Vertex AI module init failed (will try late init)', { error: String(e) })
}

function maskSecret(secret: string | undefined): string {
  if (!secret || typeof secret !== 'string') return 'N/A'
  if (secret.length <= 4) return '***' + secret
  return '***' + secret.slice(-4)
}

/* ---------- Robust JSON extraction & repair helpers ---------- */

/**
 * Try progressive repairs on a JSON-like string and parse it.
 * Returns parsed object or null.
 */
function tryParseJsonWithRepairs(candidate: string | null): any | null {
  if (!candidate || typeof candidate !== 'string') return null

  // Normalize quotes and whitespace
  let s = candidate
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'") // single smart quotes -> '
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"') // double smart quotes -> "
    .replace(/\u00A0/g, ' ') // NBSP -> space
    .trim()

  // Try direct parse
  try {
    return JSON.parse(s)
  } catch {
    /* continue */
  }

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*(?=[}\]])/g, '')

  // Convert single-quoted strings to double-quoted strings where it looks safe
  s = s.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, function (m, p1) {
    // escape existing double quotes inside
    const escaped = p1.replace(/"/g, '\\"')
    return `"${escaped}"`
  })

  // Quote unquoted keys (conservative)
  s = s.replace(/([{,]\s*)([A-Za-z0-9_@$\-]+)\s*:/g, '$1"$2":')

  // Final parse attempt
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/**
 * Extract the first balanced JSON object from text (handles strings/escapes).
 * Returns parsed object or null.
 */
function extractFirstJsonObj(text: string | null): any | null {
  if (!text || typeof text !== 'string') return null

  const firstOpen = text.indexOf('{')
  if (firstOpen === -1) {
    // try repairs on any {...} using regex fallback
    const matchFallback = text.match(/\{[\s\S]*\}/m)
    if (matchFallback) return tryParseJsonWithRepairs(matchFallback[0])
    return null
  }

  let inString = false
  let escape = false
  let depth = 0
  for (let i = firstOpen; i < text.length; i++) {
    const ch = text[i]

    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }

    // Toggle inString only for double quotes (most JSON uses double quotes)
    if (ch === '"') {
      inString = !inString
      continue
    }

    if (!inString) {
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          const candidate = text.slice(firstOpen, i + 1)
          // Try direct parse then repaired parse
          try {
            return JSON.parse(candidate)
          } catch {
            const repaired = tryParseJsonWithRepairs(candidate)
            if (repaired) return repaired
            // else continue scanning (maybe a later object parses)
          }
        }
      }
    }
  }

  // fallback: try to find any {...} substring and repair
  const regex = /\{[\s\S]*\}/m
  const match = text.match(regex)
  if (match && match[0]) {
    return tryParseJsonWithRepairs(match[0])
  }

  return null
}

/* ---------- Gemini (Vertex) caller with retry + re-prompt ---------- */

/**
 * Call model.generateContent with up to `attempts` tries.
 * On each attempt, we check whether the model output contains a parsable JSON object.
 * If not, we re-prompt with a concise reminder and example. Returns { raw, parsed, result }.
 */
async function callGeminiWithRetry(
  model: any,
  prompt: string,
  requestId = 'unknown',
  attempts = 3
): Promise<{ raw: string; parsed: any | null; result: any | null }> {
  let lastRaw = ''
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      })

      const raw = String(result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
      lastRaw = raw

      const parsed = extractFirstJsonObj(raw)
      if (parsed) {
        return { raw, parsed, result }
      }

      // If no JSON and we can re-prompt, send a short strict reminder with an example
      if (attempt < attempts) {
        logger.warn('callGeminiWithRetry: no JSON found, re-prompting', { request_id: requestId, attempt })
        const reminder = [
          '\n\nREMINDER: Return ONLY a single-line JSON object and NOTHING ELSE.',
          'EXACT EXAMPLE: {"status":"success","insights":["..."],"sql":"", "samples":[{}]}',
          'If unknown, use empty string for sql and empty array for samples.'
        ].join(' ')

        const rePrompt = prompt + reminder
        const r2 = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: rePrompt }] }],
        })

        const raw2 = String(r2?.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
        lastRaw = raw2
        const parsed2 = extractFirstJsonObj(raw2)
        if (parsed2) return { raw: raw2, parsed: parsed2, result: r2 }
      }
    } catch (e: any) {
      logger.warn('callGeminiWithRetry attempt failed', { request_id: requestId, attempt, error: String(e?.message ?? e) })
      lastRaw = lastRaw || String(e?.message ?? e)
      // continue to next attempt
    }
  }

  // final: no parsed JSON
  return { raw: lastRaw, parsed: null, result: null }
}

/* ---------- Route handler ---------- */

export async function POST(request: Request) {
  try {
    const { userId } = getAuth(request as any)
    if (!userId) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { fileId, rules = ['net_price<=0', 'discount_pct>100', 'fk:product_id->products.product_id'], runId } = body
    if (!fileId) return NextResponse.json({ status: 'error', error: 'fileId required' }, { status: 400 })

    const { db } = await connectToDatabase()
    const filesColl = db.collection('excelFiles.files')
    const fileDoc = await filesColl.findOne({ _id: new ObjectId(fileId), 'metadata.userId': userId })
    if (!fileDoc) return NextResponse.json({ status: 'error', error: 'File not found' }, { status: 404 })

    // Load file buffer from GridFS
    const bucket = new GridFSBucket(db, { bucketName: 'excelFiles' })
    const download = bucket.openDownloadStream(new ObjectId(fileId))
    const chunks: Buffer[] = []
    for await (const chunk of download) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    // Parse file into columns/data (unchanged)
    const { columns, data } = await processFileBuffer(buffer, fileDoc.filename || 'file', fileDoc.contentType)

    // Initialize Vertex AI if not already
    if (!vertexAI) {
      try {
        const PROJECT = (process.env.VERTEX_AI_PROJECT || '').toString().trim()
        const LOCATION = (process.env.VERTEX_AI_LOCATION || 'us-central1').toString().trim()
        vertexAI = new VertexAI({
          project: PROJECT || undefined,
          location: LOCATION || undefined,
          apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
        })
        logger.info('Vertex AI late-init successful', { userId, project: PROJECT, location: LOCATION })
      } catch (initErr: unknown) {
        logger.error('Vertex AI late-init failed', { error: String(initErr) })
        throw new Error('Vertex AI initialization failed')
      }
    }

    if (!vertexAI) {
      throw new Error('Vertex AI client not available after initialization')
    }

    // Build prompt (compact dataset to reduce token usage)
    // If dataset is huge consider sampling or summarizing externally before sending
    const SAMPLE_ROW_CAP = 2000
    const sampleRows = Array.isArray(data) ? data.slice(0, SAMPLE_ROW_CAP) : []

    const dataString = JSON.stringify({ columns, data: sampleRows }, null, 2)
    const rulesString = Array.isArray(rules) ? rules.join('\n') : String(rules)

    const prompt = `
You are a data quality and logical-insights engine. The caller will provide:
- a rules list (each rule is a concise logical condition, e.g. "net_price<=0", "discount_pct>100", or a foreign-key rule "fk:product_id->products.product_id")
- a dataset (columns and rows in JSON). Only the included rows are provided; do not assume more.

Task:
1. Apply the given rules to the provided dataset and produce human-readable insights (short sentences).
2. For FK rules, produce a representative SQL query that would find missing references (use transactions/products example if relevant).
3. Provide up to 5 sample rows that illustrate each violation (return row objects with column names as keys).
4. ONLY output valid JSON — NOTHING ELSE. The JSON MUST follow this exact shape:

{
  "status": "success",
  "insights": ["...", "..."],
  "sql": "SELECT ... (or empty string)",
  "samples": [ { "colA": "...", "colB": "..." }, ... ]
}

If you cannot apply a rule, include a clear explanation in the "insights" array but still return the object above with status "success" (unless a fatal error — then use status "error" and include an "insights" message).

Dataset:
${dataString}

Rules:
${rulesString}

Return ONLY the JSON object exactly as specified. Do not include markdown, commentary, or extra text.
`.trim()

    // Telemetry start
    const requestId =
      (request.headers && (request.headers as any).get && (request.headers as any).get('x-request-id')) || 'unknown'
    const startTs = Date.now()
    logger.info('vertex_check_start', {
      request_id: requestId,
      userId,
      model: 'gemini-2.5-flash-lite',
      masked_key: maskSecret(process.env.VERTEX_AI_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS || 'sa-key'),
    })

    // Call Gemini with retries
    const model = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
    const { raw, parsed } = await callGeminiWithRetry(model, prompt, requestId, 3)

    if (!raw) {
      const durationMs = Date.now() - startTs
      logger.error('vertex_no_text_response', { request_id: requestId, userId, duration_ms: durationMs })
      return NextResponse.json({ status: 'error', error: 'No response from model' }, { status: 500 })
    }

    if (!parsed || typeof parsed !== 'object') {
      logger.error('vertex_response_parse_error', { request_id: requestId, userId, raw: raw.slice(0, 2000) })
      return NextResponse.json({ status: 'error', error: 'Failed to parse JSON from model response', raw }, { status: 502 })
    }

    // Minimal shape validation
    if (!('insights' in parsed) || !('samples' in parsed) || !('sql' in parsed)) {
      logger.error('vertex_response_shape_invalid', { request_id: requestId, userId, parsed })
      return NextResponse.json({ status: 'error', error: 'Model returned invalid JSON shape', parsed }, { status: 502 })
    }

    // Persist into DB if runId present
    if (runId) {
      try {
        await db.collection('analyses').updateOne(
          { runId, userId },
          {
            $set: {
              'steps.logical': {
                status: parsed.status || 'success',
                insights: parsed.insights || [],
                sql: parsed.sql || '',
                samples: parsed.samples || [],
                updatedAt: new Date(),
              },
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        )
        logger.info('analysis_persisted', { request_id: requestId, userId, runId })
      } catch (e: any) {
        logger.error('analysis_persist_error', { request_id: requestId, userId, error: String(e) })
      }
    }

    // Telemetry end
    const durationMs = Date.now() - startTs
    logger.info('vertex_call_success', { request_id: requestId, userId, duration_ms: durationMs })

    // Response identical shape as before
    return NextResponse.json({
      status: parsed.status || 'success',
      insights: parsed.insights || [],
      sql: parsed.sql || '',
      samples: parsed.samples || [],
    })
  } catch (err: any) {
    logger.error('POST /api/run/logical error', { error: String(err) })
    return NextResponse.json({ status: 'error', error: 'Failed to run logical checks' }, { status: 500 })
  }
}
