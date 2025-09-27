// app/api/run/outliers/route.ts
import { NextResponse } from 'next/server'
import { getAuth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/mongodb'
import { processFileBuffer } from '@/lib/fileProcessor'
import getVertexClient from '@/lib/vertex-client'
import logger from '@/lib/logger'
import { ObjectId, GridFSBucket } from 'mongodb'

function toNumber(v: any) {
  if (typeof v === 'number') return v
  if (v === null || v === undefined || v === '') return NaN
  const stripped = String(v).replace(/[^0-9.\-]/g, '')
  return Number(stripped)
}

export async function POST(request: Request) {
  try {
    const { userId } = getAuth(request as any)
    if (!userId) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { fileId, column = 'discount_pct', methods = ['percentile', 'zscore'], thresholds = { percentile_upper: 0.99, zscore: 3, business_upper_pct: 50 }, runId } = body
    if (!fileId) return NextResponse.json({ status: 'error', error: 'fileId required' }, { status: 400 })

    const { db } = await connectToDatabase()
    const filesColl = db.collection('excelFiles.files')
    const fileDoc = await filesColl.findOne({ _id: new ObjectId(fileId), 'metadata.userId': userId })
    if (!fileDoc) return NextResponse.json({ status: 'error', error: 'File not found' }, { status: 404 })

    const bucket = new GridFSBucket(db, { bucketName: 'excelFiles' })
    const download = bucket.openDownloadStream(new ObjectId(fileId))
    const chunks: Buffer[] = []
    for await (const chunk of download) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    const { columns, data } = await processFileBuffer(buffer, fileDoc.filename || 'file', fileDoc.contentType)

    // Extract numeric column values
    const vals = data.map((r) => toNumber(r[column])).filter((v) => !Number.isNaN(v) && isFinite(v))
    if (vals.length === 0) {
      return NextResponse.json({ status: 'success', outlier_counts: {}, insights: ['No numeric values found in column'], sql: '', samples: [] })
    }

    // Basic stats
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length)
    const sorted = [...vals].sort((a, b) => a - b)
    const p99Index = Math.floor((thresholds.percentile_upper || 0.99) * sorted.length) - 1
    const p99 = sorted[Math.max(0, Math.min(sorted.length - 1, p99Index))]

    // zscore outliers
    const zOutliers = data.filter((r) => {
      const v = toNumber(r[column])
      if (Number.isNaN(v)) return false
      return Math.abs((v - mean) / (sd || 1)) > (thresholds.zscore || 3)
    })

    const businessOutliers = data.filter((r) => {
      const v = toNumber(r[column])
      if (Number.isNaN(v)) return false
      return v > (thresholds.business_upper_pct || 50)
    })

    const extremePct = data.filter((r) => {
      const v = toNumber(r[column])
      if (Number.isNaN(v)) return false
      return v >= 90
    })

    const outlier_counts = {
      '>50_pct': businessOutliers.length,
      '>=90_pct': extremePct.length,
      'zscore_>3': zOutliers.length,
    }

    const samples = [...extremePct.slice(0, 3), ...zOutliers.slice(0, 3)].slice(0, 10)

    const sql = `SELECT * FROM transactions WHERE ${column} >= 90 OR ABS(( ${column} - AVG(${column}) ) / STDDEV(${column})) > ${thresholds.zscore || 3} LIMIT 10;`

    const vertex = getVertexClient()
    let genNL = null
    if (!vertex.isMockMode()) {
      try {
        genNL = await vertex.generateInsights({ step: 'outliers', column, outlier_counts })
      } catch (e: any) {
        logger.error('Vertex generateInsights error (outliers)', { error: String(e) })
      }
    }

    if (runId) {
      await db.collection('analyses').updateOne({ runId, userId }, {
        $set: {
          'steps.outliers': {
            status: 'success',
            outlier_counts,
            insights: genNL?.insights || [`${extremePct.length} rows with >=90% ${column}`],
            sql,
            samples,
            generatedNL: genNL,
            updatedAt: new Date()
          },
          updatedAt: new Date()
        }
      })
    }

    return NextResponse.json({ status: 'success', outlier_counts, insights: genNL?.insights || [`${extremePct.length} rows with >=90% ${column}`], sql, samples })
  } catch (err: any) {
    logger.error('POST /api/run/outliers error', { error: String(err) })
    return NextResponse.json({ status: 'error', error: 'Failed to analyze outliers' }, { status: 500 })
  }
}
