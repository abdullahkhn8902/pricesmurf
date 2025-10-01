"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { MarginResultsView } from "@/components/margin-results-view"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react"
import Link from "next/link"

/**
 * Safe JSON parse helper
 */
function tryParseJSON(maybe: any) {
  if (maybe == null) return null
  if (typeof maybe === "object") return maybe
  if (typeof maybe === "string") {
    const s = maybe.trim()
    // if it looks like JSON in backticks / fenced block, try to extract first object
    try {
      return JSON.parse(s)
    } catch {
      // try to find first {...} block inside
      const start = s.indexOf("{")
      const end = s.lastIndexOf("}")
      if (start !== -1 && end !== -1 && end > start) {
        try {
          return JSON.parse(s.slice(start, end + 1))
        } catch {
          return null
        }
      }
      return null
    }
  }
  return null
}

/**
 * Build a canonical flattened analysis object that MarginResultsView expects.
 * Accepts many shapes (analysis.pricing, analysis.costs, analysis.leakage, analysis.samples, or already-flat).
 */
function normalizeMarginAnalysis(rawInput: any) {
  if (!rawInput) return null

  // Extract the main analysis object
  const analysis = rawInput.analysis || rawInput
  const meta = rawInput.meta || { fileId: rawInput.fileId, runId: rawInput.runId }

  // Create the canonical structure that MarginResultsView expects
  const canonical: any = {
    meta,
    runId: meta.runId || rawInput.runId,
    // Extract arrays from their nested locations
    top_product_losses: [],
    top_customer_losses: [],
    product_customer_pairs_below_cost: [],
    samples: {},
    sql_queries: {},
    severity_summary: { critical: 0, high: 0, medium: 0, low: 0 },
    insights: []
  }

  // Extract data from costs analysis
  if (analysis.costs) {
    if (analysis.costs.worst_performers && Array.isArray(analysis.costs.worst_performers)) {
      canonical.top_product_losses = analysis.costs.worst_performers.map((item: any) => ({
        product_id: item.product_id,
        loss_amt: item.revenue_impact || 0,
        margin_pct: item.margin_pct || 0,
        revenue: item.net_price || 0,
        qty: 1, // Default quantity
        customers_impacted: 1 // Default customer count
      }))
    }

    if (analysis.costs.samples && Array.isArray(analysis.costs.samples)) {
      canonical.samples.low_margin = analysis.costs.samples
    }
  }

  // Extract data from leakage analysis  
  if (analysis.leakage) {
    if (analysis.leakage.top_leaks && Array.isArray(analysis.leakage.top_leaks)) {
      // Use leakage data to populate product losses if costs didn't have it
      if (canonical.top_product_losses.length === 0) {
        canonical.top_product_losses = analysis.leakage.top_leaks.map((leak: any) => ({
          product_id: leak.product_id,
          loss_amt: leak.total_impact || 0,
          margin_pct: ((leak.net_price - leak.cost) / leak.net_price * 100) || 0,
          revenue: leak.net_price || 0,
          qty: leak.quantity || 1,
          customers_impacted: 1
        }))
      }

      // Extract customer losses from leakage data
      const customerMap = new Map()
      analysis.leakage.top_leaks.forEach((leak: any) => {
        const customerId = leak.customer_id
        if (customerId) {
          if (customerMap.has(customerId)) {
            const existing = customerMap.get(customerId)
            existing.loss_amt += leak.total_impact || 0
          } else {
            customerMap.set(customerId, {
              customer_id: customerId,
              loss_amt: leak.total_impact || 0,
              margin_pct: ((leak.net_price - leak.cost) / leak.net_price * 100) || 0,
              revenue: leak.net_price || 0,
              qty: leak.quantity || 1,
              products_impacted: 1
            })
          }
        }
      })
      canonical.top_customer_losses = Array.from(customerMap.values())

      // Extract below-cost pairs
      canonical.product_customer_pairs_below_cost = analysis.leakage.top_leaks
        .filter((leak: any) => leak.leak_type === 'below_cost_sale')
        .map((leak: any) => ({
          product_id: leak.product_id,
          customer_id: leak.customer_id,
          rows: 1,
          total_margin_amt: leak.total_impact || 0
        }))

      if (analysis.leakage.samples && Array.isArray(analysis.leakage.samples)) {
        canonical.samples.below_cost = analysis.leakage.samples
      }
    }
  }

  // Extract SQL queries
  if (analysis.costs && analysis.costs.sql) {
    canonical.sql_queries.low_margin = analysis.costs.sql
  }
  if (analysis.leakage && analysis.leakage.sql) {
    canonical.sql_queries.below_cost = analysis.leakage.sql
  }
  if (analysis.segments && analysis.segments.sql) {
    canonical.sql_queries.customer_level = analysis.segments.sql
  }

  // Extract insights from various analysis steps
  const insights: string[] = []
  if (analysis.pricing && analysis.pricing.pricing_insights) {
    insights.push(...analysis.pricing.pricing_insights)
  }
  if (analysis.costs && analysis.costs.cost_insights) {
    insights.push(...analysis.costs.cost_insights)
  }
  if (analysis.leakage && analysis.leakage.insights) {
    insights.push(...analysis.leakage.insights)
  }
  if (analysis.segments && analysis.segments.insights) {
    insights.push(...analysis.segments.insights)
  }
  if (analysis.recommendations && analysis.recommendations.insights) {
    insights.push(...analysis.recommendations.insights)
  }

  canonical.insights = insights.filter(insight => insight && typeof insight === 'string')

  // Ensure all arrays exist
  canonical.top_product_losses = canonical.top_product_losses || []
  canonical.top_customer_losses = canonical.top_customer_losses || []
  canonical.product_customer_pairs_below_cost = canonical.product_customer_pairs_below_cost || []
  canonical.samples = canonical.samples || { below_cost: [], low_margin: [] }
  canonical.sql_queries = canonical.sql_queries || {}

  return canonical
}

