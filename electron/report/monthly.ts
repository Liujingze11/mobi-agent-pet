import Database from 'better-sqlite3'
import { AIProviderRegistry } from '../ai/registry'
import { getTotalWorkSecondsByDateRange } from '../db/queries/work-sessions'
import { saveMonthlyReport } from '../db/queries/reports'
import { MonthlyReportData } from './types'

export async function generateMonthlyReport(
  db: Database.Database, ai: AIProviderRegistry, userId: string, year: number, month: number
): Promise<MonthlyReportData> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const totalWorkSeconds = getTotalWorkSecondsByDateRange(db, from, to, userId) as number
  const totalLearningSeconds = 0
  const daysInMonth = lastDay
  const activeDays = 0 // Simplified for MVP

  const reportData: MonthlyReportData = {
    year, month,
    totalWorkMinutes: Math.round(totalWorkSeconds / 60),
    totalLearningMinutes: Math.round(totalLearningSeconds / 60),
    activeDays,
    avgWorkPerDay: daysInMonth > 0 ? Math.round(totalWorkSeconds / 60 / daysInMonth) : 0,
    avgLearningPerDay: 0,
    weeklyTrend: [],
    projectDistribution: [],
    learningDistribution: [],
    monthSummary: '', achievements: [], growthAreas: [], reflections: '', nextMonthPlan: '',
    heatmap: [],
    createdAt: new Date().toISOString()
  }

  try {
    const aiResult = await ai.generateReport({
      type: 'monthly', date: `${year}-${month}`,
      stats: {
        workSeconds: totalWorkSeconds, learningSeconds: totalLearningSeconds,
        projectBreakdown: [], topicBreakdown: [], completedItems: [], problems: [], solutions: []
      }
    })
    reportData.monthSummary = aiResult.fullMarkdown
  } catch {
    reportData.monthSummary = 'AI 总结生成失败。'
  }

  saveMonthlyReport(db, {
    userId, year, month,
    contentJson: JSON.stringify(reportData),
    workSeconds: totalWorkSeconds, learningSeconds: totalLearningSeconds
  })
  return reportData
}
