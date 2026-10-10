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
    "providers",
    "provider_active",
    "provider_enabled",
    "provider_file_transactions",
    "provider_originals",
    "provider_balances",
  ]) {
    assert.ok(tables.includes(name), name);
  }
  assert.equal(
    db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()
      .version,
    8
  );
  assert.ok(db.prepare("PRAGMA table_info(agent_sessions)").all().some((column) => column.name === "project_assignment_source"));

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
    14
  );

  closeAgentLogDatabase(secondDb);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("upgrades a version 2 database without changing recorded sessions", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-database-v2-"));
  const databasePath = path.join(tmp, "agentlog.db");
  const DatabaseCtor = loadDatabaseConstructor();
  const old = new DatabaseCtor(databasePath);
  old.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
  old.exec(fs.readFileSync(path.join(__dirname, "../../runtime/agentlog/storage/schema-v1.sql"), "utf8"));
  old.exec(fs.readFileSync(path.join(__dirname, "../../runtime/agentlog/storage/schema-v2.sql"), "utf8"));
  old.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)").run(1, 1);
  old.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)").run(2, 2);
  old.prepare("INSERT INTO agent_sessions(id,agent_id,source_session_id,started_at,last_event_at,latest_state,disposition,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run("old-session", "codex", "source-1", 1, 2, "completed", "completed", 1, 2);
  old.close();

  const upgraded = openAgentLogDatabase({ databasePath });
  assert.equal(upgraded.prepare("SELECT id FROM agent_sessions").get().id, "old-session");
  assert.equal(upgraded.prepare("SELECT MAX(version) AS version FROM schema_migrations").get().version, 8);
  assert.ok(upgraded.prepare("PRAGMA table_info(providers)").all().some((column) => column.name === "universal_source_id"));
  closeAgentLogDatabase(upgraded);
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

test("upgrades enabled provider keys from version 7 without renaming live entries", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-database-v7-"));
  const databasePath = path.join(tmp, "agentlog.db");
  const Constructor = loadDatabaseConstructor();
  const old = new Constructor(databasePath);
  old.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
  for (let version = 1; version <= 7; version++) {
    old.exec(fs.readFileSync(path.join(__dirname, `../../runtime/agentlog/storage/schema-v${version}.sql`), "utf8"));
    old.prepare("INSERT INTO schema_migrations VALUES(?,?)").run(version, version);
  }
  old.prepare("INSERT INTO providers(id,app_id,name,activation,config_cipher,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .run("legacy-id", "pi", "Legacy", "available", Buffer.from("fixture"), 1, 1);
  old.prepare("INSERT INTO provider_enabled VALUES(?,?)").run("pi", "legacy-id");
  old.close();
  const upgraded = openAgentLogDatabase({ databasePath });
  try {
    assert.equal(upgraded.prepare("SELECT native_key FROM provider_enabled").get().native_key, "legacy-id");
  } finally { closeAgentLogDatabase(upgraded); fs.rmSync(tmp, { recursive: true, force: true }); }
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
