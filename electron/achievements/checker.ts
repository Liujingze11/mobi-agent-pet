import Database from 'better-sqlite3'
import { unlockAchievement, listAchievements, getUserAchievements } from '../db/queries/achievements'
import { getFirstUser } from '../db/queries/users'
import { logger } from '../utils/logger'

export class AchievementChecker {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  checkAll(): any[] {
    const user = getFirstUser(this.db) as any
    if (!user) return []

    const allAchievements = listAchievements(this.db) as any[]
    const userAchs = getUserAchievements(this.db, user.id) as any[]
    const unlockedKeys = new Set(
      userAchs.filter((ua: any) => ua.unlocked_at).map((ua: any) => ua.key)
    )

    const newUnlocks: any[] = []
    for (const ach of allAchievements) {
      if (unlockedKeys.has(ach.key)) continue
      const condition = JSON.parse(ach.condition_json)
      if (this.checkCondition(user.id, condition)) {
        const unlocked = unlockAchievement(this.db, user.id, ach.id)
        if (unlocked) {
          newUnlocks.push(unlocked)
          logger.info(`Achievement unlocked: ${ach.name}`)
        }
      }
    }
    return newUnlocks
  }

  private checkCondition(userId: string, condition: any): boolean {
    switch (condition.type) {
      case 'session_count': {
        const row = this.db.prepare(
          `SELECT COUNT(*) as c FROM (SELECT id FROM work_sessions WHERE user_id = ? AND status = 'completed' UNION ALL SELECT id FROM learning_sessions WHERE user_id = ? AND status = 'completed')`
        ).get(userId, userId) as any
        return row.c >= condition.threshold
      }
      case 'streak_days':
        return this.getCurrentStreak(userId) >= condition.threshold
      case 'total_work_hours': {
        const row = this.db.prepare(
          `SELECT COALESCE(SUM(effective_seconds), 0) as total FROM work_sessions WHERE user_id = ? AND status = 'completed'`
        ).get(userId) as any
        return (row.total / 3600) >= condition.threshold
      }
      case 'total_learning_hours': {
        const row = this.db.prepare(
          `SELECT COALESCE(SUM(effective_seconds), 0) as total FROM learning_sessions WHERE user_id = ? AND status = 'completed'`
        ).get(userId) as any
        return (row.total / 3600) >= condition.threshold
      }
      case 'project_completed': {
        const row = this.db.prepare(`SELECT COUNT(*) as c FROM projects WHERE status = 'completed'`).get() as any
        return row.c >= condition.threshold
      }
      case 'weekly_report_count': {
        const row = this.db.prepare(`SELECT COUNT(*) as c FROM weekly_reports WHERE user_id = ?`).get(userId) as any
        return row.c >= condition.threshold
      }
      case 'ai_summary_count': {
        const row = this.db.prepare(`SELECT COUNT(*) as c FROM ai_summaries`).get() as any
        return row.c >= condition.threshold
      }
      default:
        return false
    }
  }

  private getCurrentStreak(userId: string): number {
    let streak = 0
    const current = new Date()
    while (true) {
      const dateStr = current.toISOString().slice(0, 10)
      const wRow = this.db.prepare(
        `SELECT COUNT(*) as c FROM work_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`
      ).get(userId, dateStr) as any
      const lRow = this.db.prepare(
        `SELECT COUNT(*) as c FROM learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`
      ).get(userId, dateStr) as any
      if (wRow.c === 0 && lRow.c === 0) break
      streak++
      current.setDate(current.getDate() - 1)
    }
    return streak
  }
}
