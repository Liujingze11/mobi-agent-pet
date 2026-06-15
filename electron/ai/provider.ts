import { AIProvider, ProviderConfig, SummarizeInput, SummarizeOutput, ReportInput, ReportOutput } from './types'

export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string
  abstract readonly displayName: string
  abstract readonly models: string[]

  protected config: ProviderConfig = {
    apiKey: '', baseUrl: '', model: '', maxTokens: 4096, temperature: 0.3
  }

  configure(config: ProviderConfig): void {
    this.config = { ...this.config, ...config }
  }

  abstract validateConnection(): Promise<{ ok: boolean; error?: string }>
  abstract summarize(input: SummarizeInput): Promise<SummarizeOutput>
  abstract generateReport(input: ReportInput): Promise<ReportOutput>

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    }
  }

  protected async fetchWithRetry(url: string, body: any, retries = 1): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000)
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(`API error ${response.status}: ${text}`)
        }
        return response.json()
      } catch (err) {
        if (attempt === retries) throw err
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }
}
