import Database from 'better-sqlite3'
import { now } from '../../utils/time'

export function getSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as any
  return row?.value
}

export function setSetting(db: Database.Database, key: string, value: string) {
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`).run(key, value, now())
}

export function getAllSettings(db: Database.Database) {
  return db.prepare(`SELECT * FROM app_settings`).all()
}
