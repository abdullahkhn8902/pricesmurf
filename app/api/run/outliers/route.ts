// route.ts
import { NextResponse } from 'next/server'
import { getAuth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/mongodb'
import { processFileBuffer } from '@/lib/fileProcessor'
import logger from '@/lib/logger'
import { ObjectId, GridFSBucket } from 'mongodb'
import { VertexAI } from '@google-cloud/vertexai'

export const dynamic = 'force-dynamic'

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

/* ---------- Robust JSON extraction & repair helpers (same as previous) ---------- */

function tryParseJsonWithRepairs(candidate: string | null): any | null {
  if (!candidate || typeof candidate !== 'string') return null

  let s = candidate
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/\u00A0/g, ' ')
    .trim()

  try {
    return JSON.parse(s)
  } catch {
    // continue
  }

  s = s.replace(/,\s*(?=[}\]])/g, '')
  s = s.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, function (m, p1) {
    const escaped = p1.replace(/"/g, '\\"')
    return `"${escaped}"`
  })
  s = s.replace(/([{,]\s*)([A-Za-z0-9_@$\-]+)\s*:/g, '$1"$2":')

  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function extractFirstJsonObj(text: string | null): any | null {
  if (!text || typeof text !== 'string') return null

  const firstOpen = text.indexOf('{')
  if (firstOpen === -1) {
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
          try {
            return JSON.parse(candidate)
          } catch {
            const repaired = tryParseJsonWithRepairs(candidate)
            if (repaired) return repaired
          }
        }
      }
    }
  }

  const regex = /\{[\s\S]*\}/m
  const match = text.match(regex)
  if (match && match[0]) return tryParseJsonWithRepairs(match[0])
  return null
}

/* ---------- callGeminiWithRetry (attempts + re-prompt) ---------- */

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
      if (parsed) return { raw, parsed, result }

      if (attempt < attempts) {
        logger.warn('callGeminiWithRetry: no JSON found, re-prompting', { request_id: requestId, attempt })
        const reminder = [
          '\n\nREMINDER: Return ONLY a single-line JSON object and NOTHING ELSE.',
          'EXACT EXAMPLE: {"status":"success","outlier_counts":{"...":0},"insights":["..."],"sql":"", "samples":[{}]}',
          'If unknown, use 0 for counts, empty string for sql, empty array for samples.'
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
    }
  }

  return { raw: lastRaw, parsed: null, result: null }
}

/* ---------- Route (Gemini-only outliers) ---------- */

