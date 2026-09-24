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
const durableIngestorPath = path.join(root, "runtime/agentlog/events/durable-ingestor.cjs");

class RuntimeBrowserWindow extends EventEmitter {
  static instances = [];

  static reset() {
    RuntimeBrowserWindow.instances = [];
  }

  static getAllWindows() {
    return RuntimeBrowserWindow.instances;
  }

  static fromWebContents() {
    return null;
  }

  constructor(options) {
    super();
    this.options = options;
    this.destroyed = false;
    this.destroyCalls = 0;
    this.sent = [];
    this.webContents = {
      isDestroyed: () => this.destroyed,
      send: (...args) => this.sent.push(args),
    };
    RuntimeBrowserWindow.instances.push(this);
  }

  loadFile() {}
  show() {}
  hide() {}
  focus() {}

  isDestroyed() {
    return this.destroyed;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyCalls += 1;
    this.destroyed = true;
    this.emit("closed");
  }
}

function createElectron(userData) {
  RuntimeBrowserWindow.reset();
  const app = new EventEmitter();
  const handlers = new Map();
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
  return {
    app,
    BrowserWindow: RuntimeBrowserWindow,
    ipcMain: {
      handlers,
      handle(channel, listener) {
        if (handlers.has(channel)) throw new Error(`duplicate handler: ${channel}`);
        handlers.set(channel, listener);
      },
      removeHandler(channel) {
        handlers.delete(channel);
      },
    },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  };
}

function createRepeatableElectron(userData) {
  RuntimeBrowserWindow.reset();
  const app = new EventEmitter();
  const handlers = new Map();
  let readyCallback;
  app.getPath = (name) => {
    assert.equal(name, "userData");
    return userData;
  };
  app.whenReady = () => ({
    then(onReady) {
      readyCallback = onReady;
    },
  });
  app.emitReady = async () => {
    readyCallback();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return {
    app,
    BrowserWindow: RuntimeBrowserWindow,
    ipcMain: {
      handlers,
      handle(channel, listener) {
        if (handlers.has(channel)) throw new Error(`duplicate handler: ${channel}`);
        handlers.set(channel, listener);
      },
      removeHandler(channel) {
        handlers.delete(channel);
      },
    },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  };
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

test("health reports default and injected tray diagnostics without starting storage", (t) => {
  const { electron, runtime } = createHarness(t);

  assert.deepEqual(runtime.getHealth(), {
    storage: "starting",
    databaseName: "agentlog.db",
    errorMessage: null,
    tray: { status: "starting", code: null },
  });

  runtime.setTrayHealthProvider(() => ({ status: "native", code: null }));

  assert.deepEqual(runtime.getHealth().tray, { status: "native", code: null });
  assert.equal(electron.app.listenerCount("before-quit"), 0);
});

test("health keeps storage diagnostics when the tray provider throws", (t) => {
  const { electron, runtime } = createHarness(t);

  runtime.setTrayHealthProvider(() => {
    throw new Error("tray runtime unavailable");
  });

  assert.deepEqual(runtime.getHealth(), {
    storage: "starting",
    databaseName: "agentlog.db",
    errorMessage: null,
    tray: { status: "starting", code: null },
  });
  assert.equal(electron.app.listenerCount("before-quit"), 0);
});

test("health falls back to starting tray diagnostics for malformed provider data", (t) => {
  const { electron, runtime } = createHarness(t);

  runtime.setTrayHealthProvider(() => ({ status: null, code: "/home/user/private-tray.log" }));

  assert.deepEqual(runtime.getHealth(), {
    storage: "starting",
    databaseName: "agentlog.db",
    errorMessage: null,
    tray: { status: "starting", code: null },
  });
  assert.equal(electron.app.listenerCount("before-quit"), 0);
});

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
    tray: { status: "starting", code: null },
  });
  assert.equal(bridge.getAgentEventStats().subscribers, 1);
});

