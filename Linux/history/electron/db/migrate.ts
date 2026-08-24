import Database from 'better-sqlite3'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const CURRENT_VERSION = 2

export function runMigrations(db: Database.Database): void {
  // 确保迁移版本追踪表存在
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version   INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // 获取当前已应用的最高版本
  const row = db.prepare('SELECT MAX(version) as v FROM _migrations').get() as any
  const appliedVersion = row?.v || 0

  if (appliedVersion >= CURRENT_VERSION) return

  // 按版本号依次执行迁移
  for (let v = appliedVersion + 1; v <= CURRENT_VERSION; v++) {
    const sql = loadMigration(v)
    if (sql) {
      db.exec(sql)
    }
    db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(v)
    console.log(`  ✓ Migration v${v} applied`)
  }
}

function loadMigration(version: number): string | null {
  const appPath = app.getAppPath()
  const candidates = [
    // 按版本号命名: schema.v1.sql, schema.v2.sql, ...
    path.join(__dirname, `schema.v${version}.sql`),
    path.join(appPath, 'electron', 'db', `schema.v${version}.sql`),
    path.join(appPath, 'dist-electron', `schema.v${version}.sql`),
    // 兼容旧版单文件 schema.sql → 视为 v1
    path.join(__dirname, 'schema.sql'),
    path.join(appPath, 'electron', 'db', 'schema.sql'),
    path.join(appPath, 'dist-electron', 'schema.sql'),
    path.join(__dirname, '..', '..', 'electron', 'db', 'schema.sql'),
  ]

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8')
    }
  }

  return null
}