function parseLocal(raw: string | null) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default function MarginResultsPage() {
  const params = useParams()
  const runIdRaw = (params as any)?.runId
  const runId = Array.isArray(runIdRaw) ? String(runIdRaw[0] ?? "") : String(runIdRaw ?? "")

  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>("Unknown File")

  useEffect(() => {
    if (!runId) {
      setError("No run ID provided")
      setLoading(false)
      return
    }

    const keysToTry = [
      `margin_results_${runId}`,
      `margin-results/${runId}`,
      `margin-results-${runId}`,
      `margin-results_${runId}`,
      runId, // last resort
    ]

    const loadResults = async () => {
      try {
        // Try localStorage keys (in order)
        let found: any = null
        let foundKey: string | null = null
        for (const k of keysToTry) {
          const raw = localStorage.getItem(k)
          if (raw) {
            const parsed = parseLocal(raw)
            found = parsed ?? raw
            foundKey = k
            break
          }
        }

        if (found) {
          console.debug("[MarginResults] Loaded from localStorage key:", foundKey, found)
          const normalized = normalizeMarginAnalysis(found)
          setResults(normalized)
          setFileName(found?.fileName || normalized?.meta?.fileId || "Analysis Results")
          setLoading(false)
          return
        }

        // Not in localStorage — fetch from server
        const response = await fetch(`/api/margin-report/${encodeURIComponent(runId)}`)
        if (!response.ok) {
          const txt = await response.text().catch(() => "")
          throw new Error(`Failed to load results from server: ${response.status} ${txt}`)
        }
        const data = await response.json()

        // Server may return { runId, analysis: {...}, fileName, meta } or may return analysis directly
        const rawAnalysisCandidate = data?.analysis ?? data
        const normalized = normalizeMarginAnalysis(data)
        if (!normalized) throw new Error("Server returned empty/invalid analysis")

        // Persist canonical key to localStorage for quick reloads
        try {
          localStorage.setItem(`margin_results_${runId}`, JSON.stringify(normalized))
        } catch (e) {
          console.warn("Could not write results to localStorage:", e)
        }

        setResults(normalized)
        setFileName(data?.fileName || normalized?.meta?.fileId || "Analysis Results")
      } catch (err: any) {
        console.error("Failed to load margin results:", err)
        setError(err?.message ?? "Failed to load results")
      } finally {
        setLoading(false)
      }
    }

    loadResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p className="text-muted-foreground">Loading margin analysis results...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Error Loading Results
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/app-pages/agents">
              <Button className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Agents
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>No Results Found</CardTitle>
            <CardDescription>The analysis results could not be found.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/app-pages/agents">
              <Button className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Agents
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Link href="/app-pages/agents">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Agents
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Margin Leakage Analysis Results</h1>
              <p className="text-muted-foreground mt-1">Run ID: {runId}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <MarginResultsView results={results} fileName={fileName} onClose={() => window.history.back()} />
      </div>
    </div>
  )
}
