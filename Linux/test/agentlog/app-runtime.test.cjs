"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const runtimePath = path.join(root, "runtime/agentlog/app-runtime.cjs");
const bridgePath = path.join(root, "runtime/agentlog/runtime-bridge.cjs");
const databasePath = path.join(root, "runtime/agentlog/storage/database.cjs");

function createElectron(userData) {
  const app = new EventEmitter();
  let resolveReady;
  app.getPath = (name) => {
    assert.equal(name, "userData");
    return userData;
  };
  app.whenReady = () => new Promise((resolve) => {
    resolveReady = resolve;
  });
  app.emitReady = async () => {
    resolveReady();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { app, BrowserWindow: {}, ipcMain: {}, dialog: {} };
}

function loadRuntime() {
  delete require.cache[require.resolve(runtimePath)];
  delete require.cache[require.resolve(bridgePath)];
  const runtime = require(runtimePath);
  const bridge = require(bridgePath);
  return { runtime, bridge };
}

function fixture(sourceEventId, overrides = {}) {
  return {
    sessionId: overrides.sessionId || "runtime-session",
    state: overrides.state || "working",
    event: overrides.event || "PreToolUse",
    opts: {
      agentId: "codex",
      sourceEventId,
      timestamp: overrides.timestamp || 100,
      ...overrides.opts,
    },
  };
}

function createHarness(t) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-app-runtime-"));
  const electron = createElectron(userData);
  const { runtime, bridge } = loadRuntime();
  t.after(async () => {
    await runtime.shutdown();
    fs.rmSync(userData, { recursive: true, force: true });
  });
  return { bridge, electron, runtime, userData };
}

test("events received before database readiness flush once in publication order and later events write directly", async (t) => {
  const { bridge, electron, runtime } = createHarness(t);

  runtime.install(electron);
  bridge.publishUpstreamEvent(fixture("one", { timestamp: 100 }));
  bridge.publishUpstreamEvent(fixture("two", { timestamp: 200 }));
  assert.equal(runtime.getHealth().storage, "starting");

  await electron.app.emitReady();
  bridge.publishUpstreamEvent(fixture("three", { timestamp: 300 }));

  const db = runtime.getServices().database;
  assert.deepEqual(
    db.prepare("SELECT source_event_id FROM agent_events ORDER BY source_sequence").all()
      .map((row) => row.source_event_id),
    ["one", "two", "three"]
  );
  assert.deepEqual(runtime.getHealth(), {
    storage: "ready",
    databaseName: "agentlog.db",
    errorMessage: null,
  });
  assert.equal(bridge.getAgentEventStats().subscribers, 1);
});

test("startup reconciliation runs before flushing a queued working event", async (t) => {
  const { bridge, electron, runtime } = createHarness(t);

  runtime.install(electron);
  bridge.publishUpstreamEvent(fixture("queued-working"));
  await electron.app.emitReady();

  const interval = runtime.getServices().database.prepare(
    "SELECT ended_at FROM agent_active_intervals"
  ).get();
  assert.deepEqual(interval, { ended_at: null });
});

test("storage startup failure exposes a safe health result", async (t) => {
  const userData = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-app-runtime-error-")), "not-a-directory");
  fs.writeFileSync(userData, "occupied");
  const electron = createElectron(userData);
  const { runtime } = loadRuntime();
  t.after(async () => {
    await runtime.shutdown();
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  });

  runtime.install(electron);
  await electron.app.emitReady();

  const health = runtime.getHealth();
  assert.equal(health.storage, "error");
  assert.equal(health.databaseName, "agentlog.db");
  assert.equal(typeof health.errorMessage, "string");
  assert.ok(health.errorMessage.length > 0);
  assert.doesNotMatch(JSON.stringify(health), new RegExp(userData.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("install and shutdown are idempotent and close the database once", async (t) => {
  const database = require(databasePath);
  const close = database.closeAgentLogDatabase;
  let closeCalls = 0;
  database.closeAgentLogDatabase = (db) => {
    closeCalls += 1;
    close(db);
  };
  t.after(() => {
    database.closeAgentLogDatabase = close;
  });

  const { electron, runtime } = createHarness(t);
  assert.equal(runtime.install(electron), runtime.install(electron));
  assert.equal(electron.app.listenerCount("before-quit"), 1);
  await electron.app.emitReady();
  await runtime.shutdown();
  await runtime.shutdown();

  assert.equal(closeCalls, 1);
  assert.equal(electron.app.listenerCount("before-quit"), 1);
});

test("host actions register through the runtime and showManager delegates to the host", (t) => {
  const { runtime } = createHarness(t);
  assert.throws(
    () => runtime.showManager(),
    /AgentLog host action unavailable: openAgentLogManager/
  );

  const calls = [];
  runtime.registerHostActions({
    openAgentLogManager(...args) {
      calls.push(args);
      return "shown";
    },
  });

  assert.equal(runtime.showManager("projects"), "shown");
  assert.deepEqual(calls, [["projects"]]);
});
