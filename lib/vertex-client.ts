// lib/vertexClient.ts
import fs from 'fs'
import os from 'os'
import path from 'path'
import { VertexAI } from '@google-cloud/vertexai' // keep this; ensure package installed
import logger from './logger'
import { v4 as uuidv4 } from 'uuid'

interface VertexConfig {
  projectId?: string
  location?: string
  serviceAccountKey?: string
  mockMode?: boolean
}

interface PromptRequest {
  prompt: string
  context?: any
  temperature?: number
  maxTokens?: number
}

interface TaskRequest {
  taskName: string
  payload: any
}

interface ColumnMappingResponse {
  mapping: Record<string, string>
  confidence: Record<string, number>
  explanations: Record<string, string>
}

interface InsightGenerationResponse {
  insights: string[]
  summary: string
  recommendations: string[]
}

class VertexClient {
  private config: VertexConfig
  private mockMode: boolean
  private vertexAIClient: any | null = null
  private tempKeyFilePath: string | null = null

  constructor(config: VertexConfig = {}) {
    this.config = {
      projectId: config.projectId || process.env.GCP_PROJECT || process.env.VERTEX_AI_PROJECT,
      location: config.location || process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      serviceAccountKey: config.serviceAccountKey || process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      mockMode: config.mockMode ?? (process.env.MOCK_MODE === 'true'),
    }

    // Determine mock mode if no credentials or explicit mock
    this.mockMode = !!this.config.mockMode || !this.config.projectId || !this.config.serviceAccountKey

    if (!this.mockMode) {
      try {
        // If service account JSON is present in env, write it to a temp file for libraries that expect a file path
        const key = this.config.serviceAccountKey
        if (key) {
          let keyObj: any = null
          try {
            keyObj = typeof key === 'string' ? JSON.parse(key) : key
          } catch (parseErr) {
            // maybe base64?
            try {
              const decoded = Buffer.from(String(key), 'base64').toString('utf8')
              keyObj = JSON.parse(decoded)
            } catch (e) {
              logger.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON', { error: String(e) })
              keyObj = null
            }
          }

          if (!keyObj) {
            logger.error('Service account key present but could not parse. Falling back to mock mode.')
            this.mockMode = true
          } else {
            // write to temp file
            const tmpdir = os.tmpdir()
            const fileName = `vertex-sa-${uuidv4()}.json`
            const filePath = path.join(tmpdir, fileName)
            fs.writeFileSync(filePath, JSON.stringify(keyObj))
            this.tempKeyFilePath = filePath
            // set env var used by Google SDK
            process.env.GOOGLE_APPLICATION_CREDENTIALS = filePath
          }
        }

        // Initialize Vertex AI client
        const project = this.config.projectId
        const location = this.config.location
        const apiEndpoint = `${location}-aiplatform.googleapis.com`

        // instantiate VertexAI wrapper
        this.vertexAIClient = new VertexAI({
          project,
          location,
          apiEndpoint,
        })

        logger.info('VertexClient initialized', { project, location })
      } catch (err: any) {
        logger.error('VertexClient initialization failed, falling back to mock mode', { error: err?.message ?? err })
        this.mockMode = true
      }
    } else {
      logger.info('[VertexClient] Running in mock mode - Gemini calls will be mocked')
    }
  }

