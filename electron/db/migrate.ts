import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export function runMigrations(db: Database.Database): void {
  const schemaPath = path.join(__dirname, 'schema.sql')
  const devSchemaPath = path.join(__dirname, '..', '..', 'electron', 'db', 'schema.sql')

  let schemaSql: string
  if (fs.existsSync(schemaPath)) {
    schemaSql = fs.readFileSync(schemaPath, 'utf-8')
  } else if (fs.existsSync(devSchemaPath)) {
    schemaSql = fs.readFileSync(devSchemaPath, 'utf-8')
  } else {
    throw new Error('Schema file not found')
  }

  db.exec(schemaSql)
}
