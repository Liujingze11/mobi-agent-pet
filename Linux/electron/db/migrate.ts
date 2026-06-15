import Database from 'better-sqlite3'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export function runMigrations(db: Database.Database): void {
  // 尝试多个路径查找 schema.sql
  const appPath = app.getAppPath()
  const candidates = [
    path.join(__dirname, 'schema.sql'),
    path.join(appPath, 'electron', 'db', 'schema.sql'),
    path.join(appPath, 'dist-electron', 'schema.sql'),
    path.join(__dirname, '..', '..', 'electron', 'db', 'schema.sql'),
  ]

  let schemaSql: string | null = null
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      schemaSql = fs.readFileSync(p, 'utf-8')
      break
    }
  }

  if (!schemaSql) {
    throw new Error(`Schema file not found. Searched: ${candidates.join(', ')}`)
  }

  db.exec(schemaSql)
}
