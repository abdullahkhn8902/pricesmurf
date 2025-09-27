// app/api/report/route.ts
import { NextResponse } from 'next/server'
import { getAuth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/mongodb'
import { v4 as uuidv4 } from 'uuid'
import logger from '@/lib/logger'

export async function POST(request: Request) {
    try {
        const { userId } = getAuth(request as any)
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json().catch(() => ({}))
        const { fileId } = body
        if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })

        const runId = `run_${Date.now().toString(36)}_${uuidv4().split('-')[0]}`
        const { db } = await connectToDatabase()

        const analyses = db.collection('analyses')
        const doc = {
            runId,
            userId,
            fileId,
            status: 'running',
            analysis: {}, // Initialize empty analysis object
            steps: {},
            insights: [],
            sql_queries: {},
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        await analyses.insertOne(doc)

        logger.info('Created new analysis run', { runId, userId, fileId })
        return NextResponse.json({
            runId,
            status: 'created',
            message: 'Analysis started successfully'
        })
    } catch (err: any) {
        logger.error('POST /api/report error', {
            error: String(err),
            stack: err.stack
        })
        return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
    }
}