  async runPrompt(request: PromptRequest): Promise<string> {
    if (this.mockMode) {
      return this.getMockPromptResponse(request)
    }

    try {
      const model = this.vertexAIClient.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
      const prompt = request.prompt
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        temperature: request.temperature ?? 0.0,
      })
      const responseFromModel = result?.response
      const text = responseFromModel?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      return String(text)
    } catch (error) {
      logger.error('runPrompt error', { error: String(error) })
      throw error
    }
  }

  async runTask(request: TaskRequest): Promise<any> {
    if (this.mockMode) {
      return this.getMockTaskResponse(request)
    }

    try {
      // For task-like behavior we will use prompts with structured instructions
      const prompt = `Task: ${request.taskName}\nPayload:\n${JSON.stringify(request.payload, null, 2)}\n\nRespond with JSON only.`
      const raw = await this.runPrompt({ prompt })
      // attempt to parse JSON from response
      try {
        const jsonStart = raw.indexOf('{')
        const jsonText = jsonStart !== -1 ? raw.slice(jsonStart) : raw
        const parsed = JSON.parse(jsonText)
        return parsed
      } catch (parseErr) {
        // If parsing fails, return raw text as data
        return { status: 'ok', raw }
      }
    } catch (err) {
      logger.error('runTask error', { error: String(err) })
      throw err
    }
  }

  async identifyColumns(sampleRows: any[]): Promise<ColumnMappingResponse> {
    if (this.mockMode) {
      return this.getMockTaskResponse({ taskName: 'identify_columns', payload: { sample_rows: sampleRows } })
    }
    const request: TaskRequest = { taskName: 'identify_columns', payload: { sample_rows: sampleRows.slice(0, 50), required_columns: ['product_id', 'customer_id', 'price'] } }
    const res = await this.runTask(request)
    return res as ColumnMappingResponse
  }

  async generateInsights(analysisResults: any): Promise<InsightGenerationResponse> {
    if (this.mockMode) {
      return this.getMockTaskResponse({ taskName: 'generate_insights', payload: analysisResults })
    }
    const res = await this.runTask({ taskName: 'generate_insights', payload: analysisResults })
    return res as InsightGenerationResponse
  }

  async generateSQL(checkType: string, parameters: any): Promise<string> {
    const prompt = `Generate a SQL query for ${checkType} data quality check. Parameters: ${JSON.stringify(parameters)}`
    const response = await this.runPrompt({ prompt })
    return response
  }

  private getMockPromptResponse(request: PromptRequest): string {
    const { prompt } = request
    if (prompt.toLowerCase().includes('sql')) {
      return 'SELECT * FROM transactions WHERE condition = true LIMIT 10;'
    }
    if (prompt.toLowerCase().includes('insight')) {
      return 'Based on the analysis, there are several data quality issues that require attention.'
    }
    return 'Mock prompt response...'
  }

  private getMockTaskResponse(request: TaskRequest): any {
    const { taskName } = request
    switch (taskName) {
      case 'identify_columns':
        return {
          mapping: { product_id: 'ProductID', customer_id: 'Cust_ID', price: 'Net_Price' },
          confidence: { product_id: 0.95, customer_id: 0.92, price: 0.98 },
          explanations: {
            product_id: 'Matched ProductID column with high confidence',
            customer_id: 'Matched Cust_ID column',
            price: 'Matched Net_Price column'
          }
        }
      case 'generate_insights':
        return {
          insights: ['Duplicate records found', 'Missing discount_pct values', 'Outliers in discount_pct'],
          summary: 'Moderate issues',
          recommendations: ['Deduplicate', 'Impute nulls', 'Investigate outliers']
        }
      default:
        return { status: 'success', data: request.payload }
    }
  }

  isMockMode(): boolean {
    return this.mockMode
  }

  getConfig(): Omit<VertexConfig, 'serviceAccountKey'> {
    return {
      projectId: this.config.projectId,
      location: this.config.location,
      mockMode: this.mockMode,
    }
  }

  async dispose() {
    try {
      if (this.tempKeyFilePath && fs.existsSync(this.tempKeyFilePath)) {
        fs.unlinkSync(this.tempKeyFilePath)
      }
    } catch (e) {
      logger.warn('Failed to cleanup temp SA file', { error: String(e) })
    }
  }
}

let singleton: VertexClient | null = null

export function getVertexClient(config?: VertexConfig): VertexClient {
  if (!singleton) singleton = new VertexClient(config || {})
  return singleton
}

export function initializeVertexClient(config: VertexConfig): VertexClient {
  singleton = new VertexClient(config)
  return singleton
}

export type { VertexConfig, ColumnMappingResponse, InsightGenerationResponse }
export default getVertexClient
