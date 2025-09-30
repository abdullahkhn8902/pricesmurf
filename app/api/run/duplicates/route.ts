import { NextResponse } from 'next/server'
import { getAuth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/mongodb'
import { processFileBuffer } from '@/lib/fileProcessor'
import logger from '@/lib/logger'
import { ObjectId, GridFSBucket } from 'mongodb'

export async function POST(request: Request) {
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`
  try {
    const { userId } = getAuth(request as any)
    if (!userId) return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { fileId, key = 'transaction_id', limit = 10, runId } = body
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

    // Keep original SQL template exactly the same
    const sql = `SELECT ${key}, COUNT(*) as cnt FROM transactions GROUP BY ${key} HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT ${limit};`

    // Normalize rows to array of objects { colName: value }
    const normalizedRows: Record<string, any>[] = []
    if (Array.isArray(data)) {
      for (const row of data) {
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          // already an object mapping column->value
          normalizedRows.push(row as Record<string, any>)
        } else if (Array.isArray(row)) {
          // array row: map using columns
          const obj: Record<string, any> = {}
          for (let i = 0; i < (columns?.length || 0); i++) {
            const col = columns[i]
            obj[col] = row[i] ?? null
          }
          normalizedRows.push(obj)
        } else {
          // primitive or unexpected: put into a single-column object
          const colName = (columns && columns[0]) || 'value'
          normalizedRows.push({ [colName]: row })
        }
      }
    }

    // Find key column name case-insensitively
    const keyLower = String(key).toLowerCase()
    const columnNameMatch = Array.isArray(columns)
      ? columns.find((c: string) => String(c || '').toLowerCase() === keyLower)
      : undefined

    // If key column not found, treat as no key-based duplicates (per your rules)
    if (!columnNameMatch) {
      const noKeyInsights = [`Key column "${key}" not found in file columns. No key-based duplicate analysis performed.`]

      // Persist empty duplicates info if runId provided (preserve structure)
      if (runId) {
        try {
          await db.collection('analyses').updateOne({ runId, userId }, {
            $set: {
              'steps.duplicates': {
                status: 'success',
                total_duplicate_rows: 0,
                unique_duplicate_ids: 0,
                top_duplicate_ids: {},
                sql,
                samples: [],
                all_duplicate_rows: [],
                insights: noKeyInsights,
                raw: '',
                updatedAt: new Date()
              },
              updatedAt: new Date()
            }
          }, { upsert: true })
        } catch (e: any) {
          logger.error('persist duplicates step failed (no key found)', { request_id: requestId, error: String(e) })
        }
      }

      return NextResponse.json({
        status: 'success',
        total_duplicate_rows: 0,
        unique_duplicate_ids: 0,
        top_duplicate_ids: {},
        sql,
        samples: [],
        all_duplicate_rows: [],
        insights: noKeyInsights
      })
    }

    // Build counts for each key value (case-sensitive match for the value as you requested)
    const counts = new Map<string, number>()
    const rowsByKey = new Map<string, Record<string, any>[]>()

    for (const r of normalizedRows) {
      // Treat missing/empty as empty string - skip empty keys (only count non-empty keys)
      const rawVal = r[columnNameMatch]
      const val = rawVal === null || rawVal === undefined ? '' : String(rawVal)
      if (!val) continue // skip empty values
      const prev = counts.get(val) ?? 0
      counts.set(val, prev + 1)
      const arr = rowsByKey.get(val) ?? []
      arr.push(r)
      if (!rowsByKey.has(val)) rowsByKey.set(val, arr)
    }

    // Find duplicate keys (count > 1)
    const duplicateKeys: string[] = []
    for (const [k, v] of counts.entries()) {
      if (v > 1) duplicateKeys.push(k)
    }

    // Build U: union of all rows that have duplicate key values
    const duplicateRowIndices: number[] = []
    normalizedRows.forEach((r, idx) => {
      const rawVal = r[columnNameMatch]
      const val = rawVal === null || rawVal === undefined ? '' : String(rawVal)
      if (!val) return
      if (counts.get(val) && counts.get(val)! > 1) {
        duplicateRowIndices.push(idx)
      }
    })

    // total_duplicate_rows: number of rows whose key value is duplicate (counted each physical row once)
    const total_duplicate_rows = duplicateRowIndices.length
    const allDuplicateRows = duplicateRowIndices.map(idx => normalizedRows[idx])
    // unique_duplicate_ids: number of distinct duplicate key values
    const unique_duplicate_ids = duplicateKeys.length

    // top_duplicate_ids: mapping duplicate key -> count, sorted desc by count and limit applied
    const sortedDupPairs = duplicateKeys
      .map(k => ({ key: k, count: counts.get(k) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, Number(limit) || 10)

    const top_duplicate_ids: Record<string, number> = {}
    for (const p of sortedDupPairs) top_duplicate_ids[p.key] = p.count

    // samples: for each top duplicate key include one representative full-row object from normalizedRows
    const samples: Record<string, any>[] = []
    for (const p of sortedDupPairs) {
      const rowsForKey = rowsByKey.get(p.key) ?? []
      if (rowsForKey.length > 0) {
        samples.push(rowsForKey[0])
      } else {
        // top key not present in sample (rare since we built from file) -> return object with key and nulls for columns
        const repr: Record<string, any> = {}
        for (const c of columns) repr[c] = null
        repr[columnNameMatch] = p.key
        samples.push(repr)
      }
      if (samples.length >= Number(limit) || samples.length >= (Number(limit) || 10)) break
    }

    // --- NEW: build insights array so UI shows the duplicate insights ---
    const duplicateInsights: string[] = []
    duplicateInsights.push(`Number of duplicated rows found in this analysis: ${total_duplicate_rows}`)
    duplicateInsights.push(`Number of distinct duplicate IDs found: ${unique_duplicate_ids}`)
    // Add a short top-keys summary if available
    if (Object.keys(top_duplicate_ids).length > 0) {
      const topSummary = Object.entries(top_duplicate_ids)
        .map(([k, v]) => `${k} (${v})`)
        .slice(0, 5)
        .join(', ')
      duplicateInsights.push(`Top duplicate IDs and counts: ${topSummary}`)
    }

    // Persist into analyses collection if runId provided (preserve existing structure)
    if (runId) {
      try {
        await db.collection('analyses').updateOne({ runId, userId }, {
          $set: {
            'steps.duplicates': {
              status: 'success',
              total_duplicate_rows,
              unique_duplicate_ids,
              top_duplicate_ids,
              sql,
              samples,
              all_duplicate_rows: allDuplicateRows,
              insights: duplicateInsights, // <-- write insights here
              raw: '',
              updatedAt: new Date()
            },
            updatedAt: new Date()
          }
        }, { upsert: true })

      } catch (e: any) {
        logger.error('persist duplicates step failed', { request_id: requestId, error: String(e) })
      }
    }

    // Return payload exactly as your app expects (include insights so immediate callers can use them)
    return NextResponse.json({
      status: 'success',
      total_duplicate_rows,
      unique_duplicate_ids,
      top_duplicate_ids,
      sql,
      samples,
      all_duplicate_rows: allDuplicateRows,
      insights: duplicateInsights // <-- return insights in response
    })

  } catch (err: any) {
    logger.error('POST /api/run/duplicates error', { error: String(err) })
    return NextResponse.json({ status: 'error', error: 'Failed to analyze duplicates' }, { status: 500 })
  }
}
