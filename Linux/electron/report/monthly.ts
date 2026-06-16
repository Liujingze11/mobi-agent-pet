import Database from 'better-sqlite3'
import { AIProviderRegistry } from '../ai/registry'
import { getTotalWorkSecondsByDateRange } from '../db/queries/work-sessions'
import { getTotalLearningSecondsByDateRange } from '../db/queries/learning'
import { saveMonthlyReport } from '../db/queries/reports'
import { MonthlyReportData } from './types'

export async function generateMonthlyReport(
  db: Database.Database, ai: AIProviderRegistry, userId: string, year: number, month: number
): Promise<MonthlyReportData> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const totalWorkSeconds = getTotalWorkSecondsByDateRange(db, from, to, userId) as number
  const totalLearningSeconds = getTotalLearningSecondsByDateRange(db, from, to, userId) as number
  const daysInMonth = lastDay

  // 计算活跃天数
  const activeDaysRow = db.prepare(`
    SELECT COUNT(DISTINCT d) as c FROM (
      SELECT date(start_time) as d FROM work_sessions WHERE user_id = ? AND start_time >= ? AND start_time <= ? AND status = 'completed'
      UNION
      SELECT date(start_time) as d FROM learning_sessions WHERE user_id = ? AND start_time >= ? AND start_time <= ? AND status = 'completed'
    )
  `).get(userId, from + 'T00:00:00.000Z', to + 'T23:59:59.999Z', userId, from + 'T00:00:00.000Z', to + 'T23:59:59.999Z') as any
  const activeDays = activeDaysRow?.c || 0

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
    progress: '',
    milestones: [] as string[]
  }))

  // 学习分布
  const learningRows = db.prepare(`
    SELECT lc.name as category_name, COALESCE(SUM(ls.effective_seconds), 0) as seconds
    FROM learning_sessions ls JOIN learning_topics lt ON ls.topic_id = lt.id
    JOIN learning_categories lc ON lt.category_id = lc.id
    WHERE ls.user_id = ? AND ls.start_time >= ? AND ls.start_time <= ? AND ls.status = 'completed'
    GROUP BY lc.id ORDER BY seconds DESC
  `).all(userId, from + 'T00:00:00.000Z', to + 'T23:59:59.999Z') as any[]

  const learningDistribution = learningRows.map((l: any) => ({
    categoryName: l.category_name,
    minutes: Math.round(l.seconds / 60),
    percentage: Math.round((l.seconds / totalSecs) * 100)
  }))

  // 周趋势（将月分为4-5段）
  const weeklyTrend: { week: number; workMinutes: number; learningMinutes: number }[] = []
  for (let w = 0; w < Math.ceil(daysInMonth / 7); w++) {
    const wFrom = `${year}-${String(month).padStart(2, '0')}-${String(w * 7 + 1).padStart(2, '0')}`
    const wToDay = Math.min((w + 1) * 7, lastDay)
    const wTo = `${year}-${String(month).padStart(2, '0')}-${String(wToDay).padStart(2, '0')}`
    weeklyTrend.push({
      week: w + 1,
      workMinutes: Math.round((getTotalWorkSecondsByDateRange(db, wFrom, wTo, userId) as number) / 60),
      learningMinutes: Math.round((getTotalLearningSecondsByDateRange(db, wFrom, wTo, userId) as number) / 60)
    })
  }

  // Heatmap
  const heatmap: { date: string; workMinutes: number; learningMinutes: number }[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const wSecs = getTotalWorkSecondsByDateRange(db, dateStr, dateStr, userId) as number
    const lSecs = getTotalLearningSecondsByDateRange(db, dateStr, dateStr, userId) as number
    if (wSecs > 0 || lSecs > 0) {
      heatmap.push({ date: dateStr, workMinutes: Math.round(wSecs / 60), learningMinutes: Math.round(lSecs / 60) })
    }
  }

  // 完成内容
  const completedItems = db.prepare(`
    SELECT completed_work FROM work_sessions
    WHERE user_id = ? AND start_time >= ? AND start_time <= ? AND status = 'completed' AND completed_work IS NOT NULL
  `).all(userId, from + 'T00:00:00.000Z', to + 'T23:59:59.999Z').map((r: any) => r.completed_work)

  const problems = db.prepare(`
    SELECT problems FROM work_sessions
    WHERE user_id = ? AND start_time >= ? AND start_time <= ? AND status = 'completed' AND problems IS NOT NULL
  `).all(userId, from + 'T00:00:00.000Z', to + 'T23:59:59.999Z').map((r: any) => r.problems)

  const solutions = db.prepare(`
    SELECT solutions FROM work_sessions
    WHERE user_id = ? AND start_time >= ? AND start_time <= ? AND status = 'completed' AND solutions IS NOT NULL
  `).all(userId, from + 'T00:00:00.000Z', to + 'T23:59:59.999Z').map((r: any) => r.solutions)

  const reportData: MonthlyReportData = {
    year, month,
    totalWorkMinutes: Math.round(totalWorkSeconds / 60),
    totalLearningMinutes: Math.round(totalLearningSeconds / 60),
    activeDays,
    avgWorkPerDay: daysInMonth > 0 ? Math.round(totalWorkSeconds / 60 / daysInMonth) : 0,
    avgLearningPerDay: daysInMonth > 0 ? Math.round(totalLearningSeconds / 60 / daysInMonth) : 0,
    weeklyTrend,
    projectDistribution,
    learningDistribution,
    monthSummary: '', achievements: [], growthAreas: [], reflections: '', nextMonthPlan: '',
    heatmap,
    createdAt: new Date().toISOString()
  }

  try {
    const aiResult = await ai.generateReport({
      type: 'monthly', date: `${year}-${month}`,
      stats: {
        workSeconds: totalWorkSeconds,
        learningSeconds: totalLearningSeconds,
        projectBreakdown: projectDistribution.map(p => ({ projectName: p.projectName, seconds: p.minutes * 60 })),
        topicBreakdown: learningDistribution.map(l => ({ topicName: '', categoryName: l.categoryName, seconds: l.minutes * 60 })),
        completedItems, problems, solutions
      }
    })
    reportData.monthSummary = aiResult.fullMarkdown
    reportData.achievements = aiResult.sections
      .filter((s: any) => s.heading.includes('成就') || s.heading.includes('成果'))
      .flatMap((s: any) => s.body.split('\n').filter(Boolean))
    reportData.growthAreas = aiResult.sections
      .filter((s: any) => s.heading.includes('成长') || s.heading.includes('学习'))
      .flatMap((s: any) => s.body.split('\n').filter(Boolean))
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
