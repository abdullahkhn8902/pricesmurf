import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { connectToDatabase } from "@/lib/mongodb"
import logger from "@/lib/logger"

export async function POST(req: Request) {
    try {
        const { userId } = getAuth(req as any)
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const body = await req.json().catch(() => ({}))
        const { runId, analysis, insights, steps, sql_queries, status = "completed" } = body

        if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 })
        if (!analysis) return NextResponse.json({ error: "analysis required" }, { status: 400 })

        const { db } = await connectToDatabase()

        // Create complete update object with all possible fields
        const updateData: any = {
            analysis,
            status,
            updatedAt: new Date()
        }

        // Add optional fields if they exist
        if (insights !== undefined) updateData.insights = insights
        if (steps !== undefined) updateData.steps = steps
        if (sql_queries !== undefined) updateData.sql_queries = sql_queries

        const result = await db.collection("analyses").updateOne(
            { runId, userId },
            { $set: updateData },
            { upsert: true }
        )

        logger.info('Analysis saved successfully', {
            runId,
            userId,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount
        })

        return NextResponse.json({
            status: "ok",
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount
        })
    } catch (err: any) {
        logger.error("POST /api/report/save error", {
            error: String(err),
            stack: err.stack
        })
        return NextResponse.json({ error: "Failed to save analysis" }, { status: 500 })
    }
}
