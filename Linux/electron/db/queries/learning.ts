import Database from 'better-sqlite3'
import { generateId } from '../../utils/id'
import { now } from '../../utils/time'

export function listCategories(db: Database.Database) {
  return db.prepare(`SELECT * FROM learning_categories ORDER BY sort_order ASC`).all()
}

export function createCategory(db: Database.Database, data: { name: string; icon?: string; color?: string }) {
  const id = generateId()
  db.prepare(`INSERT INTO learning_categories (id, name, icon, color) VALUES (?, ?, ?, ?)`).run(
    id, data.name, data.icon || '📚', data.color || '#22c55e'
  )
  return db.prepare(`SELECT * FROM learning_categories WHERE id = ?`).get(id)
}

export function listTopics(db: Database.Database, categoryId?: string) {
  if (categoryId) {
    return db.prepare(
      `SELECT lt.*, lc.name as category_name FROM learning_topics lt JOIN learning_categories lc ON lt.category_id = lc.id WHERE lt.category_id = ? ORDER BY lt.updated_at DESC`
    ).all(categoryId)
  }
  return db.prepare(
    `SELECT lt.*, lc.name as category_name FROM learning_topics lt JOIN learning_categories lc ON lt.category_id = lc.id ORDER BY lt.updated_at DESC`
  ).all()
}

export function createTopic(db: Database.Database, data: { categoryId: string; name: string; description?: string }) {
  const id = generateId()
  const timestamp = now()
  db.prepare(`INSERT INTO learning_topics (id, category_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id, data.categoryId, data.name, data.description || null, timestamp, timestamp
  )
  return db.prepare(`SELECT * FROM learning_topics WHERE id = ?`).get(id)
}

export function createLearningSession(db: Database.Database, data: { userId: string; topicId: string }) {
  const id = generateId()
  const timestamp = now()
  db.prepare(`INSERT INTO learning_sessions (id, user_id, topic_id, start_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id, data.userId, data.topicId, timestamp, timestamp, timestamp
  )
  return db.prepare(`SELECT * FROM learning_sessions WHERE id = ?`).get(id)
}

export function getLearningSession(db: Database.Database, id: string) {
  return db.prepare(`SELECT * FROM learning_sessions WHERE id = ?`).get(id)
}

export function completeLearningSession(db: Database.Database, id: string, data: {
  effectiveSeconds: number; rawNotes?: string; learningContent?: string; gains?: string; questions?: string
}) {
  db.prepare(
    `UPDATE learning_sessions SET end_time = ?, effective_seconds = ?, raw_notes = ?, learning_content = ?, gains = ?, questions = ?, status = 'completed', updated_at = ? WHERE id = ?`
  ).run(now(), data.effectiveSeconds, data.rawNotes || null, data.learningContent || null,
    data.gains || null, data.questions || null, now(), id)
  return getLearningSession(db, id)
}

export function listLearningSessions(db: Database.Database, filters?: {
  userId?: string; topicId?: string; dateFrom?: string; dateTo?: string
}) {
  let sql = `SELECT ls.*, lt.name as topic_name, lc.name as category_name
    FROM learning_sessions ls JOIN learning_topics lt ON ls.topic_id = lt.id
    JOIN learning_categories lc ON lt.category_id = lc.id WHERE 1=1`
  const params: any[] = []
  if (filters?.userId) { sql += ` AND ls.user_id = ?`; params.push(filters.userId) }
  if (filters?.topicId) { sql += ` AND ls.topic_id = ?`; params.push(filters.topicId) }
  if (filters?.dateFrom) { sql += ` AND ls.start_time >= ?`; params.push(filters.dateFrom) }
  if (filters?.dateTo) { sql += ` AND ls.start_time <= ?`; params.push(filters.dateTo + 'T23:59:59.999Z') }
  sql += ` ORDER BY ls.start_time DESC`
  return db.prepare(sql).all(...params)
}
