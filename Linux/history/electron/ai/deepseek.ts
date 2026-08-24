import { BaseAIProvider } from './provider'
import { SummarizeInput, SummarizeOutput, ReportInput, ReportOutput } from './types'

export class DeepSeekProvider extends BaseAIProvider {
  readonly name = 'deepseek'
  readonly displayName = 'DeepSeek'
  readonly models = ['deepseek-chat', 'deepseek-coder']

  async validateConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(10000)
      })
      if (!res.ok) {
        const text = await res.text()
        return { ok: false, error: `${res.status}: ${text}` }
      }
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  }

  async summarize(input: SummarizeInput): Promise<SummarizeOutput> {
    const systemPrompt = this.buildSummarizeSystemPrompt(input)
    const userPrompt = this.buildSummarizeUserPrompt(input)

    const result = await this.fetchWithRetry(
      `${this.config.baseUrl}/chat/completions`,
      {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.3,
        response_format: { type: 'json_object' }
      }
    )

    const content = result.choices[0].message.content
    let parsed: any
    try {
      parsed = JSON.parse(content)
    } catch {
      // AI 返回了非 JSON 格式，尝试从文本中提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    }

    return {
      completedWork: parsed.completed_work || [],
      problems: parsed.problems || [],
      solutions: parsed.solutions || [],
      knowledgeGained: parsed.knowledge_gained || [],
      nextSteps: parsed.next_steps || [],
      tags: parsed.tags || [],
      summary: parsed.summary || '',
      isMilestone: parsed.is_milestone || false,
      canGenerateAchievement: parsed.can_generate_achievement || false,
      providerName: this.name,
      model: this.config.model,
      tokensUsed: {
        prompt: result.usage?.prompt_tokens || 0,
        completion: result.usage?.completion_tokens || 0
      }
    }
  }

  async generateReport(input: ReportInput): Promise<ReportOutput> {
    const systemPrompt = this.buildReportSystemPrompt(input)
    const userPrompt = this.buildReportUserPrompt(input)

    const result = await this.fetchWithRetry(
      `${this.config.baseUrl}/chat/completions`,
      {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.5,
        response_format: { type: 'json_object' }
      }
    )

    const content = result.choices[0].message.content
    let parsed: any
    try {
      parsed = JSON.parse(content)
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    }

    return {
      title: parsed.title || '',
      sections: parsed.sections || [],
      fullMarkdown: this.sectionsToMarkdown(parsed.title || '', parsed.sections || []),
      tokensUsed: {
        prompt: result.usage?.prompt_tokens || 0,
        completion: result.usage?.completion_tokens || 0
      }
    }
  }

  private buildSummarizeSystemPrompt(input: SummarizeInput): string {
    const typeLabel = input.type === 'work' ? '工作' : '学习'
    return `你是一个专业的${typeLabel}总结助手。用户完成了一段${typeLabel}，现在需要你帮助总结。
请根据用户的复盘内容，提取结构化信息，输出 JSON 格式。

输出 JSON schema:
{
  "completed_work": ["完成内容1", "完成内容2"],
  "problems": ["遇到的问题"],
  "solutions": ["解决方案"],
  "knowledge_gained": ["学到的知识点"],
  "next_steps": ["下一步计划"],
  "tags": ["标签1", "标签2"],
  "summary": "一段话总结",
  "is_milestone": false,
  "can_generate_achievement": false
}`
  }

  private buildSummarizeUserPrompt(input: SummarizeInput): string {
    const typeLabel = input.type === 'work' ? '研发' : '学习'
    let prompt = `请总结以下${typeLabel}记录：\n\n`
    if (input.type === 'work') {
      prompt += `项目: ${input.projectName || '未知'}\n任务: ${input.taskName || '无'}\n`
    } else {
      prompt += `知识主题: ${input.topicName || '未知'}\n`
    }
    prompt += `时长: ${input.durationMinutes} 分钟\n\n`
    prompt += `用户复盘内容:\n${input.rawNotes}\n\n`
    prompt += `完成内容: ${input.userAnswers.completed || '无'}\n`
    prompt += `遇到的问题: ${input.userAnswers.problems || '无'}\n`
    prompt += `解决方案: ${input.userAnswers.solutions || '无'}\n`
    if (input.type === 'work') {
      prompt += `下一步计划: ${input.userAnswers.nextSteps || '无'}\n`
    } else {
      prompt += `学习收获: ${input.userAnswers.gains || '无'}\n`
      prompt += `疑问: ${input.userAnswers.questions || '无'}\n`
    }
    prompt += `\n请根据以上内容生成结构化的总结 JSON。`
    return prompt
  }

  private buildReportSystemPrompt(input: ReportInput): string {
    const typeLabel = input.type === 'daily' ? '日报' : input.type === 'weekly' ? '周报' : '月报'
    return `你是一个专业的${typeLabel}生成助手。请根据提供的统计数据生成一份结构清晰的${typeLabel}。

输出 JSON schema:
{
  "title": "报告标题",
  "sections": [
    { "heading": "章节标题", "body": "Markdown 内容" }
  ]
}

要求：内容简洁务实，突出成果和关键问题，用 Markdown 格式。`
  }

  private buildReportUserPrompt(input: ReportInput): string {
    const typeLabel = input.type === 'daily' ? '今日' : input.type === 'weekly' ? '本周' : '本月'
    const workHours = Math.floor(input.stats.workSeconds / 3600)
    const workMins = Math.floor((input.stats.workSeconds % 3600) / 60)
    const learnHours = Math.floor(input.stats.learningSeconds / 3600)
    const learnMins = Math.floor((input.stats.learningSeconds % 3600) / 60)

    let prompt = `请生成${typeLabel}研发报告：\n\n`
    prompt += `- ${typeLabel}研发总时长: ${workHours}h ${workMins}m\n`
    prompt += `- ${typeLabel}学习总时长: ${learnHours}h ${learnMins}m\n`
    prompt += `- 项目分布: ${input.stats.projectBreakdown.map(p => `${p.projectName}(${Math.round(p.seconds / 60)}m)`).join(', ')}\n`
    prompt += `- 学习分布: ${input.stats.topicBreakdown.map(t => `${t.topicName}(${Math.round(t.seconds / 60)}m)`).join(', ')}\n`
    prompt += `- 完成内容: ${input.stats.completedItems.join('; ')}\n`
    prompt += `- 遇到的问题: ${input.stats.problems.join('; ')}\n`
    prompt += `- 解决方案: ${input.stats.solutions.join('; ')}\n`
    if (input.previousReportSummary) {
      prompt += `\n上一期报告摘要: ${input.previousReportSummary}`
    }
    return prompt
  }

  private sectionsToMarkdown(title: string, sections: { heading: string; body: string }[]): string {
    let md = `# ${title}\n\n`
    for (const s of sections) {
      md += `## ${s.heading}\n\n${s.body}\n\n`
    }
    return md
  }
}
