"use strict";

const fs = require("node:fs");
const path = require("node:path");

function loadDatabaseConstructor({ env = process.env, load = require } = {}) {
  const DatabaseCtor = load("better-sqlite3");
  const nativeBinding = env.AGENTLOG_BETTER_SQLITE3_BINDING;
  if (!nativeBinding) return DatabaseCtor;
  return class AgentLogDatabase extends DatabaseCtor {
    constructor(filename, options = {}) {
      super(filename, { ...options, nativeBinding });
    }
  };
}

function openAgentLogDatabase({
  databasePath,
  DatabaseCtor,
} = {}) {
  const Constructor = DatabaseCtor || loadDatabaseConstructor();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  let db;
  try {
    db = new Constructor(databasePath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    runMigrations(db);
    return db;
  } catch (error) {
    if (db) {
      try {
        closeAgentLogDatabase(db);
      } catch {}
    }
    throw error;
  }
}

function runMigrations(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)"
  );
  const migrations = [{ version: 1, file: "schema-v1.sql" }];
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version)
  );
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const sql = fs.readFileSync(path.join(__dirname, migration.file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)"
      ).run(migration.version, Date.now());
    })();
  }
}

function closeAgentLogDatabase(db) {
  if (db && db.open) db.close();
}

module.exports = {
  closeAgentLogDatabase,
  loadDatabaseConstructor,
  openAgentLogDatabase,
  runMigrations,
};
