"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  closeAgentLogDatabase,
  openAgentLogDatabase,
} = require("../../runtime/agentlog/storage/database.cjs");

test("opens a fresh AgentLog database with Phase 2 schema and pragmas", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-database-"));
  const databasePath = path.join(tmp, "agentlog.db");
  const db = openAgentLogDatabase({ databasePath });

  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
  assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
  assert.equal(db.pragma("busy_timeout", { simple: true }), 5000);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row) => row.name);
  for (const name of [
    "projects",
    "project_paths",
    "agent_events",
    "agent_sessions",
    "agent_active_intervals",
    "human_sessions",
    "human_pause_intervals",
  ]) {
    assert.ok(tables.includes(name), name);
  }
  assert.equal(
    db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()
      .version,
    1
  );

  closeAgentLogDatabase(db);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("reopens an already migrated database without duplicate schema work", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-database-"));
  const databasePath = path.join(tmp, "agentlog.db");
  const firstDb = openAgentLogDatabase({ databasePath });
  const firstMigration = firstDb
    .prepare("SELECT version, applied_at FROM schema_migrations")
    .all();
  closeAgentLogDatabase(firstDb);

  const secondDb = openAgentLogDatabase({ databasePath });
  assert.deepEqual(
    secondDb.prepare("SELECT version, applied_at FROM schema_migrations").all(),
    firstMigration
  );
  assert.equal(
    secondDb
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'")
      .get().count,
    8
  );

  closeAgentLogDatabase(secondDb);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("cleanly closes an AgentLog database", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-database-"));
  const databasePath = path.join(tmp, "agentlog.db");
  const db = openAgentLogDatabase({ databasePath });

  closeAgentLogDatabase(db);

  assert.throws(() => db.prepare("SELECT 1").get(), /closed|not open/i);
  fs.rmSync(tmp, { recursive: true, force: true });
});
