import Database from 'better-sqlite3'
import { AIProviderRegistry } from '../ai/registry'
import { getTotalWorkSecondsByDateRange } from '../db/queries/work-sessions'
import { getDailyStatsForRange, saveWeeklyReport } from '../db/queries/reports'
import { getDaysInRange } from '../utils/time'
import { WeeklyReportData } from './types'

function getWeekDateRange(year: number, week: number): { from: string; to: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const firstMonday = new Date(jan4)
  firstMonday.setUTCDate(jan4.getUTCDate() - jan4Day + 1)
  const weekStart = new Date(firstMonday)
  weekStart.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6)
  return {
    from: weekStart.toISOString().slice(0, 10),
    to: weekEnd.toISOString().slice(0, 10)
  }
}

export async function generateWeeklyReport(
  db: Database.Database, ai: AIProviderRegistry, userId: string, year: number, week: number
): Promise<WeeklyReportData> {
  const { from, to } = getWeekDateRange(year, week)
  const allDays = getDaysInRange(from, to)

  const totalWorkSeconds = getTotalWorkSecondsByDateRange(db, from, to, userId) as number
  const totalLearningSeconds = 0 // TODO: add learning version

  // 每日趋势
  const dailyStats = getDailyStatsForRange(db, userId, from, to) as any[]
  const dailyTrend = allDays.map(date => {
    const stat = dailyStats.find((s: any) => s.date === date)
    return { date, workMinutes: Math.round((stat?.work_seconds || 0) / 60), learningMinutes: 0 }
  })

  const activeDays = dailyTrend.filter(d => d.workMinutes > 0).length

  const reportData: WeeklyReportData = {
    year, week,
    totalWorkMinutes: Math.round(totalWorkSeconds / 60),
    totalLearningMinutes: Math.round(totalLearningSeconds / 60),
    activeDays,
    avgWorkPerDay: activeDays > 0 ? Math.round(totalWorkSeconds / 60 / activeDays) : 0,
    avgLearningPerDay: 0,
    dailyTrend,
    projectDistribution: [],
    learningDistribution: [],
    weekSummary: '', keyAchievements: [], blockers: [], knowledgeDeposited: [], nextWeekPlan: [],
    createdAt: new Date().toISOString()
  }

  try {
    const aiResult = await ai.generateReport({
      type: 'weekly', date: `${year}-W${week}`,
      stats: {
        workSeconds: totalWorkSeconds, learningSeconds: totalLearningSeconds,
        projectBreakdown: [], topicBreakdown: [], completedItems: [], problems: [], solutions: []
      }
    })
    reportData.weekSummary = aiResult.fullMarkdown
  } catch {
    reportData.weekSummary = 'AI 总结生成失败。'
  }

  saveWeeklyReport(db, {
    userId, year, week,
    contentJson: JSON.stringify(reportData),
    workSeconds: totalWorkSeconds, learningSeconds: totalLearningSeconds
  })
  return reportData
}
