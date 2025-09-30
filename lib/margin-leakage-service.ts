import { getVertexClient } from "./vertex-client"

interface MarginLeakageAnalysis {
  fileId: string
  validation: any
  rows_analyzed: number
  time_window: string
  top_product_losses: Array<{
    product_id: string
    loss_amt: number
    margin_pct: number
    revenue: number
    qty: number
    customers_impacted: number
  }>
  top_customer_losses: Array<{
    customer_id: string
    loss_amt: number
    margin_pct: number
    revenue: number
    qty: number
    products_impacted: number
  }>
  product_customer_pairs_below_cost: Array<{
    product_id: string
    customer_id: string
    rows: number
    total_margin_amt: number
  }>
  aggregates: {
    products: any[]
    customers: any[]
  }
  insights: string[]
  sql_queries: {
    below_cost: string
    low_margin: string
    customer_level: string
  }
  samples: {
    below_cost: any[]
    low_margin: any[]
    extreme_discount: any[]
  }
  graphs: {
    pareto: any
    scatter: any
  }
  remediation_suggestions: Array<{
    type: string
    description: string
    confidence: number
    impact_estimate: string
  } | any> // allow `any` for recommendations coming from AI
  severity_summary: {
    critical: number
    high: number
    medium: number
    low: number
  }
}

export class MarginLeakageService {
  private vertexClient = getVertexClient()

  /**
   * Perform comprehensive margin leakage analysis
   */
  async analyzeMarginLeakage(fileId: string, sampleData: any[]): Promise<MarginLeakageAnalysis> {
    try {
      // Step 1: Use AI to identify and map columns
      const columnMapping = await this.vertexClient.identifyColumns(sampleData)

      // Step 2: Run margin analysis (this would typically involve actual data processing)
      const analysis = await this.runMarginAnalysis(fileId, columnMapping.mapping, sampleData)

      // Step 3: Use AI to generate human-friendly insights
      // The vertex client in your working `DataQualityService` exposes generateInsights,
      // so we call the same here and be tolerant of the shape of the result.
      const aiInsights: any = await this.vertexClient.generateInsights(analysis)

      // Accept either structured remediation_suggestions or a simpler recommendations array
      const insights = aiInsights?.insights ?? aiInsights?.recommendations ?? []
      const remediation_suggestions = aiInsights?.remediation_suggestions ?? aiInsights?.recommendations ?? []

      return {
        fileId,
        validation: { mapping: columnMapping.mapping },
        ...analysis,
        insights,
        remediation_suggestions,
      }
    } catch (error) {
      console.error("[MarginLeakageService] Analysis failed:", error)
      throw new Error("Margin leakage analysis failed")
    }
  }

  /**
   * Validate margin-specific column requirements using AI
   */
  async validateMarginColumns(
    fileId: string,
    columns: string[],
  ): Promise<{
    valid: boolean
    mapping?: Record<string, string>
    missing?: string[]
    confidence?: Record<string, number>
  }> {
    try {
      // Create sample data for column analysis
      const sampleData = [{ [columns[0]]: "P001", [columns[1]]: "100.50", [columns[2]]: "75.25" }]

      // Use the generic identifyColumns API (same as DataQualityService)
      const result = await this.vertexClient.identifyColumns(sampleData)

      const requiredColumns = ["product_id", "cost", "net_price"]
      const missing = requiredColumns.filter((col) => !result.mapping[col])

      return {
        valid: missing.length === 0,
        mapping: result.mapping,
        missing,
        confidence: result.confidence,
      }
    } catch (error) {
      console.error("[MarginLeakageService] Column validation failed:", error)
      return {
        valid: false,
        missing: ["product_id", "cost", "net_price"],
      }
    }
  }

  /**
   * Generate SQL queries for specific margin checks
   */
  async generateMarginSQL(
    checkType: "below_cost" | "low_margin" | "customer_level" | "extreme_discount",
    parameters: any,
  ): Promise<string> {
    try {
      // Use generic generateSQL on vertex client (same naming as DataQualityService)
      return await this.vertexClient.generateSQL(checkType, parameters)
    } catch (error) {
      console.error(`[MarginLeakageService] SQL generation failed for ${checkType}:`, error)
      // Return fallback SQL
      return this.getFallbackMarginSQL(checkType, parameters)
    }
  }

  /**
   * Check if service is running in mock mode
   */
  isMockMode(): boolean {
    return this.vertexClient.isMockMode()
  }

