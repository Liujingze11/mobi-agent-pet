import Database from 'better-sqlite3'

export function getFirstUser(db: Database.Database) {
  return db.prepare(`SELECT * FROM users LIMIT 1`).get()
}

export function getUser(db: Database.Database, id: string) {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id)
}
