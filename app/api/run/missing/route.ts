import { NextResponse } from 'next/server'
import { getAuth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/mongodb'
import { processFileBuffer } from '@/lib/fileProcessor'
import logger from '@/lib/logger'
import { ObjectId, GridFSBucket } from 'mongodb'
import getVertexClient from '@/lib/vertex-client'

export async function POST(request: Request) {
  try {
    const { userId } = getAuth(request as any)
    if (!userId) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { fileId, runId } = body
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

    // Compute null counts per column (treat '', null, undefined as missing)
    const columnSummary: Record<string, { null_count: number; null_pct: number }> = {}
    columns.forEach((c) => (columnSummary[c] = { null_count: 0, null_pct: 0 }))

    for (const row of data) {
      for (const col of columns) {
        const v = row[col]
        if (v === null || v === undefined || v === '') {
          columnSummary[col].null_count += 1
        }
      }
    }
    const rows = data.length
    for (const col of columns) {
      columnSummary[col].null_pct = rows > 0 ? Number(((columnSummary[col].null_count / rows) * 100).toFixed(4)) : 0
    }

    // Build insights array
    const insights: string[] = []
    const nonzeroNullColumns = columns.filter((c) => columnSummary[c].null_count > 0)
    if (nonzeroNullColumns.length > 0) {
      insights.push(`${nonzeroNullColumns.length} columns have nulls`)
      for (const c of nonzeroNullColumns) {
        insights.push(`${columnSummary[c].null_pct}% nulls in ${c}`)
      }
    } else {
      insights.push('No missing values detected in core columns')
    }

    // sample rows with any null for first few
    const samples = data.filter((r) => columns.some((c) => r[c] === null || r[c] === '')).slice(0, 10)

    // Optionally call Vertex for NL insights
    const vertex = getVertexClient()
    let nl = null
    if (!vertex.isMockMode()) {
      try {
        const gen = await vertex.generateInsights({ step: 'missing', summary: { columnSummary, samplesCount: samples.length } })
        nl = gen
        if (gen?.insights) gen.insights.forEach((i: string) => insights.push(i))
      } catch (e: any) {
        logger.error('Vertex generateInsights failed for missing', { error: String(e) })
      }
    }

    // persist to analyses
    if (runId) {
      await db.collection('analyses').updateOne({ runId, userId }, {
        $set: {
          'steps.missing': {
            status: 'success',
            insights,
            columnSummary,
            sql: `SELECT * FROM transactions WHERE /* columns with nulls */ LIMIT 10;`,
            samples,
            generatedNL: nl,
            updatedAt: new Date(),
          },
          updatedAt: new Date()
        }
      })
    }

    return NextResponse.json({ status: 'success', insights, sql: `SELECT * FROM transactions WHERE /* columns with nulls */ LIMIT 10;`, samples })
  } catch (err: any) {
    logger.error('POST /api/run/missing error', { error: String(err) })
    return NextResponse.json({ status: 'error', error: 'Failed to analyze missing values' }, { status: 500 })
  }
}
