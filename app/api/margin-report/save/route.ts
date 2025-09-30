import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { connectToDatabase } from "@/lib/mongodb"
import logger from "@/lib/logger"

// Helper to safely get message from unknown errors
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  try {
    return typeof err === "string" ? err : JSON.stringify(err)
  } catch {
    return String(err)
  }
}

export async function POST(request: Request) {
  const requestId = (request.headers.get("x-request-id") || `req_${Date.now()}`).toString()
  const userId = request.headers.get("x-clerk-user-id") || "unknown"

  logger.info("POST /api/margin-report/save called", { request_id: requestId, user_id: userId })

  try {
    const authRes = getAuth(request as any)
    const clerkUserId: string | null = authRes?.userId ?? null

    if (!clerkUserId) {
      logger.warn("No Clerk userId present for /api/margin-report/save request", { request_id: requestId })
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = await request.json()
    const { runId, analysis } = body

    if (!runId || !analysis) {
      return NextResponse.json({ error: "runId and analysis are required" }, { status: 400 })
    }

    // Save final analysis results to database
    const { db } = await connectToDatabase()
    await db.collection("margin_analyses").updateOne(
      { runId, userId: clerkUserId },
      {
        $set: {
          analysis,
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    )

    logger.info("Saved margin analysis results", { request_id: requestId, runId })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const errMsg = getErrorMessage(err)
    logger.error("margin-report/save endpoint error", { request_id: requestId, error: errMsg })
    return NextResponse.json({ error: "Internal server error", details: errMsg }, { status: 500 })
  }
}
