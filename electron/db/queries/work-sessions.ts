import Database from 'better-sqlite3'
import { generateId } from '../../utils/id'
import { now } from '../../utils/time'

export function createWorkSession(db: Database.Database, data: { userId: string; projectId: string; taskId?: string }) {
  const id = generateId()
  const timestamp = now()
  db.prepare(`INSERT INTO work_sessions (id, user_id, project_id, task_id, start_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, data.userId, data.projectId, data.taskId || null, timestamp, timestamp, timestamp
  )
  return getWorkSession(db, id)
}

export function getWorkSession(db: Database.Database, id: string) {
  const session = db.prepare(`SELECT * FROM work_sessions WHERE id = ?`).get(id) as any
  if (session) {
    session.tags = db.prepare(
      `SELECT t.* FROM tags t JOIN work_session_tags wst ON t.id = wst.tag_id WHERE wst.session_id = ?`
    ).all(id)
  }
  return session
}

export function completeWorkSession(db: Database.Database, id: string, data: {
  effectiveSeconds: number; rawNotes?: string; completedWork?: string
  problems?: string; solutions?: string; nextSteps?: string
}) {
  db.prepare(
    `UPDATE work_sessions SET end_time = ?, effective_seconds = ?, raw_notes = ?, completed_work = ?, problems = ?, solutions = ?, next_steps = ?, status = 'completed', updated_at = ? WHERE id = ?`
  ).run(now(), data.effectiveSeconds, data.rawNotes || null, data.completedWork || null,
    data.problems || null, data.solutions || null, data.nextSteps || null, now(), id)
  return getWorkSession(db, id)
}

export function listWorkSessions(db: Database.Database, filters?: {
  userId?: string; projectId?: string; dateFrom?: string; dateTo?: string; limit?: number
}) {
  let sql = `SELECT ws.*, p.name as project_name, t.name as task_name
    FROM work_sessions ws LEFT JOIN projects p ON ws.project_id = p.id
    LEFT JOIN tasks t ON ws.task_id = t.id WHERE 1=1`
  const params: any[] = []
  if (filters?.userId) { sql += ` AND ws.user_id = ?`; params.push(filters.userId) }
  if (filters?.projectId) { sql += ` AND ws.project_id = ?`; params.push(filters.projectId) }
  if (filters?.dateFrom) { sql += ` AND ws.start_time >= ?`; params.push(filters.dateFrom) }
  if (filters?.dateTo) { sql += ` AND ws.start_time <= ?`; params.push(filters.dateTo + 'T23:59:59.999Z') }
  sql += ` ORDER BY ws.start_time DESC`
  if (filters?.limit) { sql += ` LIMIT ?`; params.push(filters.limit) }
  return db.prepare(sql).all(...params)
}

export function getWorkSessionsByDate(db: Database.Database, date: string, userId?: string) {
  let sql = `SELECT ws.*, p.name as project_name FROM work_sessions ws LEFT JOIN projects p ON ws.project_id = p.id
    WHERE ws.start_time >= ? AND ws.start_time <= ?`
  const params: any[] = [date + 'T00:00:00.000Z', date + 'T23:59:59.999Z']
  if (userId) { sql += ` AND ws.user_id = ?`; params.push(userId) }
  sql += ` ORDER BY ws.start_time ASC`
  return db.prepare(sql).all(...params)
}

export function getTotalWorkSecondsByDateRange(db: Database.Database, dateFrom: string, dateTo: string, userId?: string) {
  let sql = `SELECT COALESCE(SUM(effective_seconds), 0) as total FROM work_sessions WHERE start_time >= ? AND start_time <= ? AND status = 'completed'`
  const params: any[] = [dateFrom + 'T00:00:00.000Z', dateTo + 'T23:59:59.999Z']
  if (userId) { sql += ` AND user_id = ?`; params.push(userId) }
  return (db.prepare(sql).get(...params) as any).total
}
