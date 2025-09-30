"use client"

import React, { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  ChevronDown,
  ChevronRight,
  Copy,
  CheckCircle,
  Download,
  ArrowLeft,
  Database,
  Search,
  AlertTriangle,
  BarChart3,
  Shield,
} from "lucide-react"

type AnyObj = Record<string, any>

interface SubAgentResult {
  name: string
  icon: React.ComponentType<{ className?: string }>
  status: "completed" | "failed"
  insights: string[]
  sql: string
  samples: any[]
  all_duplicate_rows?: any[]
  metadata?: any
}

interface DuplicateDisplayState {
  showAll: boolean;
}

/** Helpers **/
function safeNumber(v: any) {
  if (typeof v === "number") return v
  if (v == null) return 0
  // handle Mongo extended JSON shapes
  if (typeof v === "object") {
    if ("$numberInt" in v) return Number(v.$numberInt)
    if ("$numberDouble" in v) return Number(v.$numberDouble)
    if ("$numberLong" in v) return Number(v.$numberLong)
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function safeArray(v: any) {
  return Array.isArray(v) ? v : []
}

/** Build analysis from legacy steps shape **/
function buildAnalysisFromSteps(doc: AnyObj) {
  const steps = doc.steps || {}
  console.log("Building from steps:", Object.keys(steps));

  const toNumber = (x: any) => safeNumber(x)

  const countStep = steps.count || {}
  const counting = {
    rows: toNumber(countStep.rows ?? countStep.count ?? countStep.rows_count ?? 0),
    cols: toNumber(countStep.cols ?? countStep.columns ?? 0),
    insights: safeArray(countStep.insights || countStep.insight || []),
    sql: countStep.sql || "",
    samples: safeArray(countStep.samples || []),
    status: countStep.status || "completed"
  }

  const missingStep = steps.missing || {}
  const missing = {
    insights: safeArray(missingStep.insights || missingStep.insight || []),
    columnSummary: missingStep.columnSummary || missingStep.column_summary || {},
    sql: missingStep.sql || "",
    samples: safeArray(missingStep.samples || []),
    status: missingStep.status || "completed",
    total_missing: calculateTotalMissing(missingStep.columnSummary)
  }

  const dupStep = steps.duplicates || {}
  const duplicates = {
    total_duplicate_rows: toNumber(dupStep.total_duplicate_rows ?? dupStep.total_duplicates ?? 0),
    unique_duplicate_ids: toNumber(dupStep.unique_duplicate_ids ?? 0),
    top_duplicate_ids: dupStep.top_duplicate_ids || dupStep.top_duplicates || {},
    insights: safeArray(dupStep.insights || dupStep.insight || []),
    sql: dupStep.sql || "",
    samples: safeArray(dupStep.samples || []),
    all_duplicate_rows: safeArray(dupStep.all_duplicate_rows || []),
    status: dupStep.status || "completed"
  }

  const outStep = steps.outliers || {}
  const outliers = {
    outlier_counts: outStep.outlier_counts || outStep.counts || {},
    insights: safeArray(outStep.insights || outStep.insight || []),
    sql: outStep.sql || "",
    samples: safeArray(outStep.samples || []),
    status: outStep.status || "completed"
  }

  const logStep = steps.logical || {}
  const logical = {
    insights: safeArray(logStep.insights || logStep.insight || []),
    sql: logStep.sql || "",
    samples: safeArray(logStep.samples || []),
    status: logStep.status || "completed"
  }

  const meta = {
    fileId: doc.fileId ?? doc.steps?.meta?.fileId ?? null,
    runId: doc.runId ?? null,
    completedAt: doc.updatedAt ?? doc.createdAt ?? null,
    qualityScore: doc.analysis?.meta?.qualityScore ?? doc.steps?.meta?.qualityScore ?? 0,
    criticalIssues: doc.analysis?.meta?.criticalIssues ?? doc.steps?.meta?.criticalIssues ?? 0,
  }

  return { counting, missing, duplicates, outliers, logical, meta }
}

/** Helper to calculate total missing values from columnSummary */
function calculateTotalMissing(columnSummary: any): number {
  if (!columnSummary || typeof columnSummary !== 'object') return 0;

  let total = 0;
  Object.values(columnSummary).forEach((column: any) => {
    if (column && typeof column === 'object') {
      total += safeNumber(column.null_count ?? column.missing_count ?? 0);
    }
  });
  return total;
}

/** Normalize server response into stable UI shape **/
function normalizeResults(raw: AnyObj | null) {
  if (!raw) {
    return { counting: {}, missing: {}, duplicates: {}, outliers: {}, logical: {}, meta: {} }
  }

  console.log("Raw API data for debugging:", JSON.stringify(raw, null, 2));

  // If server returned an `analysis` object and it has actual data (not just empty objects), prefer it
  if (
    raw.analysis &&
    Object.keys(raw.analysis).length > 0 &&
    !(
      Object.keys(raw.analysis).every(
        (key) => key === "meta" || (raw.analysis[key] && Object.keys(raw.analysis[key]).length === 0)
      )
    )
  ) {
    console.log("Using analysis branch");
    return {
      counting: raw.analysis.counting || {},
      missing: raw.analysis.missing || {},
      duplicates: raw.analysis.duplicates || {},
      outliers: raw.analysis.outliers || {},
      logical: raw.analysis.logical || {},
      meta: raw.analysis.meta || { fileId: raw.fileId, runId: raw.runId },
    };
  }

  // If server returned data in `steps` structure (which it does), use that
  if (raw.steps && Object.keys(raw.steps).length > 0) {
    console.log("Using steps branch - building from steps");
    return buildAnalysisFromSteps(raw);
  }

  // If analysis exists but is empty (like your case), also build from steps
  if (raw.analysis && raw.steps) {
    console.log("Analysis empty but steps exist - building from steps");
    return buildAnalysisFromSteps(raw);
  }

  // final fallback - use top-level keys if present
  console.log("Using fallback branch");
  return {
    counting: raw.counting || {},
    missing: raw.missing || {},
    duplicates: raw.duplicates || {},
    outliers: raw.outliers || {},
    logical: raw.logical || {},
    meta: raw.meta || { fileId: raw.fileId, runId: raw.runId },
  }
}

/** Render component **/
export default function ResultsPage() {
  const params = useParams()
  const router = useRouter()

  // Narrow the param value safely to a string (avoid ParamValue typing issue)
  const rawRun = (params as any)?.runId
  let runId = ""
  if (Array.isArray(rawRun)) runId = String(rawRun[0] ?? "")
  else runId = String(rawRun ?? "")

  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({})
  const [copiedSql, setCopiedSql] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [duplicateDisplay, setDuplicateDisplay] = useState<DuplicateDisplayState>({
    showAll: false,
  })

  useEffect(() => {
    if (!runId) {
      setError("No run ID provided")
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchResults = async () => {
      try {
        setError(null)
        setLoading(true)
        console.debug("Fetching results for runId:", runId)

        const res = await fetch(`/api/report/${encodeURIComponent(runId)}`)
        console.debug("API /api/report response status:", res.status)

        if (!res.ok) {
          const txt = await res.text().catch(() => "")
          console.error("API returned non-OK:", res.status, txt)
          throw new Error(`API returned ${res.status}`)
        }

        const data = await res.json()
        console.debug("Raw API response data:", data)

        const normalized = normalizeResults(data)
        console.debug("Normalized results for UI:", normalized)

        if (!cancelled) {
          setResults(normalized)
          try {
            localStorage.setItem(`results_${runId}`, JSON.stringify(normalized))
          } catch (e) {
            console.warn("Could not write results to localStorage:", e)
          }
        }
      } catch (err: any) {
        console.error("Failed to fetch results:", err)
        setError(err instanceof Error ? err.message : String(err))

        // fallback to cached copy
        try {
          const stored = localStorage.getItem(`results_${runId}`)
          if (stored) {
            const parsed = JSON.parse(stored)
            console.debug("Using cached results from localStorage")
            if (!cancelled) setResults(parsed)
          }
        } catch (e) {
          console.warn("Cached fallback also failed", e)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchResults()
    return () => {
      cancelled = true
    }
  }, [runId])

  const toggleSection = (sectionName: string) => {
    setExpandedSections((prev) => ({ ...prev, [sectionName]: !prev[sectionName] }))
  }

  const toggleTable = (sectionName: string) => {
    setExpandedTables((prev) => ({ ...prev, [sectionName]: !prev[sectionName] }))
  }

  const handleCopySQL = async (sql: string, type: string) => {
    try {
      await navigator.clipboard.writeText(sql)
      setCopiedSql(type)
      setTimeout(() => setCopiedSql(null), 2000)
    } catch (error) {
      console.error("Failed to copy SQL:", error)
    }
  }

  const handleExportReport = () => {
    if (!results) return

    const exportData = {
      runId,
      timestamp: new Date().toISOString(),
      overview: {
        totalRows: results?.counting?.rows ?? results?.counting?.count ?? 0,
        totalColumns: results?.counting?.cols ?? results?.counting?.columns ?? 0,
        missingValues: results?.missing?.total_missing ?? results?.missing?.missing_count ?? 0,
        duplicates: results?.duplicates?.total_duplicate_rows ?? results?.duplicates?.total_duplicates ?? 0,
        qualityScore: results?.meta?.qualityScore ?? 0,
      },
      detailedResults: results,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `data-quality-report-${runId}-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const renderSampleTable = (samples: any[], sectionName: string, isDuplicatesSection: boolean = false, allDuplicateRows: any[] = []) => {
    // For duplicates section, use special logic
    if ((isDuplicatesSection || sectionName === "Counting") && Array.isArray(allDuplicateRows) && allDuplicateRows.length > 0) {
      const showAll = duplicateDisplay.showAll;
      const displayedRows = showAll ? allDuplicateRows : allDuplicateRows.slice(0, 5);
      const headers = allDuplicateRows.length > 0 ? Object.keys(allDuplicateRows[0]) : [];

      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm text-foreground">
              Duplicate Rows ({allDuplicateRows.length} total rows)
            </h4>
            {allDuplicateRows.length > 5 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDuplicateDisplay(prev => ({
                  showAll: !prev.showAll
                }))}
                className="h-7 text-xs"
              >
                {showAll ? "Show Less" : `Show All ${allDuplicateRows.length} Duplicates`}
              </Button>
            )}
          </div>

          <div className="border rounded-lg overflow-hidden bg-card">
            <ScrollArea className="h-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {headers.map((header) => (
                      <th key={header} className="px-3 py-2 text-left font-medium text-foreground">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((sample, index) => (
                    <tr key={index} className="border-t hover:bg-muted/20">
                      {headers.map((header) => (
                        <td key={header} className="px-3 py-2 text-muted-foreground">
                          {sample[header] !== undefined && sample[header] !== null ? String(sample[header]) : "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>

          {!showAll && allDuplicateRows.length > 5 && (
            <div className="text-center text-sm text-muted-foreground">
              Showing 5 of {allDuplicateRows.length} duplicate rows
            </div>
          )}
        </div>
      );
    }

    // Original logic for other sections
    if (!samples || samples.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg">
          No sample data available
        </div>
      )
    }

    const headers = samples.length > 0 ? Object.keys(samples[0]) : []
    const isExpanded = expandedTables[sectionName]
    const displaySamples = isExpanded ? samples : samples.slice(0, 3)

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm text-foreground">Sample Data ({samples.length} records)</h4>
          {samples.length > 3 && (
            <Button variant="outline" size="sm" onClick={() => toggleTable(sectionName)} className="h-7 text-xs">
              {isExpanded ? "Show Less" : `Show All ${samples.length}`}
            </Button>
          )}
        </div>

        <div className="border rounded-lg overflow-hidden bg-card">
          <ScrollArea className="h-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {headers.map((header) => (
                    <th key={header} className="px-3 py-2 text-left font-medium text-foreground">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displaySamples.map((sample, index) => (
                  <tr key={index} className="border-t hover:bg-muted/20">
                    {headers.map((header) => (
                      <td key={header} className="px-3 py-2 text-muted-foreground">
                        {sample[header] !== undefined && sample[header] !== null ? String(sample[header]) : "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading analysis results...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md mx-auto">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Error Loading Results</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={() => router.push("/")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
          <h2 className="text-xl font-bold text-foreground">No Results Found</h2>
          <p className="text-muted-foreground">The analysis results could not be loaded.</p>
          <Button onClick={() => router.push("/")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    )
  }

  // Compute summary stats safely
  const totalRows = safeNumber(results.counting?.rows ?? results.counting?.count ?? 0)
  const totalCols = safeNumber(results.counting?.cols ?? results.counting?.columns ?? 0)
  const missingValuesCount = safeNumber(results.missing?.total_missing ?? results.missing?.missing_count ?? 0)
  const duplicatesCount = safeNumber(results.duplicates?.total_duplicate_rows ?? results.duplicates?.total_duplicates ?? 0)

  // --- Compute quality score ---
  let computedScore = safeNumber(results.meta?.qualityScore ?? 0)
  if (!computedScore || computedScore <= 0) {
    const totalRowsSafe = totalRows > 0 ? totalRows : 1
    const totalCells = totalRowsSafe * totalCols

    const missingPenalty = totalCells > 0 ? (missingValuesCount / totalCells) * 40 : 0
    const duplicatePenalty = (duplicatesCount / totalRowsSafe) * 30
    const outlierPenalty = safeNumber(Object.values(results.outliers?.outlier_counts || {}).reduce((a: number, b: any) => a + safeNumber(b), 0)) / totalRowsSafe * 20
    const logicalPenalty = (Array.isArray(results.logical?.samples) ? results.logical.samples.length : 0) / totalRowsSafe * 10

    computedScore = Math.max(0, 100 - (missingPenalty + duplicatePenalty + outlierPenalty + logicalPenalty))
    computedScore = Math.round(computedScore)
  }
  const qualityScore = computedScore
  // Ensure Counting shows rows/cols as a Key Insight even if other insights exist
  const countingInsights: string[] = Array.isArray(results.counting?.insights) ? [...results.counting.insights] : []
  const rowsColsLine = `Dataset contains ${totalRows} rows and ${totalCols} columns`
  if (!countingInsights.some(s => typeof s === 'string' && s.includes(`${totalRows}`) && s.includes(`${totalCols}`))) {
    // put rows/cols as the first insight so users see it immediately
    countingInsights.unshift(rowsColsLine)
  }

  const subAgents: SubAgentResult[] = [
    {
      name: "Counting",
      icon: Database,
      status: "completed",
      insights: countingInsights,
      sql: results.counting?.sql || "SELECT COUNT(*) as total_rows FROM dataset;",
      samples: Array.isArray(results.counting?.samples) ? results.counting.samples : [],
      metadata: { rows: totalRows, columns: totalCols },
    },
    {
      name: "Missing Values",
      icon: Search,
      status: "completed",
      insights: Array.isArray(results.missing?.insights) ? results.missing.insights : [`Found ${missingValuesCount} missing values across dataset`],
      sql: results.missing?.sql || "SELECT column_name, COUNT(*) as missing_count FROM dataset WHERE column_name IS NULL GROUP BY column_name;",
      samples: Array.isArray(results.missing?.samples) ? results.missing.samples : [],
    },
    {
      name: "Duplicates",
      icon: AlertTriangle,
      status: "completed",
      insights: Array.isArray(results.duplicates?.insights)
        ? results.duplicates.insights
        : [`# Duplicate Rows found in this data: ${duplicatesCount}`],
      sql: results.duplicates?.sql || "SELECT column_name, COUNT(*) as duplicate_count FROM dataset GROUP BY column_name HAVING COUNT(*) > 1;",
      samples: Array.isArray(results.duplicates?.samples) ? results.duplicates.samples : [],
      all_duplicate_rows: Array.isArray(results.duplicates?.all_duplicate_rows) ? results.duplicates.all_duplicate_rows : [],
    },
    {
      name: "Outliers",
      icon: BarChart3,
      status: "completed",
      insights: Array.isArray(results.outliers?.insights) ? results.outliers.insights : ["Outlier analysis completed"],
      sql: results.outliers?.sql || "SELECT * FROM dataset WHERE value > (SELECT AVG(value) + 3*STDDEV(value) FROM dataset);",
      samples: Array.isArray(results.outliers?.samples) ? results.outliers.samples : [],
    },
    {
      name: "Logical Checks",
      icon: Shield,
      status: "completed",
      insights: Array.isArray(results.logical?.insights) ? results.logical.insights : ["Logical consistency checks completed"],
      sql: results.logical?.sql || "SELECT * FROM dataset WHERE logical_condition IS FALSE;",
      samples: Array.isArray(results.logical?.samples) ? results.logical.samples : [],
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card shadow-sm ">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push("/")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Agents
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground">Data Quality Analysis Results</h1>
              <p className="text-muted-foreground mt-1">
                Comprehensive analysis completed • Run ID: {runId}
                {results.meta?.fileId && ` • File ID: ${results.meta.fileId}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportReport}>
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Results Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Database className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold text-blue-900">{totalRows.toLocaleString()}</p>
                    <p className="text-sm text-blue-700">Total Rows</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Search className="h-8 w-8 text-amber-600" />
                  <div>
                    <p className="text-2xl font-bold text-amber-900">{missingValuesCount.toLocaleString()}</p>
                    <p className="text-sm text-amber-700">Missing Values</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                  <div>
                    <p className="text-2xl font-bold text-red-900">{duplicatesCount.toLocaleString()}</p>
                    <p className="text-sm text-red-700">Duplicates</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold text-green-900">{qualityScore}%</p>
                    <p className="text-sm text-green-700">Quality Score</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sub-Agent Results */}
          <div className="space-y-4">
            {subAgents.map((agent) => {
              const IconComponent = agent.icon
              const isExpanded = expandedSections[agent.name] || false

              return (
                <Card key={agent.name} className="overflow-hidden">
                  <CardHeader
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleSection(agent.name)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <IconComponent className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{agent.name}</CardTitle>
                          <CardDescription>
                            {agent.status === "completed" ? "Analysis completed" : "Analysis failed"}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={agent.status === "completed" ? "default" : "destructive"}>
                          {agent.status}
                        </Badge>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-6 pt-4">
                      {/* Human Insights */}
                      <div className="space-y-3">
                        <h4 className="font-semibold text-foreground flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          Key Insights
                        </h4>
                        <div className="space-y-2">
                          {agent.insights.length === 0 ? (
                            <div className="text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg">
                              No insights available for this analysis
                            </div>
                          ) : (
                            agent.insights.map((insight, index) => (
                              <div key={index} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                                <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                                <p className="text-sm text-foreground">{insight}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <Separator />

                      {/* SQL Query */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-foreground">SQL Query</h4>
                          <Button variant="outline" size="sm" onClick={() => handleCopySQL(agent.sql, agent.name)} className="h-7">
                            {copiedSql === agent.name ? (
                              <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                            ) : (
                              <Copy className="h-3 w-3 mr-1" />
                            )}
                            {copiedSql === agent.name ? "Copied!" : "Copy"}
                          </Button>
                        </div>
                        <div className="bg-muted/50 p-4 rounded-lg border">
                          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap overflow-x-auto">{agent.sql}</pre>
                        </div>
                      </div>

                      <Separator />

                      {agent.name === "Counting" ? null : renderSampleTable(
                        agent.samples,
                        agent.name,
                        agent.name === "Duplicates" ? true : false,
                        agent.name === "Duplicates" ? (agent.all_duplicate_rows ?? []) : (results.counting?.all_rows ?? [])
                      )}


                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
