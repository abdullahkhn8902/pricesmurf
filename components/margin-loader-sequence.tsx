"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Check, X, RotateCcw, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

// @ts-ignore
import { Hourglass } from "ldrs/react"
import "ldrs/react/Hourglass.css"

interface MarginLoaderSequenceProps {
  fileId: string
  runId?: string
  onComplete: (results: any, runId?: string) => void
  onError: (error: string) => void
}

interface StepResult {
  status: "pending" | "loading" | "success" | "error"
  data?: any
  error?: string
  summary?: string
}

const MARGIN_STEPS = [
  { id: "pricing", label: "Analyzing pricing structure", endpoint: "/api/margin/pricing" },
  { id: "costs", label: "Calculating cost margins", endpoint: "/api/margin/costs" },
  { id: "leakage", label: "Identifying margin leakage", endpoint: "/api/margin/leakage" },
  { id: "segments", label: "Analyzing customer segments", endpoint: "/api/margin/segments" },
  { id: "recommendations", label: "Generating recommendations", endpoint: "/api/margin/recommendations" },
]

export function MarginLoaderSequence({ fileId, runId, onComplete, onError }: MarginLoaderSequenceProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [stepResults, setStepResults] = useState<Record<string, StepResult>>({})
  const [isRetrying, setIsRetrying] = useState(false)
  const [showHourglassLoader, setShowHourglassLoader] = useState(false)

  // Accumulator ref — always up-to-date, avoids stale closure problems
  const accumRef = useRef<Record<string, any>>({})

  // Abort controller to cancel long requests when component unmounts
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // init state
    const initialResults: Record<string, StepResult> = {}
    MARGIN_STEPS.forEach((step) => {
      initialResults[step.id] = { status: "pending" }
    })
    setStepResults(initialResults)
    accumRef.current = {}
    // start a tiny bit later so UI shows initial state
    const t = setTimeout(() => runStep(0), 50)

    return () => {
      clearTimeout(t)
      try {
        abortRef.current?.abort()
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, runId])

  const runStep = async (stepIndex: number) => {
    if (stepIndex >= MARGIN_STEPS.length) {
      await finalizeAndReturn()
      return
    }

    const step = MARGIN_STEPS[stepIndex]
    setCurrentStep(stepIndex)
    setStepResults((prev) => ({ ...prev, [step.id]: { status: "loading" } }))

    try {
      // Build step-specific payloads
      const bodyPayload: any = {
        fileId,
        runId,
        // example per-step params (keeps your existing behavior)
        ...(step.id === "pricing" && {
          analyze_fields: ["list_price", "net_price", "discount_pct"],
          price_thresholds: { min_price: 0, max_discount: 100 },
        }),
        ...(step.id === "costs" && {
          cost_fields: ["cost", "cogs"],
          margin_thresholds: { min_margin_pct: 10, target_margin_pct: 30 },
        }),
        ...(step.id === "leakage" && {
          leakage_rules: ["net_price < cost", "margin_pct < 5", "discount_pct > 50"],
          priority_threshold: 1000,
        }),
        ...(step.id === "segments" && {
          segment_fields: ["customer_id", "customer_segment", "product_category"],
          analysis_type: "margin_by_segment",
        }),
        ...(step.id === "recommendations" && {
          recommendation_types: ["pricing_optimization", "cost_reduction", "segment_targeting"],
        }),
      }

      // use AbortController so we can cancel if user leaves
      abortRef.current = new AbortController()
      const url = `${step.endpoint}?fileId=${encodeURIComponent(fileId)}`
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify(bodyPayload),
      })

      const text = await response.text().catch(() => "")
      let result: any = {}
      try {
        result = text ? JSON.parse(text) : {}
      } catch {
        result = { rawText: text }
      }

      if (!response.ok) {
        const message = result?.error || result?.message || `HTTP ${response.status}`
        throw new Error(message)
      }

      // Save raw result object into accumRef to guarantee it's present later
      accumRef.current[step.id] = result

      // Create a human-friendly summary if possible
      let summary = ""
      switch (step.id) {
        case "pricing":
          summary = `Products: ${result.total_products ?? result.pricing_count ?? "N/A"}, avg discount: ${result.avg_discount_pct ?? "N/A"}`
          break
        case "costs":
          summary = `Avg margin: ${result.avg_margin_pct ?? "N/A"}%`
          break
        case "leakage":
          summary = `${result.leakage_instances ?? result.leakage_count ?? 0} leakage(s) found`
          break
        case "segments":
          summary = `${result.segments_analyzed ?? 0} segments`
          break
        case "recommendations":
          summary = `${result.recommendations_count ?? result.recommendations?.length ?? 0} recommendations`
          break
      }

      setStepResults((prev) => ({ ...prev, [step.id]: { status: "success", data: result, summary } }))

      // small delay so UI can smoothly progress
      setTimeout(() => runStep(stepIndex + 1), 500)
    } catch (err: any) {
      const errMsg = err?.message ?? String(err)
      setStepResults((prev) => ({ ...prev, [step.id]: { status: "error", error: errMsg } }))
    }
  }

  const finalizeAndReturn = async () => {
    setShowHourglassLoader(true)

    // Build final results from accumRef (use the actual responses we stored)
    const acc = accumRef.current || {}

    const recommendationsData = acc.recommendations ?? {}
    const priorityActions = recommendationsData.priority_actions ?? []
    const quickWins = recommendationsData.quick_wins ?? []

    const remediationSuggestions = [
      ...priorityActions.map((action: any) => ({
        type: action.category || action.action || "Optimization",
        description: action.action || action.rationale || "",
        impact_estimate: action.impact || "Unknown impact",
        confidence: action.priority === "high" ? 0.9 : action.priority === "medium" ? 0.7 : 0.5,
        rationale: action.rationale || "",
        priority: action.priority || "medium",
      })),
      ...quickWins.map((win: any) => ({
        type: "Quick Win",
        description: win.action || "",
        impact_estimate: win.impact || "Unknown impact",
        confidence: 0.8,
        effort: win.effort || "low",
        priority: "high",
      })),
    ]

    const finalResults: any = {
      pricing: acc.pricing ?? acc.pricing_raw ?? acc.pricingResults ?? {},
      costs: acc.costs ?? acc.costs_raw ?? {},
      leakage: acc.leakage ?? acc.leakage_raw ?? {},
      segments: acc.segments ?? acc.segments_raw ?? {},
      recommendations: acc.recommendations ?? acc.recommendations_raw ?? {},
      // keep compatibility with existing UI expecting `top_product_losses` etc in top-level
      top_product_losses:
        acc.recommendations?.top_product_losses ??
        acc.leakage?.top_product_losses ??
        acc.pricing?.top_product_losses ??
        [],
      top_customer_losses: acc.leakage?.top_customer_losses ?? [],
      product_customer_pairs_below_cost: acc.leakage?.product_customer_pairs_below_cost ?? [],
      samples: acc.samples ??
        acc.pricing?.samples ??
        acc.leakage?.samples ?? { below_cost: [], low_margin: [], extreme_discount: [] },
      remediation_suggestions: remediationSuggestions,
      severity_summary: recommendationsData.severity_summary ??
        acc.segments?.severity_summary ??
        acc.leakage?.severity_summary ?? {
          critical: priorityActions.filter((a: any) => a.priority === "critical").length,
          high: priorityActions.filter((a: any) => a.priority === "high").length + quickWins.length,
          medium: priorityActions.filter((a: any) => a.priority === "medium").length,
          low: priorityActions.filter((a: any) => a.priority === "low").length,
        },
      sql_queries: {
        below_cost: acc.leakage?.sql ?? acc.pricing?.sql ?? acc.segments?.sql ?? "",
        low_margin: acc.pricing?.sql ?? "",
        customer_level: acc.segments?.sql ?? "",
      },
      meta: {
        fileId,
        runId,
        completedAt: new Date().toISOString(),
        analysis_type: "margin_leakage",
      },
    }

    // Best-effort save to server (non-blocking — but we wait for it)
    if (runId) {
      try {
        const saveResp = await fetch("/api/margin-report/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId, analysis: finalResults }),
        })
        // we do not throw on non-OK; server may upsert; log for debugging
        if (!saveResp.ok) {
          console.warn("Saving final results to server failed", saveResp.status, await saveResp.text().catch(() => ""))
        }
      } catch (e) {
        console.warn("Persist final results failed", e)
      }
    }

    // Finally call parent's onComplete with the final structured result
    try {
      onComplete(finalResults, runId)
    } catch (e: any) {
      onError(String(e?.message ?? e))
    }
  }

  const handleRetry = () => {
    setIsRetrying(true)
    const failedStepIndex = MARGIN_STEPS.findIndex((step) => stepResults[step.id]?.status === "error")
    if (failedStepIndex !== -1) {
      setStepResults((prev) => ({ ...prev, [MARGIN_STEPS[failedStepIndex].id]: { status: "pending" } }))
      setTimeout(() => {
        setIsRetrying(false)
        runStep(failedStepIndex)
      }, 1000)
    }
  }

  const successCount = Object.values(stepResults).filter((r) => r.status === "success").length
  const progress = (successCount / MARGIN_STEPS.length) * 100
  const hasError = Object.values(stepResults).some((r) => r.status === "error")
  const errorStep = MARGIN_STEPS.find((step) => stepResults[step.id]?.status === "error")

  return (
    <div className="space-y-6 py-4">
      {showHourglassLoader ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Hourglass size="50" color="#312e81" />
          <p className="text-sm text-muted-foreground">Preparing your results...</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Margin Analysis Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="space-y-3">
            {MARGIN_STEPS.map((step, index) => {
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
                  <div className="flex-shrink-0">
                    {result?.status === "loading" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {result?.status === "success" && <Check className="h-4 w-4 text-green-600" />}
                    {result?.status === "error" && <X className="h-4 w-4 text-red-600" />}
                    {result?.status === "pending" && (
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{step.label}</p>
                    {result?.summary && <p className="text-xs text-muted-foreground mt-1">{result.summary}</p>}
                    {result?.error && <p className="text-xs text-red-600 mt-1">{result.error}</p>}
                  </div>

                  <div className="flex-shrink-0 text-xs text-muted-foreground">
                    {index + 1}/{MARGIN_STEPS.length}
                  </div>
                </div>
              )
            })}
          </div>

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
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const debugData = {
                    fileId,
                    runId,
                    steps: stepResults,
                    accumulated: accumRef.current,
                    timestamp: new Date().toISOString(),
                  }
                  const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: "application/json" })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement("a")
                  a.href = url
                  a.download = "margin-debug-log.json"
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                Download Debug Log
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default MarginLoaderSequence
