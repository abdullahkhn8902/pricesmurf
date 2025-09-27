// app/api/report/[runId]/route.ts
import { NextResponse } from 'next/server'
import { getAuth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/mongodb'
import logger from '@/lib/logger'

function toNumber(v: any) {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object') {
    if ('$numberInt' in v) return Number(v.$numberInt)
    if ('$numberDouble' in v) return Number(v.$numberDouble)
    if ('$numberLong' in v) return Number(v.$numberLong)
    if ('$date' in v) return v.$date
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function safeArray(v: any) {
  return Array.isArray(v) ? v : []
}

/**
 * GET /api/report/[runId]
 *
 * This handler extracts runId robustly from the request URL (not from params)
 * and returns a stable response shape. If `doc.analysis` is missing it will
 * synthesize the `analysis` object from `doc.steps` so the frontend always
 * receives data the UI expects.
 */
export async function GET(request: Request, context: any) {
  try {
    // authenticate
    const { userId } = getAuth(request as any)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Robust runId extraction: derive from URL path last segment (safe across runtimes)
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const runIdFromUrl = pathParts.length ? pathParts[pathParts.length - 1] : undefined

    // fallback to context.params if provided (but don't rely on it only)
    const runId =
      typeof runIdFromUrl === 'string' && runIdFromUrl.length > 0
        ? runIdFromUrl
        : (context && context.params && context.params.runId) || undefined

    if (!runId) {
      return NextResponse.json({ error: 'runId required' }, { status: 400 })
    }

    const { db } = await connectToDatabase()
    const analyses = db.collection('analyses')

    // Find document for this runId + user
    const doc = await analyses.findOne({ runId, userId })
    if (!doc) {
      logger.warn('Report not found', { runId, userId })
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // If analysis exists and non-empty, use it. Otherwise build from steps.
    let analysis = (doc.analysis && Object.keys(doc.analysis).length > 0) ? doc.analysis : {}

    if (!analysis || Object.keys(analysis).length === 0) {
      const steps = doc.steps || {}

      // Counting
      const countStep = steps.count || {}
      const counting = {
        rows: toNumber(countStep.rows ?? countStep.count ?? countStep.rows_count ?? 0),
        cols: toNumber(countStep.cols ?? countStep.columns ?? 0),
        insights: safeArray(countStep.insights || countStep.insight || []),
        sql: countStep.sql || '',
        samples: safeArray(countStep.samples || []),
      }

      // Missing
      const missingStep = steps.missing || {}
      const missing = {
        insights: safeArray(missingStep.insights || missingStep.insight || []),
        columnSummary: missingStep.columnSummary || missingStep.column_summary || {},
        sql: missingStep.sql || '',
        samples: safeArray(missingStep.samples || []),
      }

      // Duplicates
      const dupStep = steps.duplicates || {}
      const duplicates = {
        total_duplicate_rows: toNumber(dupStep.total_duplicate_rows ?? dupStep.total_duplicates ?? 0),
        unique_duplicate_ids: toNumber(dupStep.unique_duplicate_ids ?? 0),
        top_duplicate_ids: dupStep.top_duplicate_ids || dupStep.top_duplicates || {},
        insights: safeArray(dupStep.insights || dupStep.insight || []),
        sql: dupStep.sql || '',
        samples: safeArray(dupStep.samples || []),
        all_duplicate_rows: safeArray(dupStep.all_duplicate_rows || []), // Add this line

      }

      // Outliers
      const outStep = steps.outliers || {}
      const outliers = {
        outlier_counts: outStep.outlier_counts || outStep.counts || {},
        insights: safeArray(outStep.insights || outStep.insight || []),
        sql: outStep.sql || '',
        samples: safeArray(outStep.samples || []),
      }

      // Logical
      const logStep = steps.logical || {}
      const logical = {
        insights: safeArray(logStep.insights || logStep.insight || []),
        sql: logStep.sql || '',
        samples: safeArray(logStep.samples || []),
      }

      // Meta
      const meta = {
        fileId: doc.fileId ?? (doc.steps?.meta?.fileId) ?? null,
        runId: doc.runId ?? runId,
        completedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : (doc.createdAt ? new Date(doc.createdAt).toISOString() : null),
        qualityScore: doc.analysis?.meta?.qualityScore ?? doc.steps?.meta?.qualityScore ?? 0,
        criticalIssues: doc.analysis?.meta?.criticalIssues ?? doc.steps?.meta?.criticalIssues ?? 0,
      }

      analysis = { counting, missing, duplicates, outliers, logical, meta }
    }

    const responseData = {
      runId: doc.runId,
      fileId: doc.fileId,
      status: doc.status || 'unknown',
      analysis,
      insights: doc.insights || [],
      steps: doc.steps || {},
      sql_queries: doc.sql_queries || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }

    logger.info('Report fetched successfully', { runId, status: doc.status })
    return NextResponse.json(responseData)
  } catch (err: any) {
    logger.error('GET /api/report/:runId error', {
      error: String(err),
      runId: (err && err.runId) || 'unknown',
      stack: err?.stack,
    })
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 })
  }
}
