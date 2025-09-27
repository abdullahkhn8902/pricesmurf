"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Download, AlertTriangle, Copy, CheckCircle, XCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface ResultsViewProps {
  results: any
  fileName: string
  onClose: () => void
}

/** Helper: safely convert unknown -> string for rendering */
function safeString(v: unknown): string {
  if (v === null || v === undefined) return "-"
  if (typeof v === "string") return v
  try {
    return String(v)
  } catch {
    return "-"
  }
}

export function ResultsView({ results, fileName, onClose }: ResultsViewProps) {
  const [copiedSql, setCopiedSql] = useState<string | null>(null)

  const handleCopySQL = async (sql: string, type: string) => {
    try {
      await navigator.clipboard.writeText(sql)
      setCopiedSql(type)
      setTimeout(() => setCopiedSql(null), 2000)
    } catch (error) {
      console.error("Failed to copy SQL:", error)
    }
  }

  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "data_quality_summary.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadSamples = () => {
    // Collect all samples from different issue types
    const allSamples = {
      duplicates: (results?.duplicates?.samples as any[]) || [],
      missing: (results?.missing?.samples as any[]) || [],
      outliers: (results?.outliers?.samples as any[]) || [],
      logical: (results?.logical?.samples as any[]) || [],
    }

    // Create CSV content for each type
    const csvFiles: Record<string, string> = {}

    Object.entries(allSamples).forEach(([type, samples]) => {
      if (Array.isArray(samples) && samples.length > 0) {
        const headers = Object.keys(samples[0]).join(",")
        const rows = samples
          .map((sample: any) =>
            Object.values(sample)
              .map((val) => `"${String(val ?? "").replace(/"/g, '""')}"`)
              .join(","),
          )
          .join("\n")
        csvFiles[`${type}_samples.csv`] = `${headers}\n${rows}`
      }
    })

    const firstType = Object.keys(csvFiles)[0]
    if (firstType) {
      const blob = new Blob([csvFiles[firstType]], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = firstType
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const getInsightIcon = (insight: string | unknown) => {
    const s = safeString(insight)
    if (s.includes("0 rows") || s.includes("No ")) {
      return <CheckCircle className="h-4 w-4 text-green-600" />
    }
    if (s.includes("suspicious") || s.includes(">=90%") || s.includes("> 100")) {
      return <XCircle className="h-4 w-4 text-red-600" />
    }
    return <Info className="h-4 w-4 text-blue-600" />
  }

  const renderSampleTable = (samples: any[], title: string) => {
    if (!Array.isArray(samples) || samples.length === 0) {
      return <div className="text-center py-8 text-muted-foreground">No sample data available</div>
    }

    const headers = Object.keys(samples[0] || {})

    return (
      <div className="space-y-3">
        <h4 className="font-medium text-sm">
          {title} (showing {samples.length} samples)
        </h4>
        <div className="border rounded-lg overflow-hidden">
          <ScrollArea className="h-64">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {headers.map((header) => (
                    <th key={header} className="px-3 py-2 text-left font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {samples.map((sample, index) => (
                  <tr key={index} className="border-t">
                    {headers.map((header) => (
                      <td key={header} className="px-3 py-2">
                        {safeString(sample?.[header])}
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

  const renderSQLQuery = (sql: unknown, type: string) => {
    const sqlText = safeString(sql)
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm">SQL Query</h4>
          <Button variant="outline" size="sm" onClick={() => handleCopySQL(sqlText, type)} className="h-7">
            {copiedSql === type ? <CheckCircle className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
            {copiedSql === type ? "Copied!" : "Copy"}
          </Button>
        </div>
        <div className="bg-muted p-3 rounded-lg font-mono text-xs overflow-x-auto">
          <pre className="whitespace-pre-wrap">{sqlText}</pre>
        </div>
      </div>
    )
  }

  // Safe helpers for derived values
  const insightsArray: string[] = Array.isArray(results?.insights) ? (results.insights as string[]) : []
  const duplicates = results?.duplicates ?? {}
  const duplicatesTopEntries: [string, unknown][] = duplicates?.top_duplicate_ids ? Object.entries(duplicates.top_duplicate_ids as Record<string, unknown>) : []
  const missingInsights: string[] = Array.isArray(results?.missing?.insights) ? (results.missing.insights as string[]) : []
  const outlierCountsObj = results?.outliers?.outlier_counts ?? {}
  const outlierTotalCount = Array.isArray(Object.values(outlierCountsObj)) ? Object.values(outlierCountsObj).reduce((a: number, b: any) => a + Number(b ?? 0), 0) : 0
  const logicalInsights: string[] = Array.isArray(results?.logical?.insights) ? (results.logical.insights as string[]) : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">{safeString(fileName)}</h3>
        <div className="flex justify-center gap-2">
          <Button onClick={handleDownloadJSON} size="sm" variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Raw JSON
          </Button>
          <Button onClick={handleDownloadSamples} size="sm" variant="outline">
            <Download className="h-4 w-4 mr-2" />
            All Samples
          </Button>
          <Button onClick={onClose} size="sm">
            Close
          </Button>
        </div>
      </div>

      {/* Insights Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Key Insights
          </CardTitle>
          <CardDescription>Summary of data quality issues found</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {insightsArray.map((insight: string, index: number) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                {getInsightIcon(insight)}
                <span className="text-sm">{safeString(insight)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Results */}
      <Tabs defaultValue="duplicates" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="duplicates">
            Duplicates
            {Number(results?.duplicates?.total_duplicate_rows) > 0 && (
              <Badge variant="destructive" className="ml-2">
                {String(results.duplicates.total_duplicate_rows)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="missing">
            Missing Values
            {missingInsights.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {missingInsights.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="outliers">
            Outliers
            {outlierTotalCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {outlierTotalCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="logical">
            Logical Checks
            {logicalInsights.filter((i) => !i.includes("0 rows")).length > 0 && (
              <Badge variant="destructive" className="ml-2">
                Issues
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="duplicates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Duplicate Records</CardTitle>
              <CardDescription>
                {String(results?.duplicates?.total_duplicate_rows ?? 0)} duplicate rows found across{" "}
                {String(results?.duplicates?.unique_duplicate_ids ?? 0)} unique IDs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {duplicatesTopEntries.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Most Frequent Duplicates</h4>
                  <div className="flex flex-wrap gap-2">
                    {duplicatesTopEntries.map(([id, count]) => (
                      <Badge key={String(id)} variant="outline">
                        {String(id)}: {safeString(count)} times
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {results?.duplicates?.sql && renderSQLQuery(results.duplicates.sql, "duplicates")}

              <Separator />

              {renderSampleTable((results?.duplicates?.samples as any[]) || [], "Duplicate Records")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="missing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Missing Values</CardTitle>
              <CardDescription>Analysis of null and missing data across columns</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {missingInsights.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Missing Value Summary</h4>
                  <div className="space-y-1">
                    {missingInsights.map((insight: string, index: number) => (
                      <div key={index} className="text-sm text-muted-foreground">
                        • {safeString(insight)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {results?.missing?.sql && renderSQLQuery(results.missing.sql, "missing")}

              <Separator />

              {renderSampleTable((results?.missing?.samples as any[]) || [], "Records with Missing Values")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outliers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Outliers</CardTitle>
              <CardDescription>Statistical and business rule outliers detected</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.keys(outlierCountsObj).length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Outlier Counts by Type</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(outlierCountsObj as Record<string, any>).map(([type, count]) => (
                      <div key={type} className="flex justify-between p-2 bg-muted/30 rounded">
                        <span className="text-sm">{type.replace("_", " ")}</span>
                        <Badge variant="outline">{String(count)}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {results?.outliers?.sql && renderSQLQuery(results.outliers.sql, "outliers")}

              <Separator />

              {renderSampleTable((results?.outliers?.samples as any[]) || [], "Outlier Records")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logical" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Logical Checks</CardTitle>
              <CardDescription>Business rule violations and data consistency issues</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {logicalInsights.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Logical Check Results</h4>
                  <div className="space-y-1">
                    {logicalInsights.map((insight: string, index: number) => (
                      <div
                        key={index}
                        className={cn(
                          "flex items-center gap-2 text-sm p-2 rounded",
                          insight.includes("0 rows") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800",
                        )}
                      >
                        {insight.includes("0 rows") ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {safeString(insight)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {results?.logical?.sql && renderSQLQuery(results.logical.sql, "logical")}

              <Separator />

              {renderSampleTable((results?.logical?.samples as any[]) || [], "Logical Rule Violations")}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
