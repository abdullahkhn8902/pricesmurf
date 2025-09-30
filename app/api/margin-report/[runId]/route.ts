import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { connectToDatabase } from "@/lib/mongodb"
import logger from "@/lib/logger"
import { ObjectId } from "mongodb"

// Helper to safely get message from unknown errors
function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message
    try {
        return typeof err === "string" ? err : JSON.stringify(err)
    } catch {
        return String(err)
    }
}

/**
 * GET handler to fetch saved margin analysis by runId for the authenticated user.
 * Returns { runId, analysis, fileName?, meta? }
 */
export async function GET(request: Request, { params }: { params: { runId?: string } }) {
    const requestId = (request.headers.get("x-request-id") || `req_${Date.now()}`).toString()
    const userIdHeader = request.headers.get("x-clerk-user-id") || "unknown"
    const runId = params?.runId ?? null

    logger.info("GET /api/margin-report/[runId] called", { request_id: requestId, runId, user_id: userIdHeader })

    try {
        if (!runId) {
            return NextResponse.json({ error: "runId param required" }, { status: 400 })
        }

        const authRes = getAuth(request as any)
        const clerkUserId: string | null = authRes?.userId ?? null

        if (!clerkUserId) {
            logger.warn("No Clerk userId present for GET /api/margin-report", { request_id: requestId })
            return NextResponse.json({ error: "Authentication required" }, { status: 401 })
        }

        const { db } = await connectToDatabase()
        const coll = db.collection("margin_analyses")

        const record = await coll.findOne({ runId: runId, userId: clerkUserId })
        if (!record) {
            logger.warn("Margin analysis not found", { request_id: requestId, runId, user_id: clerkUserId })
            return NextResponse.json({ error: "Not found" }, { status: 404 })
        }

        // Determine the best "analysis" object
        let analysis: any = record.analysis ?? record.parsed ?? record.parsedAnalysis ?? record.analysisRaw ?? null
        // If analysis is a JSON string, try parsing
        if (typeof analysis === "string") {
            try {
                analysis = JSON.parse(analysis)
            } catch {
                // leave as string fallback
            }
        }

        // If analysis is null, try record.parsed (some endpoints used parsed)
        if (!analysis && record.parsed) analysis = record.parsed

        // Try to infer filename from record or analysis.meta.fileId by looking up GridFS file entry
        let fileName: string | null = null
        const fileIdCandidate =
            record.fileId || record.analysis?.meta?.fileId || record.meta?.fileId || analysis?.meta?.fileId || null

        if (fileIdCandidate) {
            try {
                const filesColl = db.collection("excelFiles.files")
                const fileDoc =
                    ObjectId.isValid(String(fileIdCandidate))
                        ? await filesColl.findOne({ _id: new ObjectId(String(fileIdCandidate)) })
                        : await filesColl.findOne({ filename: String(fileIdCandidate) })
                if (fileDoc?.filename) fileName = fileDoc.filename
            } catch (e) {
                logger.warn("Failed to lookup file name for margin result", { request_id: requestId, error: String(e) })
            }
        }

        // Build response payload
        const payload = {
            runId,
            analysis,
            fileName,
            meta: record.meta ?? record.analysis?.meta ?? null,
            status: record.status ?? "completed",
            savedAt: record.updatedAt ?? record.completedAt ?? null,
        }

        logger.info("Returning margin analysis", { request_id: requestId, runId, user_id: clerkUserId })
        return NextResponse.json(payload, { status: 200 })
    } catch (err: unknown) {
        const errMsg = getErrorMessage(err)
        logger.error("GET /api/margin-report/[runId] error", { request_id: requestId, error: errMsg })
        return NextResponse.json({ error: "Internal server error", details: errMsg }, { status: 500 })
    }
}
