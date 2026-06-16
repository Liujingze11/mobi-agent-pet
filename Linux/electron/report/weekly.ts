import Database from 'better-sqlite3'
import { AIProviderRegistry } from '../ai/registry'
import { getTotalWorkSecondsByDateRange } from '../db/queries/work-sessions'
import { getTotalLearningSecondsByDateRange, getDailyLearningStatsForRange } from '../db/queries/learning'
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
  const totalLearningSeconds = getTotalLearningSecondsByDateRange(db, from, to, userId) as number

  // 每日趋势
  const dailyStats = getDailyStatsForRange(db, userId, from, to) as any[]
  const dailyLearningStats = getDailyLearningStatsForRange(db, userId, from, to) as any[]
  const dailyTrend = allDays.map(date => {
    const workStat = dailyStats.find((s: any) => s.date === date)
    const learnStat = dailyLearningStats.find((s: any) => s.date === date)
    return {
      date,
      workMinutes: Math.round((workStat?.work_seconds || 0) / 60),
      learningMinutes: Math.round((learnStat?.learning_seconds || 0) / 60)
    }
  })

  const activeDays = dailyTrend.filter(d => d.workMinutes > 0 || d.learningMinutes > 0).length

  // 项目分布
  const projectRows = db.prepare(`
    SELECT p.name as project_name, COALESCE(SUM(ws.effective_seconds), 0) as seconds
    FROM work_sessions ws JOIN projects p ON ws.project_id = p.id
    WHERE ws.user_id = ? AND ws.start_time >= ? AND ws.start_time <= ? AND ws.status = 'completed'
    GROUP BY p.id ORDER BY seconds DESC
  `).all(userId, from + 'T00:00:00.000Z', to + 'T23:59:59.999Z') as any[]

  const totalSecs = totalWorkSeconds + totalLearningSeconds || 1
  const projectDistribution = projectRows.map((p: any) => ({
    projectName: p.project_name,
    minutes: Math.round(p.seconds / 60),
    percentage: Math.round((p.seconds / totalSecs) * 100),
    completedTasks: 0,
    totalTasks: 0,
    progress: ''
  }))

  // 学习分布
  const learningRows = db.prepare(`
    SELECT lc.name as category_name, COALESCE(SUM(ls.effective_seconds), 0) as seconds, COUNT(DISTINCT ls.topic_id) as topics_count
    FROM learning_sessions ls JOIN learning_topics lt ON ls.topic_id = lt.id
    JOIN learning_categories lc ON lt.category_id = lc.id
    WHERE ls.user_id = ? AND ls.start_time >= ? AND ls.start_time <= ? AND ls.status = 'completed'
    GROUP BY lc.id ORDER BY seconds DESC
  `).all(userId, from + 'T00:00:00.000Z', to + 'T23:59:59.999Z') as any[]

  const learningDistribution = learningRows.map((l: any) => ({
    categoryName: l.category_name,
    minutes: Math.round(l.seconds / 60),
    percentage: Math.round((l.seconds / totalSecs) * 100),
    topicsCount: l.topics_count
  }))

  // 完成内容和问题
  const workSessions = db.prepare(`
    SELECT completed_work, problems, solutions FROM work_sessions
    WHERE user_id = ? AND start_time >= ? AND start_time <= ? AND status = 'completed'
  `).all(userId, from + 'T00:00:00.000Z', to + 'T23:59:59.999Z') as any[]

  const completedItems = workSessions.filter((s: any) => s.completed_work).map((s: any) => s.completed_work)
  const problems = workSessions.filter((s: any) => s.problems).map((s: any) => s.problems)
  const solutions = workSessions.filter((s: any) => s.solutions).map((s: any) => s.solutions)

  const avgWorkPerDay = activeDays > 0 ? Math.round(totalWorkSeconds / 60 / activeDays) : 0
  const avgLearningPerDay = activeDays > 0 ? Math.round(totalLearningSeconds / 60 / activeDays) : 0

  const reportData: WeeklyReportData = {
    year, week,
    totalWorkMinutes: Math.round(totalWorkSeconds / 60),
    totalLearningMinutes: Math.round(totalLearningSeconds / 60),
    activeDays,
    avgWorkPerDay,
    avgLearningPerDay,
    dailyTrend,
    projectDistribution,
    learningDistribution,
    weekSummary: '', keyAchievements: [], blockers: [], knowledgeDeposited: [], nextWeekPlan: [],
    createdAt: new Date().toISOString()
  }

  try {
    const aiResult = await ai.generateReport({
      type: 'weekly', date: `${year}-W${week}`,
      stats: {
        workSeconds: totalWorkSeconds,
        learningSeconds: totalLearningSeconds,
        projectBreakdown: projectDistribution.map(p => ({ projectName: p.projectName, seconds: p.minutes * 60 })),
        topicBreakdown: learningDistribution.map(l => ({ topicName: '', categoryName: l.categoryName, seconds: l.minutes * 60 })),
        completedItems, problems, solutions
      }
    })
    reportData.weekSummary = aiResult.fullMarkdown
    // 提取关键成果和阻塞项
    reportData.keyAchievements = aiResult.sections
      .filter((s: any) => s.heading.includes('成果') || s.heading.includes('完成'))
      .flatMap((s: any) => s.body.split('\n').filter(Boolean))
    reportData.blockers = aiResult.sections
      .filter((s: any) => s.heading.includes('阻塞') || s.heading.includes('问题'))
      .flatMap((s: any) => s.body.split('\n').filter(Boolean))
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
