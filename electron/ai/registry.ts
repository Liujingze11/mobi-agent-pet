import Database from 'better-sqlite3'
import { AIProvider, SummarizeInput, SummarizeOutput, ReportInput, ReportOutput } from './types'
import { DeepSeekProvider } from './deepseek'
import { getSetting, setSetting } from '../db/queries/settings'
import { generateId } from '../utils/id'
import { logger } from '../utils/logger'

export class AIProviderRegistry {
  private providers: Map<string, AIProvider> = new Map()
  private activeProviderName: string = 'deepseek'
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
    this.register(new DeepSeekProvider())
    this.loadConfig()
  }

  register(provider: AIProvider): void {
    this.providers.set(provider.name, provider)
  }

  getActive(): AIProvider {
    const p = this.providers.get(this.activeProviderName)
    if (!p) throw new Error(`Provider "${this.activeProviderName}" not found`)
    return p
  }

  setActive(name: string): void {
    if (!this.providers.has(name)) throw new Error(`Unknown provider: ${name}`)
    this.activeProviderName = name
    setSetting(this.db, 'ai_active_provider', name)
  }

  list(): AIProvider[] {
    return Array.from(this.providers.values())
  }

  private loadConfig(): void {
    const savedActiveProvider = getSetting(this.db, 'ai_active_provider')
    if (savedActiveProvider && this.providers.has(savedActiveProvider)) {
      this.activeProviderName = savedActiveProvider
    }
    const apiKey = getSetting(this.db, 'ai_api_key') || ''
    const baseUrl = getSetting(this.db, 'ai_base_url') || 'https://api.deepseek.com/v1'
    const model = getSetting(this.db, 'ai_model') || 'deepseek-chat'

    const provider = this.getActive()
    provider.configure({ apiKey, baseUrl, model })
  }

  async validateConnection(): Promise<{ ok: boolean; error?: string }> {
    return this.getActive().validateConnection()
  }

  async summarize(input: SummarizeInput): Promise<SummarizeOutput> {
    try {
      const result = await this.getActive().summarize(input)
      this.db.prepare(
        `INSERT INTO ai_summaries (id, session_type, session_id, provider, model, prompt_tokens, completion_tokens, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(generateId(), input.type, '', this.activeProviderName, this.getActive().models[0],
        result.tokensUsed.prompt, result.tokensUsed.completion, JSON.stringify(result))
      return result
    } catch (err: any) {
      logger.error('AI summarize failed:', err.message)
      throw err
    }
  }

  async generateReport(input: ReportInput): Promise<ReportOutput> {
    return this.getActive().generateReport(input)
  }
}