  private async runMarginAnalysis(fileId: string, mapping: Record<string, string>, sampleData: any[]) {
    // This would typically involve actual data processing
    // For now, return mock analysis results based on the specification
    const mockProductLosses = [
      {
        product_id: "P015",
        loss_amt: -12500.5,
        margin_pct: -25.2,
        revenue: 50000,
        qty: 200,
        customers_impacted: 5,
      },
      {
        product_id: "P032",
        loss_amt: -8750.25,
        margin_pct: -15.8,
        revenue: 35000,
        qty: 150,
        customers_impacted: 3,
      },
    ]

    const mockCustomerLosses = [
      {
        customer_id: "C001",
        loss_amt: -15000.75,
        margin_pct: -18.5,
        revenue: 75000,
        qty: 300,
        products_impacted: 8,
      },
    ]

    return {
      rows_analyzed: 12345,
      time_window: "2025-09-01 to 2025-09-29",
      top_product_losses: mockProductLosses,
      top_customer_losses: mockCustomerLosses,
      product_customer_pairs_below_cost: [
        {
          product_id: "P015",
          customer_id: "C001",
          rows: 25,
          total_margin_amt: -5500.25,
        },
      ],
      aggregates: {
        products: mockProductLosses,
        customers: mockCustomerLosses,
      },
      sql_queries: {
        below_cost: this.getFallbackMarginSQL("below_cost", {}),
        low_margin: this.getFallbackMarginSQL("low_margin", { threshold: 20, days: 30, min_volume: 1 }),
        customer_level: this.getFallbackMarginSQL("customer_level", { threshold: 20 }),
      },
      samples: {
        below_cost: [{ product_id: "P015", customer_id: "C001", net_price: 45.5, cost: 50.0, margin_amt: -4.5 }],
        low_margin: [{ product_id: "P032", avg_margin_pct: 8.5, total_qty: 150, revenue: 35000 }],
        extreme_discount: [{ product_id: "P020", discount_pct: 85.5, net_price: 25.0, list_price: 175.0 }],
      },
      graphs: {
        pareto: {
          labels: mockProductLosses.map((p) => p.product_id),
          data: mockProductLosses.map((p) => Math.abs(p.loss_amt)),
          cumulative: [60, 85, 100],
        },
        scatter: {
          data: mockProductLosses.map((p) => ({
            x: p.qty,
            y: p.margin_pct,
            size: p.revenue,
            product_id: p.product_id,
            color: p.margin_pct < 0 ? "red" : p.margin_pct < 20 ? "orange" : "green",
          })),
        },
      },
      severity_summary: {
        critical: 3,
        high: 7,
        medium: 25,
        low: 45,
      },
    }
  }

  private getFallbackMarginSQL(checkType: string, parameters: any): string {
    switch (checkType) {
      case "below_cost":
        return `SELECT product_id, customer_id, COUNT(*) AS rows, SUM(net_price - cost) AS total_margin_amt
FROM transactions
WHERE net_price < cost
GROUP BY product_id, customer_id
ORDER BY total_margin_amt ASC
LIMIT 100;`

      case "low_margin":
        const threshold = parameters.threshold || 20
        const days = parameters.days || 30
        const minVolume = parameters.min_volume || 1
        return `SELECT product_id, SUM(quantity) AS total_qty, SUM(net_price*quantity) AS revenue, SUM(cost*quantity) AS cost, 
       (SUM(net_price*quantity)-SUM(cost*quantity)) AS margin_amt,
       100.0 * ((SUM(net_price*quantity)-SUM(cost*quantity)) / SUM(net_price*quantity)) AS margin_pct
FROM transactions
WHERE transaction_date >= DATE_SUB(CURRENT_DATE, INTERVAL ${days} DAY)
GROUP BY product_id
HAVING margin_pct < ${threshold} AND total_qty >= ${minVolume}
ORDER BY margin_amt ASC;`

      case "customer_level":
        const customerThreshold = parameters.threshold || 20
        return `SELECT customer_id, SUM(quantity) AS total_qty, SUM(net_price*quantity) AS revenue, SUM(cost*quantity) AS cost,
       (SUM(net_price*quantity)-SUM(cost*quantity)) AS margin_amt,
       100.0 * ((SUM(net_price*quantity)-SUM(cost*quantity)) / SUM(net_price*quantity)) AS margin_pct
FROM transactions
GROUP BY customer_id
HAVING margin_pct < ${customerThreshold}
ORDER BY margin_amt ASC;`

      case "extreme_discount":
        return `SELECT product_id, customer_id, discount_pct, net_price, list_price, 
       (list_price - net_price) AS discount_amt
FROM transactions
WHERE discount_pct > 50
ORDER BY discount_pct DESC
LIMIT 100;`

      default:
        return "SELECT * FROM transactions LIMIT 10;"
    }
  }
}

// Export singleton instance
export const marginLeakageService = new MarginLeakageService()