export async function POST(request: Request) {
  try {
    const { userId } = getAuth(request as any)
    if (!userId) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const {
      fileId,
      column = 'discount_pct',
      methods = ['percentile', 'zscore'],
      thresholds = { percentile_upper: 0.99, zscore: 3, business_upper_pct: 50 },
      runId,
    } = body

    if (!fileId) return NextResponse.json({ status: 'error', error: 'fileId required' }, { status: 400 })

    const { db } = await connectToDatabase()
    const filesColl = db.collection('excelFiles.files')
    const fileDoc = await filesColl.findOne({ _id: new ObjectId(fileId), 'metadata.userId': userId })
    if (!fileDoc) return NextResponse.json({ status: 'error', error: 'File not found' }, { status: 404 })

    // stream file from GridFS
    const bucket = new GridFSBucket(db, { bucketName: 'excelFiles' })
    const download = bucket.openDownloadStream(new ObjectId(fileId))
    const chunks: Buffer[] = []
    for await (const chunk of download) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    const processed = await processFileBuffer(buffer, fileDoc.filename || 'file', fileDoc.contentType)
    const columns = Array.isArray(processed?.columns) ? processed.columns : []
    const data = Array.isArray(processed?.data) ? processed.data : []

    // Cap dataset size for prompt to control tokens
    const SAMPLE_ROW_CAP = 2000
    const sampleRowsForPrompt = data.slice(0, SAMPLE_ROW_CAP)

    // Initialize Vertex AI if not present
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

    if (!vertexAI) throw new Error('Vertex AI client not available')

    const model = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    // Build the instruction prompt and require strict JSON
    const dataString = JSON.stringify({ columns, data: sampleRowsForPrompt }, null, 2)
    const prompt = [
      'You are a rigorous data analyst specialized in detecting numeric outliers for a specified column.',
      'Input provided:',
      `- column: "${String(column)}"`,
      `- methods: ${JSON.stringify(methods)}`,
      `- thresholds: ${JSON.stringify(thresholds)}`,
      '- dataset: JSON with "columns" (array) and "data" (array of row objects or arrays).',
      '',
      'Task (MANDATORY):',
      '1) Analyze the provided dataset and apply the requested methods (e.g. percentile, zscore, business thresholds).',
      '2) Compute outlier counts for relevant categories and return an object `outlier_counts` with keys such as: ">50_pct", ">=90_pct", "zscore_>3" (include what you computed).',
      '3) Provide a short natural-language `insights` array (2-4 items) summarizing findings.',
      '4) Provide up to 10 `samples` (row objects) that exemplify the outliers (keep original column names as keys).',
      '5) Provide a representative `sql` string that an analyst could run to fetch these rows from a table named `transactions`.',
      '',
      'IMPORTANT — Output rules:',
      'Return ONLY a single JSON object (no markdown, no commentary) with EXACT keys: status, outlier_counts, insights, sql, samples.',
      'Shape example (use this exact keys and types):',
      `{"status":"success","outlier_counts":{"">50_pct"":0,"">=90_pct"":0,""zscore_>3"":0},"insights":["..."],"sql":"SELECT ...","samples":[{ /* row objects */ }]}`,
      '',
      'If you cannot compute a value, use 0 for counts, empty string for sql, and empty array for samples.',
      '',
      `Dataset: ${dataString}`,
      '',
      `Return ONLY the single-line JSON object.`,
    ].join('\n')

    // telemetry
    const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`
    const startTs = Date.now()
    logger.info('vertex_outliers_start', {
      request_id: requestId,
      userId,
      model: 'gemini-2.5-flash-lite',
      masked_key: maskSecret(process.env.VERTEX_AI_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS || 'sa-key'),
    })

    // Call Gemini with retry and strict parsing
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

    // Minimal validation of expected keys
    if (!('outlier_counts' in parsed) || !('insights' in parsed) || !('sql' in parsed) || !('samples' in parsed)) {
      logger.error('vertex_response_shape_invalid', { request_id: requestId, userId, parsed })
      return NextResponse.json({ status: 'error', error: 'Model returned invalid JSON shape', parsed }, { status: 502 })
    }

    // Persist if runId provided
    if (runId) {
      try {
        await db.collection('analyses').updateOne(
          { runId, userId },
          {
            $set: {
              'steps.outliers': {
                status: parsed.status || 'success',
                outlier_counts: parsed.outlier_counts || {},
                insights: parsed.insights || [],
                sql: parsed.sql || '',
                samples: parsed.samples || [],
                raw: raw,
                updatedAt: new Date(),
              },
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        )
        logger.info('analysis_persisted_outliers', { request_id: requestId, userId, runId })
      } catch (e: any) {
        logger.error('analysis_persist_outliers_error', { request_id: requestId, userId, error: String(e) })
      }
    }

    const durationMs = Date.now() - startTs
    logger.info('vertex_outliers_success', { request_id: requestId, userId, duration_ms: durationMs })

    // Respond with the same shape the frontend expects
    return NextResponse.json({
      status: parsed.status || 'success',
      outlier_counts: parsed.outlier_counts || {},
      insights: parsed.insights || [],
      sql: parsed.sql || '',
      samples: parsed.samples || [],
    })
  } catch (err: any) {
    logger.error('POST /api/run/outliers error', { error: String(err) })
    return NextResponse.json({ status: 'error', error: 'Failed to analyze outliers' }, { status: 500 })
  }
}
