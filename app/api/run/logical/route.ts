import { NextResponse } from 'next/server'
import { getAuth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/mongodb'
import { processFileBuffer } from '@/lib/fileProcessor'
import logger from '@/lib/logger'
import { ObjectId, GridFSBucket } from 'mongodb'

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

    const bucket = new GridFSBucket(db, { bucketName: 'excelFiles' })
    const download = bucket.openDownloadStream(new ObjectId(fileId))
    const chunks: Buffer[] = []
    for await (const chunk of download) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    const { columns, data } = await processFileBuffer(buffer, fileDoc.filename || 'file', fileDoc.contentType)

    // Implement simple rules:
    const violations: string[] = []
    const samples: any[] = []

    // net_price <= 0
    const negPriceRows = data.filter((r) => {
      const v = Number(String(r['net_price'] ?? r['Net_Price'] ?? r['Amount'] ?? '').replace(/[^0-9.\-]/g, ''))
      return !Number.isNaN(v) && v <= 0
    })
    if (negPriceRows.length > 0) {
      violations.push(`${negPriceRows.length} rows with net_price <= 0`)
      samples.push(...negPriceRows.slice(0, 5))
    } else {
      violations.push('0 rows with net_price <= 0')
    }

    // discount_pct > 100
    const invalidDiscountRows = data.filter((r) => {
      const v = Number(String(r['discount_pct'] ?? r['Discount_Pct'] ?? '').replace(/[^0-9.\-]/g, ''))
      return !Number.isNaN(v) && v > 100
    })
    if (invalidDiscountRows.length > 0) {
      violations.push(`${invalidDiscountRows.length} rows with discount_pct > 100`)
      samples.push(...invalidDiscountRows.slice(0, 5))
    } else {
      violations.push('0 rows with discount_pct > 100')
    }

    // FK check: try to locate 'products' collection
    let missingFKCount = 0
    if (db.collection('products')) {
      const productIds = new Set((await db.collection('products').find({}, { projection: { product_id: 1 } }).toArray()).map((p: any) => String(p.product_id)))
      const missingProducts = data.filter((r) => {
        const pid = String(r['product_id'] ?? r['ProductID'] ?? r['Product'] ?? '')
        return pid && !productIds.has(pid)
      })
      missingFKCount = missingProducts.length
      if (missingProducts.length > 0) samples.push(...missingProducts.slice(0, 5))
      if (missingProducts.length > 0) violations.push(`${missingProducts.length} missing product references detected`)
    } else {
      violations.push('products collection not available for FK check')
    }

    // persist
    if (runId) {
      await db.collection('analyses').updateOne({ runId, userId }, {
        $set: {
          'steps.logical': {
            status: 'success',
            insights: violations,
            sql: `SELECT t.* FROM transactions t LEFT JOIN products p ON t.product_id = p.product_id WHERE p.product_id IS NULL LIMIT 10;`,
            samples,
            updatedAt: new Date()
          },
          updatedAt: new Date()
        }
      })
    }

    return NextResponse.json({ status: 'success', insights: violations, sql: `SELECT t.* FROM transactions t LEFT JOIN products p ON t.product_id = p.product_id WHERE p.product_id IS NULL LIMIT 10;`, samples })
  } catch (err: any) {
    logger.error('POST /api/run/logical error', { error: String(err) })
    return NextResponse.json({ status: 'error', error: 'Failed to run logical checks' }, { status: 500 })
  }
}
