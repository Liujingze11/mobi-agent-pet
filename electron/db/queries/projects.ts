import Database from 'better-sqlite3'
import { generateId } from '../../utils/id'
import { now } from '../../utils/time'

export function listProjects(db: Database.Database, companyId?: string) {
  if (companyId) {
    return db.prepare(`SELECT * FROM projects WHERE company_id = ? AND status != 'archived' ORDER BY updated_at DESC`).all(companyId)
  }
  return db.prepare(`SELECT * FROM projects WHERE status != 'archived' ORDER BY updated_at DESC`).all()
}

export function getProject(db: Database.Database, id: string) {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id)
}

export function createProject(db: Database.Database, data: { companyId?: string; name: string; description?: string; color?: string }) {
  const id = generateId()
  const timestamp = now()
  db.prepare(`INSERT INTO projects (id, company_id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, data.companyId || null, data.name, data.description || null, data.color || '#6366f1', timestamp, timestamp
  )
  return getProject(db, id)
}

export function updateProject(db: Database.Database, id: string, data: { name?: string; description?: string; color?: string; status?: string }) {
  const sets: string[] = []
  const params: any[] = []
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`)
      params.push(value)
    }
  }
  if (sets.length === 0) return getProject(db, id)
  sets.push(`updated_at = ?`)
  params.push(now())
  params.push(id)
  db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return getProject(db, id)
}

export function removeProject(db: Database.Database, id: string) {
  return db.prepare(`UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?`).run(now(), id)
}

export function addProjectSeconds(db: Database.Database, projectId: string, seconds: number) {
  db.prepare(`UPDATE projects SET total_seconds = total_seconds + ?, updated_at = ? WHERE id = ?`).run(seconds, now(), projectId)
}
