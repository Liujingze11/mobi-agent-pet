import Database from 'better-sqlite3'
import { generateId } from '../../utils/id'
import { now } from '../../utils/time'

export function listTasksByProject(db: Database.Database, projectId: string) {
  return db.prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC`).all(projectId)
}

export function getTask(db: Database.Database, id: string) {
  return db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id)
}

export function createTask(db: Database.Database, data: { projectId: string; name: string; description?: string; priority?: number }) {
  const id = generateId()
  const timestamp = now()
  db.prepare(`INSERT INTO tasks (id, project_id, name, description, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, data.projectId, data.name, data.description || null, data.priority || 0, timestamp, timestamp
  )
  return getTask(db, id)
}

export function updateTask(db: Database.Database, id: string, data: { name?: string; description?: string; status?: string; priority?: number }) {
  const sets: string[] = []
  const params: any[] = []
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`)
      params.push(value)
    }
  }
  if (sets.length === 0) return getTask(db, id)
  sets.push(`updated_at = ?`)
  params.push(now())
  params.push(id)
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return getTask(db, id)
}

export function removeTask(db: Database.Database, id: string) {
  return db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id)
}
