"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  closeAgentLogDatabase,
  loadDatabaseConstructor,
  openAgentLogDatabase,
} = require("../../runtime/agentlog/storage/database.cjs");

test("loads an explicit Electron-native binding without changing the Node default", () => {
  const calls = [];
  class DatabaseFixture {
    constructor(filename, options) {
      calls.push([filename, options]);
    }
  }
  const load = () => DatabaseFixture;

  assert.equal(loadDatabaseConstructor({ env: {}, load }), DatabaseFixture);
  const ElectronDatabase = loadDatabaseConstructor({
    env: { AGENTLOG_BETTER_SQLITE3_BINDING: "/tmp/electron-better-sqlite3.node" },
    load,
  });
  new ElectronDatabase("agentlog.db", { timeout: 100 });
  assert.deepEqual(calls, [["agentlog.db", {
    timeout: 100,
    nativeBinding: "/tmp/electron-better-sqlite3.node",
  }]]);
});

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

test("closes a constructed database handle once when pragma initialization fails", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-database-pragma-error-"));
  let handle;
  class PragmaFailureDatabase {
    constructor() {
      this.open = true;
      this.closeCalls = 0;
      handle = this;
    }

    pragma() {
      throw new Error("injected pragma failure");
    }

    close() {
      this.closeCalls += 1;
      this.open = false;
    }
  }

  assert.throws(
    () => openAgentLogDatabase({
      databasePath: path.join(tmp, "agentlog.db"),
      DatabaseCtor: PragmaFailureDatabase,
    }),
    /injected pragma failure/
  );
  assert.equal(handle.closeCalls, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("closes a constructed database handle once when migration initialization fails", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-database-migration-error-"));
  let handle;
  class MigrationFailureDatabase {
    constructor() {
      this.open = true;
      this.closeCalls = 0;
      handle = this;
    }

    pragma() {}

    exec() {
      throw new Error("injected migration failure");
    }

    close() {
      this.closeCalls += 1;
      this.open = false;
    }
  }

  assert.throws(
    () => openAgentLogDatabase({
      databasePath: path.join(tmp, "agentlog.db"),
      DatabaseCtor: MigrationFailureDatabase,
    }),
    /injected migration failure/
  );
  assert.equal(handle.closeCalls, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});
