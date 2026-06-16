export interface ProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
  maxTokens?: number
  temperature?: number
}

export interface SummarizeInput {
  type: 'work' | 'learning'
  sessionId?: string
  projectName?: string
  taskName?: string
  topicName?: string
  categoryName?: string
  durationMinutes: number
  rawNotes: string
  userAnswers: {
    completed?: string
    problems?: string
    solutions?: string
    nextSteps?: string
    learningContent?: string
    gains?: string
    questions?: string
  }
}

export interface SummarizeOutput {
  completedWork: string[]
  problems: string[]
  solutions: string[]
  knowledgeGained: string[]
  nextSteps: string[]
  tags: string[]
  summary: string
  isMilestone: boolean
  canGenerateAchievement: boolean
  providerName: string
  model: string
  tokensUsed: { prompt: number; completion: number }
}

export interface ReportInput {
  type: 'daily' | 'weekly' | 'monthly'
  date: string
  stats: {
    workSeconds: number
    learningSeconds: number
    projectBreakdown: { projectName: string; seconds: number }[]
    topicBreakdown: { topicName: string; categoryName: string; seconds: number }[]
    completedItems: string[]
    problems: string[]
    solutions: string[]
  }
  previousReportSummary?: string
}

export interface ReportOutput {
  title: string
  sections: { heading: string; body: string }[]
  fullMarkdown: string
  tokensUsed: { prompt: number; completion: number }
}

export interface AIProvider {
  readonly name: string
  readonly displayName: string
  readonly models: string[]
  configure(config: ProviderConfig): void
  validateConnection(): Promise<{ ok: boolean; error?: string }>
  summarize(input: SummarizeInput): Promise<SummarizeOutput>
  generateReport(input: ReportInput): Promise<ReportOutput>
}
