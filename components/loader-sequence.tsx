"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Check, X, RotateCcw, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
// @ts-ignore
import { Hourglass } from "ldrs/react"

interface LoaderSequenceProps {
  fileId: string
  runId?: string // <-- optional runId added
  onComplete: (results: any) => void
  onError: (error: string) => void
}

interface StepResult {
  status: "pending" | "loading" | "success" | "error"
  data?: any
  error?: string
  summary?: string
}

const STEPS = [
  { id: "count", label: "Counting rows & columns", endpoint: "/api/run/count" },
  { id: "missing", label: "Finding missing values", endpoint: "/api/run/missing" },
  { id: "duplicates", label: "Finding duplicates", endpoint: "/api/run/duplicates" },
  { id: "outliers", label: "Identifying outliers", endpoint: "/api/run/outliers" },
  { id: "logical", label: "Logical checks", endpoint: "/api/run/logical" },
]

export function LoaderSequence({ fileId, runId, onComplete, onError }: LoaderSequenceProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [stepResults, setStepResults] = useState<Record<string, StepResult>>({})
  const [isRetrying, setIsRetrying] = useState(false)
  const [showHourglassLoader, setShowHourglassLoader] = useState(false)

  useEffect(() => {
    // Initialize all steps as pending
    const initialResults: Record<string, StepResult> = {}
    STEPS.forEach((step) => {
      initialResults[step.id] = { status: "pending" }
    })
    setStepResults(initialResults)

    // Start the sequence
    // slight delay so initial UI state renders
    setTimeout(() => runStep(0), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, runId])

  const runStep = async (stepIndex: number) => {
    if (stepIndex >= STEPS.length) {
      // All steps completed successfully -> assemble final results
      await finalizeAndReturn()
      return
    }

    const step = STEPS[stepIndex]
    setCurrentStep(stepIndex)

    // Update step status to loading
    setStepResults((prev) => ({
      ...prev,
      [step.id]: { status: "loading" },
    }))

    try {
      const bodyPayload: any = {
        fileId,
        runId, // include runId (may be undefined) so server can persist per-run if provided
        // Add step-specific parameters
        ...(step.id === "duplicates" && { key: "transaction_id", limit: 10 }),
        ...(step.id === "outliers" && {
          column: "discount_pct",
          methods: ["percentile", "zscore"],
          thresholds: { percentile_upper: 0.99, zscore: 3, business_upper_pct: 50 },
        }),
        ...(step.id === "logical" && {
          rules: ["net_price<=0", "discount_pct>100", "fk:product_id->products.product_id"],
        }),
      }

      const response = await fetch(step.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      })

      let result: any = {}
      try {
        result = await response.json().catch(() => ({}))
      } catch {
        result = {}
      }

      if (response.ok && (result.status === "success" || result.status === undefined)) {
        // If your endpoints return custom shapes (not status:'success'), we still accept response.ok
        // Generate summary based on step type
        let summary = ""
        switch (step.id) {
          case "count":
            summary = `${result.rows ?? result.count ?? "N/A"} rows, ${result.cols ?? result.columns ?? "N/A"} columns`
            break
          case "missing":
            summary = result.insights?.[0] || result.message || "No missing values found"
            break
          case "duplicates":
            summary = `${result.total_duplicate_rows ?? result.total_duplicates ?? 0} duplicates found`
            break
          case "outliers":
            summary = result.insights?.[0] || result.message || "No outliers detected"
            break
          case "logical":
            // accept array or string
            summary = Array.isArray(result.insights)
              ? result.insights.join(", ")
              : (result.insights ?? result.message ?? "All logical checks passed")
            break
        }

        setStepResults((prev) => ({
          ...prev,
          [step.id]: {
            status: "success",
            data: result,
            summary,
          },
        }))

        // Move to next step after a brief delay
        setTimeout(() => runStep(stepIndex + 1), 500)
      } else {
        const errorMessage = result?.error || result?.message || `HTTP ${response.status}`
        throw new Error(errorMessage)
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"

      setStepResults((prev) => ({
        ...prev,
        [step.id]: {
          status: "error",
          error: errorMessage,
        },
      }))
    }
  }

  const finalizeAndReturn = async () => {
    setShowHourglassLoader(true)

    // Build finalResults from stepResults data (map to the UI shape)
    const finalResults: any = {
      counting: stepResults["count"]?.data ?? {},
      missing: stepResults["missing"]?.data ?? {},
      duplicates: stepResults["duplicates"]?.data ?? {},
      outliers: stepResults["outliers"]?.data ?? {},
      logical: stepResults["logical"]?.data ?? {},
      meta: {
        fileId,
        runId,
        completedAt: new Date().toISOString(),
      },
    }

    // Normalize a few helpful fields for UI convenience
    // count step commonly returns rows/cols
    if (!finalResults.counting.rows && finalResults.counting.count) {
      finalResults.counting.rows = finalResults.counting.count
    }
    if (!finalResults.counting.cols && finalResults.counting.columns) {
      finalResults.counting.cols = finalResults.counting.columns
    }

    // if runId exists, attempt to persist aggregated result server-side (non-blocking)
    if (runId) {
      try {
        await fetch("/api/report/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId, analysis: finalResults }),
        })
        // ignore response; it's best-effort (server should already incrementally persisted each step if implemented)
      } catch (err) {
        // non-fatal; log to console
        console.warn("Failed to persist final results to /api/report/save:", err)
      }
    }

    // Return results to parent
    try {
      onComplete(finalResults)
    } catch (e: any) {
      onError(String(e?.message ?? e))
    }
  }

  const handleRetry = () => {
    setIsRetrying(true)

    // Reset failed step and continue from there
    const failedStepIndex = STEPS.findIndex((step) => stepResults[step.id]?.status === "error")
    if (failedStepIndex !== -1) {
      setStepResults((prev) => ({
        ...prev,
        [STEPS[failedStepIndex].id]: { status: "pending" },
      }))

      setTimeout(() => {
        setIsRetrying(false)
        runStep(failedStepIndex)
      }, 1000)
    }
  }

  const successCount = Object.values(stepResults).filter((r) => r.status === "success").length
  const progress = (successCount / STEPS.length) * 100
  const hasError = Object.values(stepResults).some((r) => r.status === "error")
  const errorStep = STEPS.find((step) => stepResults[step.id]?.status === "error")

  return (
    <div className="space-y-6 py-4">
      {showHourglassLoader ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Hourglass size="50" color="#312e81" />
          <p className="text-sm text-muted-foreground">Preparing your results...</p>
        </div>
      ) : (
        <>
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Steps List */}
          <div className="space-y-3">
            {STEPS.map((step, index) => {
              const result = stepResults[step.id]
              const isActive = currentStep === index && result?.status === "loading"

              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                    isActive && "bg-muted/50 border-primary",
                    result?.status === "success" && "bg-green-50 border-green-200",
                    result?.status === "error" && "bg-red-50 border-red-200",
                  )}
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {result?.status === "loading" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {result?.status === "success" && <Check className="h-4 w-4 text-green-600" />}
                    {result?.status === "error" && <X className="h-4 w-4 text-red-600" />}
                    {result?.status === "pending" && (
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>

                  {/* Step Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{step.label}</p>
                    {result?.summary && <p className="text-xs text-muted-foreground mt-1">{result.summary}</p>}
                    {result?.error && <p className="text-xs text-red-600 mt-1">{result.error}</p>}
                  </div>

                  {/* Step Number */}
                  <div className="flex-shrink-0 text-xs text-muted-foreground">
                    {index + 1}/{STEPS.length}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Error Actions */}
          {hasError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {errorStep && `Failed at step: ${errorStep.label}. ${stepResults[errorStep.id]?.error}`}
              </AlertDescription>
            </Alert>
          )}

          {hasError && (
            <div className="flex gap-3">
              <Button onClick={handleRetry} disabled={isRetrying} size="sm">
                {isRetrying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Retry
                  </>
                )}
              </Button>

            </div>
          )}
        </>
      )}
    </div>
  )
}

export default LoaderSequence