test("a durable agent event notifies open manager windows", async (t) => {
  const { bridge, electron, runtime } = createHarness(t);

  runtime.install(electron);
  await electron.app.emitReady();
  const window = new electron.BrowserWindow({});

  bridge.publishUpstreamEvent(fixture("manager-refresh"));

  assert.deepEqual(window.sent, [["agentlog:data-changed", "agent-events"]]);
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

test("a failed queued ingest retains that event and later events in FIFO order", async (t) => {
  const durableIngestor = require(durableIngestorPath);
  const createDurableIngestor = durableIngestor.createDurableIngestor;
  let failOnce = true;
  durableIngestor.createDurableIngestor = (options) => {
    const ingestor = createDurableIngestor(options);
    return {
      ingest(event) {
        if (failOnce && event.sourceEventId === "two") {
          failOnce = false;
          throw new Error("injected queued ingest failure");
        }
        return ingestor.ingest(event);
      },
    };
  };

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-app-runtime-retry-"));
  const electron = createRepeatableElectron(userData);
  const { runtime, bridge } = loadRuntime();
  t.after(async () => {
    await runtime.shutdown();
    durableIngestor.createDurableIngestor = createDurableIngestor;
    fs.rmSync(userData, { recursive: true, force: true });
  });

  runtime.install(electron);
  bridge.publishUpstreamEvent(fixture("one", { timestamp: 100 }));
  bridge.publishUpstreamEvent(fixture("two", { timestamp: 200 }));
  bridge.publishUpstreamEvent(fixture("three", { timestamp: 300 }));
  await electron.app.emitReady();
  assert.equal(runtime.getHealth().storage, "error");

  bridge.publishUpstreamEvent(fixture("four", { timestamp: 400 }));
  await electron.app.emitReady();

  assert.deepEqual(
    runtime.getServices().database
      .prepare("SELECT source_event_id FROM agent_events ORDER BY source_sequence")
      .all()
      .map((row) => row.source_event_id),
    ["one", "two", "three", "four"]
  );
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

test("rejected readiness becomes a safe storage error and cleans up lifecycle hooks", async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-app-runtime-ready-reject-"));
  const electron = createElectron(userData);
  electron.app.whenReady = () => Promise.reject(new Error(`readiness failed at ${userData}`));
  const { runtime, bridge } = loadRuntime();
  t.after(async () => {
    await runtime.shutdown();
    fs.rmSync(userData, { recursive: true, force: true });
  });

  runtime.install(electron);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(runtime.getHealth(), {
    storage: "error",
    databaseName: "agentlog.db",
    errorMessage: "Unable to open Mobi Agent Pet storage",
    tray: { status: "starting", code: null },
  });
  assert.doesNotMatch(JSON.stringify(runtime.getHealth()), new RegExp(userData.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(bridge.getAgentEventStats().subscribers, 0);
  assert.equal(electron.app.listenerCount("before-quit"), 0);
  assert.equal(runtime.openManager(), null);
});

test("synchronous whenReady failure subscribes first then becomes a cleaned-up storage error", async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-app-runtime-ready-throw-"));
  const electron = createElectron(userData);
  const { runtime, bridge } = loadRuntime();
  let subscribersWhenReadinessWasRequested = null;
  electron.app.whenReady = () => {
    subscribersWhenReadinessWasRequested = bridge.getAgentEventStats().subscribers;
    throw new Error(`readiness failed at ${userData}`);
  };
  t.after(async () => {
    await runtime.shutdown();
    fs.rmSync(userData, { recursive: true, force: true });
  });

  assert.doesNotThrow(() => runtime.install(electron));

  assert.equal(subscribersWhenReadinessWasRequested, 1);
  assert.deepEqual(runtime.getHealth(), {
    storage: "error",
    databaseName: "agentlog.db",
    errorMessage: "Unable to open Mobi Agent Pet storage",
    tray: { status: "starting", code: null },
  });
  assert.doesNotMatch(JSON.stringify(runtime.getHealth()), new RegExp(userData.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(bridge.getAgentEventStats().subscribers, 0);
  assert.equal(electron.app.listenerCount("before-quit"), 0);
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

test("manager IPC registers once and its window is destroyed during AgentLog shutdown", async (t) => {
  const { electron, runtime } = createHarness(t);

  runtime.install(electron);
  runtime.install(electron);
  await electron.app.emitReady();
  const manager = runtime.openManager();

  assert.ok(electron.ipcMain.handlers.has("agentlog:overview:get"));
  assert.ok(electron.ipcMain.handlers.has("agentlog:host:open-settings"));
  assert.equal(electron.ipcMain.handlers.size, 23);
  assert.equal(RuntimeBrowserWindow.instances.length, 1);

  await runtime.shutdown();

  assert.equal(electron.ipcMain.handlers.size, 0);
  assert.equal(manager.destroyCalls, 1);
  assert.equal(runtime.openManager(), null);
});

test("runtime broadcasts host language changes to an open Manager", async (t) => {
  const { electron, runtime } = createHarness(t);
  runtime.install(electron);
  await electron.app.emitReady();
  const manager = runtime.openManager();

  runtime.notifyManager("language");

  assert.deepEqual(manager.sent, [["agentlog:data-changed", "language"]]);
});
