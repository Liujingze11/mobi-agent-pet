import Database from 'better-sqlite3'
import { AIProviderRegistry } from '../ai/registry'
import { getWorkSessionsByDate } from '../db/queries/work-sessions'
import { listLearningSessions } from '../db/queries/learning'
import { saveDailyReport, getDailyReport } from '../db/queries/reports'
import { DailyReportData } from './types'

export async function generateDailyReport(
  db: Database.Database, ai: AIProviderRegistry, userId: string, date: string, statsOnly = false
): Promise<DailyReportData> {
  const workSessions = getWorkSessionsByDate(db, date, userId) as any[]
  const learningSessions = listLearningSessions(db, { userId, dateFrom: date, dateTo: date }) as any[]

  const totalWorkSeconds = workSessions.reduce((sum: number, s: any) => sum + (s.effective_seconds || 0), 0)
  const totalLearningSeconds = learningSessions.reduce((sum: number, s: any) => sum + (s.effective_seconds || 0), 0)

  // 项目分布
  const projMap = new Map<string, any>()
  for (const s of workSessions) {
    const p = projMap.get(s.project_id) || { projectId: s.project_id, projectName: s.project_name, minutes: 0, completedItems: [] }
    p.minutes += Math.round((s.effective_seconds || 0) / 60)
    if (s.completed_work) p.completedItems.push(s.completed_work)
    projMap.set(s.project_id, p)
  }

  // 学习分布
  const learnMap = new Map<string, any>()
  for (const s of learningSessions) {
    const key = `${s.category_name}::${s.topic_name}`
    const l = learnMap.get(key) || { categoryName: s.category_name, topicName: s.topic_name, minutes: 0, gains: [], questions: [] }
    l.minutes += Math.round((s.effective_seconds || 0) / 60)
    if (s.gains) l.gains.push(s.gains)
    if (s.questions) l.questions.push(s.questions)
    learnMap.set(key, l)
  }

  const projectBreakdown = Array.from(projMap.values()).map(p => ({ ...p, tasks: [] }))
  const learningBreakdown = Array.from(learnMap.values())

  const completedItems = workSessions.filter((s: any) => s.completed_work).map((s: any) => s.completed_work)
  const problems = workSessions.filter((s: any) => s.problems).map((s: any) => s.problems)
  const solutions = workSessions.filter((s: any) => s.solutions).map((s: any) => s.solutions)

  const streakDays = calculateStreak(db, userId, date)
  const timeline = buildTimeline(workSessions, learningSessions)

  const reportData: DailyReportData = {
    date,
    totalWorkMinutes: Math.round(totalWorkSeconds / 60),
    totalLearningMinutes: Math.round(totalLearningSeconds / 60),
    sessionCount: workSessions.length + learningSessions.length,
    streakDays,
    projectBreakdown,
    learningBreakdown,
    aiSummary: '', highlights: [], problemsBlockers: [], tomorrowPlan: [],
    timeline,
    createdAt: new Date().toISOString()
  }

  if (statsOnly) {
    const existing = getDailyReport(db, userId, date) as any
    if (existing) {
      const existingData = JSON.parse(existing.content_json)
      reportData.aiSummary = existingData.aiSummary || ''
      reportData.highlights = existingData.highlights || []
      reportData.problemsBlockers = existingData.problemsBlockers || []
      reportData.tomorrowPlan = existingData.tomorrowPlan || []
    }
  } else {
    try {
      const aiResult = await ai.generateReport({
        type: 'daily', date,
        stats: {
          workSeconds: totalWorkSeconds, learningSeconds: totalLearningSeconds,
          projectBreakdown: projectBreakdown.map(p => ({ projectName: p.projectName, seconds: p.minutes * 60 })),
          topicBreakdown: learningBreakdown.map(l => ({ topicName: l.topicName, categoryName: l.categoryName, seconds: l.minutes * 60 })),
          completedItems, problems, solutions
        }
      })
      const summarySection = aiResult.sections.find((s: any) => s.heading.includes('综述'))
      reportData.aiSummary = summarySection?.body || aiResult.fullMarkdown
    } catch {
      reportData.aiSummary = 'AI 总结生成失败，请稍后重试。'
    }
  }

  saveDailyReport(db, { userId, date, contentJson: JSON.stringify(reportData), workSeconds: totalWorkSeconds, learningSeconds: totalLearningSeconds })
  return reportData
}

function calculateStreak(db: Database.Database, userId: string, dateStr: string): number {
  let streak = 0
  const current = new Date(dateStr)
  while (true) {
    const d = current.toISOString().slice(0, 10)
    const workRow = db.prepare(`SELECT COUNT(*) as c FROM work_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`).get(userId, d) as any
    const learnRow = db.prepare(`SELECT COUNT(*) as c FROM learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`).get(userId, d) as any
    if (workRow.c === 0 && learnRow.c === 0) break
    streak++
    current.setDate(current.getDate() - 1)
  }
  return streak
}

function buildTimeline(workSessions: any[], learningSessions: any[]) {
  const events: { time: string; type: string; description: string }[] = []
  for (const s of workSessions) {
    events.push({ time: s.start_time.slice(11, 16), type: 'work_start', description: `开始工作: ${s.project_name}` })
    if (s.end_time) events.push({ time: s.end_time.slice(11, 16), type: 'work_end', description: `结束工作: ${s.project_name} (${Math.round((s.effective_seconds || 0) / 60)}m)` })
  }
  for (const s of learningSessions) {
    events.push({ time: s.start_time.slice(11, 16), type: 'learning_start', description: `开始学习: ${s.topic_name}` })
    if (s.end_time) events.push({ time: s.end_time.slice(11, 16), type: 'learning_end', description: `结束学习: ${s.topic_name} (${Math.round((s.effective_seconds || 0) / 60)}m)` })
  }
  events.sort((a, b) => a.time.localeCompare(b.time))
  return events
}
