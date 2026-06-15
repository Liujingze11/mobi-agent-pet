import Database from 'better-sqlite3'
import { generateId } from '../../utils/id'
import { now } from '../../utils/time'

export function getDailyReport(db: Database.Database, userId: string, date: string) {
  return db.prepare(`SELECT * FROM daily_reports WHERE user_id = ? AND date = ?`).get(userId, date)
}

export function saveDailyReport(db: Database.Database, data: {
  userId: string; date: string; contentJson: string; workSeconds: number; learningSeconds: number
}) {
  const existing = getDailyReport(db, data.userId, data.date)
  if (existing) {
    db.prepare(`UPDATE daily_reports SET content_json = ?, work_seconds = ?, learning_seconds = ?, created_at = ? WHERE user_id = ? AND date = ?`).run(
      data.contentJson, data.workSeconds, data.learningSeconds, now(), data.userId, data.date
    )
  } else {
    db.prepare(`INSERT INTO daily_reports (id, user_id, date, content_json, work_seconds, learning_seconds) VALUES (?, ?, ?, ?, ?, ?)`).run(
      generateId(), data.userId, data.date, data.contentJson, data.workSeconds, data.learningSeconds
    )
  }
  return getDailyReport(db, data.userId, data.date)
}

export function getWeeklyReport(db: Database.Database, userId: string, year: number, week: number) {
  return db.prepare(`SELECT * FROM weekly_reports WHERE user_id = ? AND year = ? AND week = ?`).get(userId, year, week)
}

export function saveWeeklyReport(db: Database.Database, data: {
  userId: string; year: number; week: number; contentJson: string; workSeconds: number; learningSeconds: number
}) {
  const existing = getWeeklyReport(db, data.userId, data.year, data.week)
  if (existing) {
    db.prepare(`UPDATE weekly_reports SET content_json = ?, work_seconds = ?, learning_seconds = ?, created_at = ? WHERE user_id = ? AND year = ? AND week = ?`).run(
      data.contentJson, data.workSeconds, data.learningSeconds, now(), data.userId, data.year, data.week
    )
  } else {
    db.prepare(`INSERT INTO weekly_reports (id, user_id, year, week, content_json, work_seconds, learning_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      generateId(), data.userId, data.year, data.week, data.contentJson, data.workSeconds, data.learningSeconds
    )
  }
  return getWeeklyReport(db, data.userId, data.year, data.week)
}

export function getMonthlyReport(db: Database.Database, userId: string, year: number, month: number) {
  return db.prepare(`SELECT * FROM monthly_reports WHERE user_id = ? AND year = ? AND month = ?`).get(userId, year, month)
}

export function saveMonthlyReport(db: Database.Database, data: {
  userId: string; year: number; month: number; contentJson: string; workSeconds: number; learningSeconds: number
}) {
  const existing = getMonthlyReport(db, data.userId, data.year, data.month)
  if (existing) {
    db.prepare(`UPDATE monthly_reports SET content_json = ?, work_seconds = ?, learning_seconds = ?, created_at = ? WHERE user_id = ? AND year = ? AND month = ?`).run(
      data.contentJson, data.workSeconds, data.learningSeconds, now(), data.userId, data.year, data.month
    )
  } else {
    db.prepare(`INSERT INTO monthly_reports (id, user_id, year, month, content_json, work_seconds, learning_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      generateId(), data.userId, data.year, data.month, data.contentJson, data.workSeconds, data.learningSeconds
    )
  }
  return getMonthlyReport(db, data.userId, data.year, data.month)
}

export function getDailyStatsForRange(db: Database.Database, userId: string, dateFrom: string, dateTo: string) {
  return db.prepare(`
    SELECT date(ws.start_time) as date, COALESCE(SUM(ws.effective_seconds), 0) as work_seconds
    FROM work_sessions ws WHERE ws.user_id = ? AND ws.start_time >= ? AND ws.start_time <= ? AND ws.status = 'completed'
    GROUP BY date(ws.start_time) ORDER BY date ASC
  `).all(userId, dateFrom + 'T00:00:00.000Z', dateTo + 'T23:59:59.999Z')
}
