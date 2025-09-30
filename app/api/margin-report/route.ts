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

  logger.info("POST /api/margin-report called", { request_id: requestId, user_id: userId })

  try {
    const authRes = getAuth(request as any)
    const clerkUserId: string | null = authRes?.userId ?? null

    if (!clerkUserId) {
      logger.warn("No Clerk userId present for /api/margin-report request", { request_id: requestId })
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = await request.json()
    const fileId = body?.fileId

    if (!fileId) {
      return NextResponse.json({ error: "fileId is required" }, { status: 400 })
    }

    // Generate a unique run ID
    const runId = `margin_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    // Create initial run record in database
    const { db } = await connectToDatabase()
    await db.collection("margin_analyses").insertOne({
      runId,
      fileId,
      userId: clerkUserId,
      status: "created",
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: {
        validation: { status: "pending" },
        analysis: { status: "pending" },
        insights: { status: "pending" },
      },
    })

    logger.info("Created margin analysis run", { request_id: requestId, runId, fileId })

    return NextResponse.json({ runId })
  } catch (err: unknown) {
    const errMsg = getErrorMessage(err)
    logger.error("margin-report endpoint error", { request_id: requestId, error: errMsg })
    return NextResponse.json({ error: "Internal server error", details: errMsg }, { status: 500 })
  }
}
