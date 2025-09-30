// components/margin-results-view.tsx
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Download,
  TrendingDown,
  Copy,
  CheckCircle,
  XCircle,
  Info,
  DollarSign,
  Users,
  Package,
  AlertTriangle,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
} from "recharts"

interface MarginResultsViewProps {
  results?: any
  fileName?: string
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

/** Helper: safely convert unknown -> number for rendering */
function safeNumber(v: unknown): number {
  if (typeof v === "number") return v
  const parsed = Number.parseFloat(String(v))
  return isNaN(parsed) ? 0 : parsed
}

export function MarginResultsView({ results, fileName: initialFileName, onClose }: MarginResultsViewProps) {
  const router = useRouter()
  const [localResults, setLocalResults] = useState<any | null>(results ?? null)
  const [fileName, setFileName] = useState<string | null>(initialFileName ?? null)
  const [copiedSql, setCopiedSql] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(!results)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (results) {
      setLocalResults(results)
      if (!fileName && results?.meta?.fileId) setFileName(String(results.meta.fileId))
      if (!fileName && results?.sheetName) setFileName(String(results.sheetName))
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results])

  useEffect(() => {
    if (localResults) {
      setLoading(false)
      return
    }

    // derive runId from URL (last path segment)
    let runId: string | null = null
    try {
      const path = typeof window !== "undefined" ? window.location.pathname : ""
      const parts = path.split("/").filter(Boolean)
      const last = parts[parts.length - 1] || ""
      runId = last || null
    } catch (e) {
      runId = null
    }

    if (!runId) {
      setError("No runId found in URL and no results were provided.")
      setLoading(false)
      return
    }

    (async () => {
      setLoading(true)
      setError(null)

      // Try localStorage first
      try {
        const key = `margin_results_${runId}`
        const raw = localStorage.getItem(key)
        if (raw) {
          const parsed = JSON.parse(raw)
          setLocalResults(parsed)
          if (!fileName && parsed?.meta?.fileId) setFileName(String(parsed.meta.fileId))
          if (!fileName && parsed?.sheetName) setFileName(String(parsed.sheetName))
          setLoading(false)
          return
        }
      } catch (err) {
        console.warn("localStorage access error:", err)
      }

      // Fetch the run by calling the param route (important: path param)
      try {
        const res = await fetch(`/api/margin-report/${encodeURIComponent(runId)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
        if (!res.ok) {
          if (res.status === 404) {
            setError("Results not found on the server. They may still be processing.")
          } else {
            const txt = await res.text().catch(() => "")
            setError(`Failed to fetch results: ${res.status} ${txt}`)
          }
          setLoading(false)
          return
        }
        const json = await res.json().catch(() => null)
        if (!json) {
          setError("Server returned invalid results.")
          setLoading(false)
          return
        }

        // normalize: server may return { runId, analysis, fileName, meta } or return analysis directly
        const analysis = json.analysis ?? json
        setLocalResults(analysis)
        try {
          localStorage.setItem(`margin_results_${runId}`, JSON.stringify(analysis))
        } catch { }
        if (!fileName && analysis?.meta?.fileId) setFileName(String(analysis.meta.fileId))
        if (!fileName && analysis?.sheetName) setFileName(String(analysis.sheetName))
        setLoading(false)
        return
      } catch (err: any) {
        console.error("Error fetching run results:", err)
        setError(String(err?.message ?? err))
        setLoading(false)
        return
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const blob = new Blob([JSON.stringify(localResults ?? {}, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `margin-leakage-report-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadSamples = () => {
    const allSamples = {
      below_cost: (localResults?.samples?.below_cost as any[]) || [],
      low_margin: (localResults?.samples?.low_margin as any[]) || [],
      extreme_discount: (localResults?.samples?.extreme_discount as any[]) || [],
    }

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
    const s = safeString(insight).toLowerCase()
    if (s.includes("below cost") || s.includes("loss")) {
      return <XCircle className="h-4 w-4 text-red-600" />
    }
    if (s.includes("margin") && s.includes("low")) {
      return <AlertTriangle className="h-4 w-4 text-orange-600" />
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

  // Derived render-friendly data from localResults (safe defaults)
  const resultsData = localResults ?? {}
  const insightsArray: string[] = Array.isArray(resultsData?.insights) ? resultsData.insights : []
  const topProductLosses: any[] = Array.isArray(resultsData?.top_product_losses) ? resultsData.top_product_losses : []
  const topCustomerLosses: any[] = Array.isArray(resultsData?.top_customer_losses) ? resultsData.top_customer_losses : []
  const belowCostPairs: any[] = Array.isArray(resultsData?.product_customer_pairs_below_cost)
    ? resultsData.product_customer_pairs_below_cost
    : []
  const severitySummary = resultsData?.severity_summary || { critical: 0, high: 0, medium: 0, low: 0 }

  const totalLoss = topProductLosses.reduce((sum, product) => sum + Math.abs(safeNumber(product.loss_amt)), 0)
  const productsAffected = topProductLosses.length
  const customersAffected = topCustomerLosses.length

  const paretoData = topProductLosses.slice(0, 20).map((product, index) => ({
    product_id: product.product_id,
    loss_amt: Math.abs(safeNumber(product.loss_amt)),
    cumulative_pct: ((index + 1) / Math.max(1, topProductLosses.length)) * 100,
  }))

  const scatterData = topProductLosses.map((product) => ({
    x: safeNumber(product.qty),
    y: safeNumber(product.margin_pct),
    size: safeNumber(product.revenue) / 1000,
    product_id: product.product_id,
    loss_amt: safeNumber(product.loss_amt),
    fill: safeNumber(product.margin_pct) < 0 ? "#ef4444" : safeNumber(product.margin_pct) < 20 ? "#f97316" : "#22c55e",
  }))

  // Loading / error / empty handling
  if (loading) {
    return (
      <div className="py-12 text-center">
        <p>Loading results…</p>
        <p className="text-sm text-muted-foreground mt-2">If this is taking a long time, check logs or open the debug log.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-8 space-y-4">
        <div className="text-center text-red-600 font-medium">Error loading results</div>
        <div className="text-sm text-muted-foreground">{error}</div>
        <div className="flex justify-center gap-2 pt-4">
          <Button onClick={() => router.back()}>Go Back</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (!localResults) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No results available for this run.
        <div className="mt-4">
          <Button onClick={() => router.back()}>Go Back</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">{safeString(fileName ?? resultsData?.meta?.fileId ?? resultsData?.sheetName)}</h3>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Loss</p>
                <p className="text-lg font-bold text-red-600">${totalLoss.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Products Below Cost</p>
                <p className="text-lg font-bold">{productsAffected}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Customers Affected</p>
                <p className="text-lg font-bold">{customersAffected}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-sm text-muted-foreground">Period</p>
                <p className="text-sm font-medium">{safeString(resultsData?.time_window)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Key Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Key Insights
          </CardTitle>
          <CardDescription>Summary of margin leakage issues found</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {insightsArray.length === 0 ? (
              <div className="text-sm text-muted-foreground">No insights available</div>
            ) : (
              insightsArray.map((insight: string, index: number) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                  {getInsightIcon(insight)}
                  <span className="text-sm">{safeString(insight)}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Product Losses (Pareto)</CardTitle>
            <CardDescription>Products ranked by total loss amount</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paretoData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="product_id" angle={-45} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip
                    formatter={(value, name) => [`$${Number(value).toLocaleString()}`, "Loss Amount"]}
                    labelFormatter={(label) => `Product: ${label}`}
                  />
                  <Bar dataKey="loss_amt" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Margin vs Volume Scatter</CardTitle>
            <CardDescription>Products plotted by quantity and margin percentage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart data={scatterData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="x" name="Quantity" />
                  <YAxis dataKey="y" name="Margin %" />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === "y") return [`${Number(value).toFixed(1)}%`, "Margin %"]
                      if (name === "x") return [Number(value).toLocaleString(), "Quantity"]
                      return [value, name]
                    }}
                    labelFormatter={() => ""}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="bg-white p-2 border rounded shadow">
                            <p className="font-medium">{data.product_id}</p>
                            <p>Quantity: {data.x.toLocaleString()}</p>
                            <p>Margin: {data.y.toFixed(1)}%</p>
                            <p>Loss: ${Math.abs(data.loss_amt).toLocaleString()}</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Scatter dataKey="y">
                    {scatterData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs & Detailed Tables */}
      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="products">
            Top Product Losses
            {topProductLosses.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {topProductLosses.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="customers">
            Top Customer Losses
            {topCustomerLosses.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {topCustomerLosses.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="below-cost">
            Below Cost Sales
            {belowCostPairs.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {belowCostPairs.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="remediation">Remediation</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Product Losses</CardTitle>
              <CardDescription>Products with the highest margin losses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Product Loss Summary</h4>
                <div className="border rounded-lg overflow-hidden">
                  <ScrollArea className="h-64">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Product ID</th>
                          <th className="px-3 py-2 text-left font-medium">Loss Amount</th>
                          <th className="px-3 py-2 text-left font-medium">Margin %</th>
                          <th className="px-3 py-2 text-left font-medium">Revenue</th>
                          <th className="px-3 py-2 text-left font-medium">Quantity</th>
                          <th className="px-3 py-2 text-left font-medium">Customers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProductLosses.map((product, index) => (
                          <tr
                            key={index}
                            className="border-t hover:bg-muted/20 cursor-pointer"
                            onClick={() => setSelectedProduct(product.product_id)}
                          >
                            <td className="px-3 py-2 font-medium">{product.product_id}</td>
                            <td className="px-3 py-2 text-red-600">
                              ${Math.abs(safeNumber(product.loss_amt)).toLocaleString()}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant={safeNumber(product.margin_pct) < 0 ? "destructive" : "secondary"}>
                                {safeNumber(product.margin_pct).toFixed(1)}%
                              </Badge>
                            </td>
                            <td className="px-3 py-2">${safeNumber(product.revenue).toLocaleString()}</td>
                            <td className="px-3 py-2">{safeNumber(product.qty).toLocaleString()}</td>
                            <td className="px-3 py-2">{safeNumber(product.customers_impacted)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </div>
              </div>

              <Separator />

              {resultsData?.sql_queries?.low_margin && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">SQL Query</h4>
                    <Button variant="outline" size="sm" onClick={() => handleCopySQL(resultsData.sql_queries.low_margin, "low_margin")} className="h-7">
                      {copiedSql === "low_margin" ? <CheckCircle className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                      {copiedSql === "low_margin" ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                  <div className="bg-muted p-3 rounded-lg font-mono text-xs overflow-x-auto">
                    <pre className="whitespace-pre-wrap">{safeString(resultsData.sql_queries.low_margin)}</pre>
                  </div>
                </div>
              )}

              <Separator />

              {renderSampleTable((resultsData?.samples?.low_margin as any[]) || [], "Low Margin Products")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Customer Losses</CardTitle>
              <CardDescription>Customers with the highest margin losses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Customer Loss Summary</h4>
                <div className="border rounded-lg overflow-hidden">
                  <ScrollArea className="h-64">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Customer ID</th>
                          <th className="px-3 py-2 text-left font-medium">Loss Amount</th>
                          <th className="px-3 py-2 text-left font-medium">Margin %</th>
                          <th className="px-3 py-2 text-left font-medium">Revenue</th>
                          <th className="px-3 py-2 text-left font-medium">Quantity</th>
                          <th className="px-3 py-2 text-left font-medium">Products</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topCustomerLosses.map((customer, index) => (
                          <tr key={index} className="border-t">
                            <td className="px-3 py-2 font-medium">{customer.customer_id}</td>
                            <td className="px-3 py-2 text-red-600">
                              ${Math.abs(safeNumber(customer.loss_amt)).toLocaleString()}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant={safeNumber(customer.margin_pct) < 0 ? "destructive" : "secondary"}>
                                {safeNumber(customer.margin_pct).toFixed(1)}%
                              </Badge>
                            </td>
                            <td className="px-3 py-2">${safeNumber(customer.revenue).toLocaleString()}</td>
                            <td className="px-3 py-2">{safeNumber(customer.qty).toLocaleString()}</td>
                            <td className="px-3 py-2">{safeNumber(customer.products_impacted)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </div>
              </div>

              <Separator />

              {resultsData?.sql_queries?.customer_level &&
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">SQL Query</h4>
                    <Button variant="outline" size="sm" onClick={() => handleCopySQL(resultsData.sql_queries.customer_level, "customer_level")} className="h-7">
                      {copiedSql === "customer_level" ? <CheckCircle className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                      {copiedSql === "customer_level" ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                  <div className="bg-muted p-3 rounded-lg font-mono text-xs overflow-x-auto">
                    <pre className="whitespace-pre-wrap">{safeString(resultsData.sql_queries.customer_level)}</pre>
                  </div>
                </div>
              }
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="below-cost" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Below Cost Sales</CardTitle>
              <CardDescription>Product-customer pairs sold below cost</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Below Cost Transactions</h4>
                <div className="border rounded-lg overflow-hidden">
                  <ScrollArea className="h-64">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Product ID</th>
                          <th className="px-3 py-2 text-left font-medium">Customer ID</th>
                          <th className="px-3 py-2 text-left font-medium">Rows</th>
                          <th className="px-3 py-2 text-left font-medium">Total Loss</th>
                        </tr>
                      </thead>
                      <tbody>
                        {belowCostPairs.map((pair, index) => (
                          <tr key={index} className="border-t">
                            <td className="px-3 py-2 font-medium">{pair.product_id}</td>
                            <td className="px-3 py-2">{pair.customer_id}</td>
                            <td className="px-3 py-2">{safeNumber(pair.rows)}</td>
                            <td className="px-3 py-2 text-red-600">
                              ${Math.abs(safeNumber(pair.total_margin_amt)).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </div>
              </div>

              <Separator />

              {resultsData?.sql_queries?.below_cost && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">SQL Query</h4>
                    <Button variant="outline" size="sm" onClick={() => handleCopySQL(resultsData.sql_queries.below_cost, "below_cost")} className="h-7">
                      {copiedSql === "below_cost" ? <CheckCircle className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                      {copiedSql === "below_cost" ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                  <div className="bg-muted p-3 rounded-lg font-mono text-xs overflow-x-auto">
                    <pre className="whitespace-pre-wrap">{safeString(resultsData.sql_queries.below_cost)}</pre>
                  </div>
                </div>
              )}

              <Separator />

              {renderSampleTable((resultsData?.samples?.below_cost as any[]) || [], "Below Cost Sales")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="remediation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Remediation Suggestions</CardTitle>
              <CardDescription>Recommended actions to address margin leakage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.isArray(resultsData?.remediation_suggestions) && resultsData.remediation_suggestions.length > 0 ? (
                <div className="space-y-3">
                  {resultsData.remediation_suggestions.map((suggestion: any, index: number) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium">{suggestion.type}</h4>
                        <Badge variant="outline">
                          {Math.round(safeNumber(suggestion.confidence) * 100)}% confidence
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{suggestion.description}</p>
                      <p className="text-sm font-medium">Impact: {suggestion.impact_estimate}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No remediation suggestions available</div>
              )}

              <Separator />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Critical</p>
                  <p className="text-lg font-bold text-red-600">{severitySummary.critical}</p>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <p className="text-sm text-muted-foreground">High</p>
                  <p className="text-lg font-bold text-orange-600">{severitySummary.high}</p>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Medium</p>
                  <p className="text-lg font-bold text-yellow-600">{severitySummary.medium}</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Low</p>
                  <p className="text-lg font-bold text-green-600">{severitySummary.low}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default MarginResultsView
