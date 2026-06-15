import Database from 'better-sqlite3'
import { TimerState } from './types'
import { generateId } from '../utils/id'

export function saveSnapshot(db: Database.Database, userId: string, state: TimerState): void {
  db.prepare(`DELETE FROM pulsecore_snapshot`).run()
  db.prepare(`
    INSERT INTO pulsecore_snapshot (id, user_id, state, session_type, session_id, project_id, task_id, topic_id, start_time, paused_at, accumulated_pause_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId(), userId, state.status, state.sessionType, state.currentSessionId,
    state.projectId, state.taskId, state.topicId, state.startTime, state.pausedAt,
    Math.floor(state.accumulatedPauseMs / 1000)
  )
}

export function loadSnapshot(db: Database.Database): { userId: string; state: TimerState } | null {
  const row = db.prepare(`SELECT * FROM pulsecore_snapshot ORDER BY saved_at DESC LIMIT 1`).get() as any
  if (!row) return null
  return {
    userId: row.user_id,
    state: {
      status: row.state,
      sessionType: row.session_type,
      currentSessionId: row.session_id,
      projectId: row.project_id,
      taskId: row.task_id,
      topicId: row.topic_id,
      startTime: row.start_time,
      pausedAt: row.paused_at,
      accumulatedPauseMs: (row.accumulated_pause_seconds || 0) * 1000
    }
  }
}

export function clearSnapshot(db: Database.Database): void {
  db.prepare(`DELETE FROM pulsecore_snapshot`).run()
}
