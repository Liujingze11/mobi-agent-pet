"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { registerManagerIpc } = require("../../runtime/agentlog/manager/ipc.cjs");
const { installPreload, unwrapEnvelope } = require("../../runtime/agentlog/manager/preload.cjs");
const {
  closeAgentLogDatabase,
  openAgentLogDatabase,
} = require("../../runtime/agentlog/storage/database.cjs");
const { createProjectRepository } = require("../../runtime/agentlog/projects/project-repository.cjs");

function createHarness(t, options = {}) {
  const handlers = new Map();
  const sent = [];
  const calls = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-manager-ipc-"));
  const sender = {
    send(channel, payload) {
      sent.push({ channel, payload });
    },
  };
  const window = {
    webContents: sender,
    hide() {
      calls.push(["hide"]);
    },
  };
  const BrowserWindow = options.createBrowserWindow
    ? options.createBrowserWindow({ sender, window })
    : {
      fromWebContents(webContents) {
        return webContents === sender ? window : null;
      },
      getAllWindows() {
        return [window];
      },
    };
  const projectRepository = options.projectRepository || {
    createManual(input) {
      calls.push(["createManual", input]);
      return { id: "project-1", ...input };
    },
    get(id) { calls.push(["getProject", id]); return { id }; },
    update(id, input) { calls.push(["update", id, input]); return { id, ...input }; },
    confirm(id, input) { calls.push(["confirm", id, input]); return { id, ...input }; },
    archive(id) { calls.push(["archive", id]); return { id, lifecycle: "archived" }; },
    addPath(id, input) { calls.push(["addPath", id, input]); return { id: "path-1", projectId: id, ...input }; },
    removePath(id, pathId) { calls.push(["removePath", id, pathId]); return { id }; },
    rebindPrimary(id, pathId) { calls.push(["rebindPrimary", id, pathId]); return { id }; },
    merge(input) { calls.push(["merge", input]); return { id: input.targetProjectId }; },
  };
  const overviewQueries = {
    listProjects(input) {
      calls.push(["listProjects", input]);
      return [];
    },
    getOverview() { calls.push(["getOverview"]); return { today: {} }; },
    getProjectDetail(id, input) { calls.push(["getProjectDetail", id, input]); return { id }; },
    listSessions(input) { calls.push(["listSessions", input]); return []; },
    getProjectTimeline(id, input) { calls.push(["getProjectTimeline", id, input]); return []; },
  };
  const humanTimer = {
    getState() { calls.push(["timer:get"]); return null; },
    start(projectId) { calls.push(["timer:start", projectId]); return { code: "TIMER_ALREADY_ACTIVE", state: null }; },
    pause() { calls.push(["timer:pause"]); return null; },
    resume() { calls.push(["timer:resume"]); return null; },
    stop(input) { calls.push(["timer:stop", input]); return null; },
  };
  const hostBridge = {
    invokeHostAction(...input) { calls.push(["host", ...input]); return "opened"; },
  };
  const registration = registerManagerIpc({
    ipcMain: options.ipcMain || {
      handle(channel, listener) {
        handlers.set(channel, listener);
      },
      removeHandler(channel) {
        handlers.delete(channel);
      },
    },
    dialog: options.dialog || { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    BrowserWindow,
    fs,
    projectRepository,
    overviewQueries,
    humanTimer,
    runtime: options.runtime || { getHealth: () => ({ storage: "ready", databaseName: "agentlog.db", errorMessage: null }) },
    hostBridge,
  });
  t.after(() => {
    registration.dispose();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function invokeEnvelope(channel, input) {
    const listener = handlers.get(channel);
    if (!listener) throw new Error(`unhandled channel: ${channel}`);
    return listener({ sender }, input);
  }

  return {
    calls,
    channels() {
      return [...handlers.keys()].sort();
    },
    async invoke(channel, input) {
      return unwrapEnvelope(await invokeEnvelope(channel, input));
    },
    invokeEnvelope,
    projectRepository,
    registration,
    sender,
    sent,
    tmp,
  };
}

function createRendererApi(harness) {
  let exposed;
  installPreload({
    contextBridge: {
      exposeInMainWorld(name, value) {
        assert.equal(name, "agentLog");
        exposed = value;
      },
    },
    ipcRenderer: {
      invoke(channel, input) {
        return harness.invokeEnvelope(channel, input);
      },
      on() {},
      removeListener() {},
    },
  });
  return exposed;
}

test("main envelopes results and preload unwraps renderer-safe success and validation errors", async (t) => {
  const harness = createHarness(t);
  const renderer = createRendererApi(harness);

  assert.deepEqual(await harness.invokeEnvelope("agentlog:overview:get"), {
    ok: true,
    value: { today: {} },
  });
  assert.deepEqual(await renderer.overview.get(), { today: {} });
  assert.deepEqual(await harness.invokeEnvelope("agentlog:projects:archive", { id: null }), {
    ok: false,
    error: { code: "INVALID_ARGUMENT", message: "id must be a string" },
  });
  await assert.rejects(
    () => renderer.projects.archive(null),
    (error) => error.code === "INVALID_ARGUMENT" && error.message === "id must be a string"
      && error.stack === undefined
  );
});

test("projects:add-from-folder validates the selected directory in main", async (t) => {
  const api = createHarness(t);
  const projectDir = path.join(api.tmp, "project");
  fs.mkdirSync(projectDir);

  await api.invoke("agentlog:projects:add-from-folder", {
    path: projectDir,
    name: "  Demo  ",
  });

  assert.deepEqual(api.calls, [["createManual", {
    path: projectDir,
    name: "Demo",
    description: "",
  }]]);
});

test("manager handlers normalize inputs and call the Task 2-7 services", async (t) => {
  const api = createHarness(t);
  const projectDir = path.join(api.tmp, "alias");
  fs.mkdirSync(projectDir);

  assert.deepEqual(await api.invoke("agentlog:overview:get"), { today: {} });
  await api.invoke("agentlog:projects:get", { id: " project-1 ", includeArchived: true });
  await api.invoke("agentlog:projects:update", { id: " project-1 ", name: " Renamed ", description: " Notes " });
  await api.invoke("agentlog:projects:confirm", { id: " project-1 ", name: " Confirmed " });
  await api.invoke("agentlog:projects:archive", { id: " project-1 " });
  await api.invoke("agentlog:projects:add-path", { projectId: " project-1 ", path: projectDir });
  await api.invoke("agentlog:projects:remove-path", { projectId: " project-1 ", pathId: " path-1 " });
  await api.invoke("agentlog:projects:rebind", { projectId: " project-1 ", pathId: " path-1 " });
  await api.invoke("agentlog:projects:merge", { sourceProjectId: " project-2 ", targetProjectId: " project-1 " });
  await api.invoke("agentlog:sessions:list", { source: " human ", projectId: " project-1 ", status: " running ", limit: 10 });
  await api.invoke("agentlog:sessions:timeline", { projectId: " project-1 ", category: " tool_activity ", limit: 10 });
  assert.deepEqual(await api.invoke("agentlog:human-timer:start", { projectId: " project-1 " }), {
    code: "TIMER_ALREADY_ACTIVE", state: null,
  });
  await api.invoke("agentlog:human-timer:get");
  await api.invoke("agentlog:human-timer:pause");
  await api.invoke("agentlog:human-timer:resume");
  await api.invoke("agentlog:human-timer:stop", { notes: " Finished " });

  assert.deepEqual(api.calls, [
    ["getOverview"],
    ["getProjectDetail", "project-1", { includeArchived: true }],
    ["update", "project-1", { name: "Renamed", description: "Notes" }],
    ["confirm", "project-1", { name: "Confirmed" }],
    ["archive", "project-1"],
    ["addPath", "project-1", { path: projectDir, kind: "alias" }],
    ["removePath", "project-1", "path-1"],
    ["rebindPrimary", "project-1", "path-1"],
    ["merge", { sourceProjectId: "project-2", targetProjectId: "project-1" }],
    ["listSessions", { source: "human", projectId: "project-1", status: "running", limit: 10 }],
    ["getProjectTimeline", "project-1", { category: "tool_activity", limit: 10 }],
    ["timer:start", "project-1"],
    ["timer:get"],
    ["timer:pause"],
    ["timer:resume"],
    ["timer:stop", { notes: "Finished" }],
  ]);
});

test("handler validation rejects malformed and overlong renderer input before service calls", async (t) => {
  const api = createHarness(t);

  for (const [channel, input] of [
    ["agentlog:projects:archive", { id: " " }],
    ["agentlog:projects:merge", { sourceProjectId: "same", targetProjectId: "same" }],
    ["agentlog:sessions:list", { source: "bot" }],
    ["agentlog:sessions:timeline", { projectId: "project-1", limit: 501 }],
    ["agentlog:human-timer:stop", { notes: "x".repeat(4001) }],
  ]) {
    await assert.rejects(async () => api.invoke(channel, input), (error) => error.code === "INVALID_ARGUMENT");
  }
  assert.deepEqual(api.calls, []);
});

test("untagged RangeErrors are redacted through the envelope and preload", async (t) => {
  const harness = createHarness(t);
  const renderer = createRendererApi(harness);
  const privatePath = "/home/user/private/agentlog.db";
  harness.projectRepository.archive = () => { throw new RangeError(`database failed at ${privatePath}`); };

  assert.deepEqual(await harness.invokeEnvelope("agentlog:projects:archive", { id: "project-1" }), {
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "AgentLog operation failed" },
  });
  await assert.rejects(
    () => renderer.projects.archive("project-1"),
    (error) => error.code === "INTERNAL_ERROR"
      && error.message === "AgentLog operation failed"
      && !error.message.includes(privatePath)
  );
});

test("missing projects return safe NOT_FOUND errors through the envelope and preload", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-manager-missing-project-"));
  const database = openAgentLogDatabase({ databasePath: path.join(tmp, "agentlog.db") });
  const projectRepository = createProjectRepository(database, { createId: () => "unused" });
  t.after(() => {
    closeAgentLogDatabase(database);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const harness = createHarness(t, { projectRepository });
  const renderer = createRendererApi(harness);

  assert.deepEqual(await harness.invokeEnvelope("agentlog:projects:archive", { id: "missing" }), {
    ok: false,
    error: { code: "NOT_FOUND", message: "project not found" },
  });
  await assert.rejects(
    () => renderer.projects.archive("missing"),
    (error) => error.code === "NOT_FOUND" && error.message === "project not found"
  );
});

test("missing project paths return safe NOT_FOUND errors through the envelope and preload", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-manager-missing-path-"));
  const database = openAgentLogDatabase({ databasePath: path.join(tmp, "agentlog.db") });
  let nextId = 0;
  const projectRepository = createProjectRepository(database, {
    createId: () => `project-${++nextId}`,
  });
  const projectDir = path.join(tmp, "project");
  fs.mkdirSync(projectDir);
  const project = projectRepository.createManual({ name: "Project", path: projectDir });
  t.after(() => {
    closeAgentLogDatabase(database);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const harness = createHarness(t, { projectRepository });
  const renderer = createRendererApi(harness);
  const input = { projectId: project.id, pathId: "missing" };

  assert.deepEqual(await harness.invokeEnvelope("agentlog:projects:remove-path", input), {
    ok: false,
    error: { code: "NOT_FOUND", message: "project path not found" },
  });
  await assert.rejects(
    () => renderer.projects.removePath(input),
    (error) => error.code === "NOT_FOUND" && error.message === "project path not found"
  );
});

test("primary project paths return INVALID_OPERATION through the full manager boundary", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-manager-primary-path-"));
  const database = openAgentLogDatabase({ databasePath: path.join(tmp, "agentlog.db") });
  let nextId = 0;
  const projectRepository = createProjectRepository(database, {
    createId: () => `project-${++nextId}`,
  });
  const projectDir = path.join(tmp, "project");
  fs.mkdirSync(projectDir);
  const project = projectRepository.createManual({ name: "Primary", path: projectDir });
  t.after(() => {
    closeAgentLogDatabase(database);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const harness = createHarness(t, { projectRepository });
  const renderer = createRendererApi(harness);

  await assert.rejects(
    () => renderer.projects.removePath({ projectId: project.id, pathId: project.paths[0].id }),
    (error) => error.code === "INVALID_OPERATION" && error.message === "primary path cannot be removed"
  );
});

test("provided non-string optional text is rejected before project or timer mutation", async (t) => {
  const harness = createHarness(t);
  const renderer = createRendererApi(harness);

  await assert.rejects(
    () => renderer.projects.update({ id: "project-1", description: null }),
    (error) => error.code === "INVALID_ARGUMENT" && error.message === "description must be a string"
  );
  await assert.rejects(
    () => renderer.humanTimer.stop(null),
    (error) => error.code === "INVALID_ARGUMENT" && error.message === "notes must be a string"
  );
  assert.deepEqual(harness.calls, []);
});

test("IPC registration rolls back already-installed handlers after a middle-channel collision", () => {
  const collision = "agentlog:projects:archive";
  const existingCollision = () => {};
  const unrelated = () => {};
  const handlers = new Map([
    [collision, existingCollision],
    ["unrelated:channel", unrelated],
  ]);
  const removed = [];
  const ipcMain = {
    handle(channel, listener) {
      if (handlers.has(channel)) throw new Error(`handler already registered: ${channel}`);
      handlers.set(channel, listener);
    },
    removeHandler(channel) {
      removed.push(channel);
      handlers.delete(channel);
    },
  };

  assert.throws(() => registerManagerIpc({ ipcMain }), /handler already registered: agentlog:projects:archive/);
  assert.deepEqual([...handlers.keys()].sort(), [collision, "unrelated:channel"]);
  assert.equal(handlers.get(collision), existingCollision);
  assert.equal(handlers.get("unrelated:channel"), unrelated);
  assert.deepEqual(removed, [
    "agentlog:overview:get",
    "agentlog:projects:list",
    "agentlog:projects:get",
    "agentlog:projects:pick-folder",
    "agentlog:projects:add-from-folder",
    "agentlog:projects:update",
    "agentlog:projects:confirm",
  ]);
});

test("unexpected service errors retain a structured code without leaking their message", async (t) => {
  const api = createHarness(t);
  api.projectRepository.archive = () => {
    const error = new Error("SQLite failed at /private/agentlog.db");
    error.code = "SQLITE_BUSY";
    throw error;
  };

  await assert.rejects(
    async () => api.invoke("agentlog:projects:archive", { id: "project-1" }),
    (error) => error.code === "INTERNAL_ERROR" && error.message === "AgentLog operation failed"
  );
});

test("diagnostics returns redacted runtime health only", async (t) => {
  const api = createHarness(t, {
    runtime: {
      getHealth: () => ({
        storage: "error",
        databaseName: "agentlog.db",
        errorMessage: "Unable to open AgentLog storage at /home/user/.config",
        databasePath: "/home/user/.config/data/agentlog.db",
        stack: "Error: secret stack",
      }),
    },
  });

  const health = await api.invoke("agentlog:diagnostics:get");
  assert.deepEqual(health, {
    storage: "error",
    databaseName: "agentlog.db",
    errorMessage: "Unable to open AgentLog storage",
  });
});

test("host settings and manager hide are scoped through trusted main-process objects", async (t) => {
  const api = createHarness(t);

  assert.equal(await api.invoke("agentlog:host:open-settings", { tab: " agents " }), "opened");
  await api.invoke("agentlog:manager:hide", { windowId: 999 });

  assert.deepEqual(api.calls, [["host", "openSettingsTab", "agents"], ["hide"]]);
});

test("preload exposes only frozen named APIs and unsubscribes its own change listener", async () => {
  const invocations = [];
  const listeners = [];
  let exposed;
  installPreload({
    contextBridge: {
      exposeInMainWorld(name, value) {
        assert.equal(name, "agentLog");
        exposed = value;
      },
    },
    ipcRenderer: {
      invoke(...input) {
        invocations.push(input);
        return { ok: true, value: undefined };
      },
      on(channel, listener) { listeners.push([channel, listener]); },
      removeListener(channel, listener) {
        const index = listeners.findIndex((item) => item[0] === channel && item[1] === listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    },
  });

  assert.deepEqual(Object.keys(exposed).sort(), [
    "diagnostics", "events", "humanTimer", "managerWindow", "overview", "projects", "sessions", "settings",
  ]);
  assert.equal(Object.isFrozen(exposed), true);
  for (const group of Object.values(exposed)) assert.equal(Object.isFrozen(group), true);
  assert.equal(exposed.invoke, undefined);
  assert.equal(exposed.ipcRenderer, undefined);
  assert.equal(exposed.filesystem, undefined);
  assert.deepEqual(Object.keys(exposed.projects).sort(), [
    "addFromFolder", "addPath", "archive", "confirm", "get", "list", "merge", "pickFolder", "rebind", "removePath", "update",
  ]);
  assert.deepEqual(Object.keys(exposed.sessions).sort(), ["list", "timeline"]);
  assert.deepEqual(Object.keys(exposed.humanTimer).sort(), ["get", "pause", "resume", "start", "stop"]);
  assert.deepEqual(Object.keys(exposed.settings), ["open"]);
  assert.deepEqual(Object.keys(exposed.diagnostics), ["get"]);
  assert.deepEqual(Object.keys(exposed.managerWindow), ["hide"]);
  assert.deepEqual(Object.keys(exposed.events), ["onChanged"]);

  await Promise.all([
    exposed.overview.get(),
    exposed.projects.get("project-1"),
    exposed.projects.archive("project-1"),
    exposed.humanTimer.start("project-1"),
    exposed.settings.open("agents"),
    exposed.managerWindow.hide(),
  ]);
  assert.deepEqual(invocations, [
    ["agentlog:overview:get"],
    ["agentlog:projects:get", { id: "project-1" }],
    ["agentlog:projects:archive", { id: "project-1" }],
    ["agentlog:human-timer:start", { projectId: "project-1" }],
    ["agentlog:host:open-settings", { tab: "agents" }],
    ["agentlog:manager:hide"],
  ]);

  const scopes = [];
  const first = exposed.events.onChanged((scope) => scopes.push(`first:${scope}`));
  const second = exposed.events.onChanged((scope) => scopes.push(`second:${scope}`));
  for (const [, listener] of [...listeners]) listener({}, "projects");
  first();
  for (const [, listener] of [...listeners]) listener({}, "human-timer");
  second();
  assert.deepEqual(scopes, ["first:projects", "second:projects", "second:human-timer"]);
  assert.deepEqual(listeners, []);
});

test("projects:pick-folder returns a serializable cancellation without creating a project", async (t) => {
  const api = createHarness(t);

  const result = await api.invoke("agentlog:projects:pick-folder");

  assert.deepEqual(result, { cancelled: true, path: null });
  assert.deepEqual(api.calls, []);
});

test("projects:pick-folder accepts only a real selected directory", async (t) => {
  const selected = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-picked-directory-"));
  t.after(() => fs.rmSync(selected, { recursive: true, force: true }));
  const api = createHarness(t, {
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [selected] }) },
  });

  assert.deepEqual(await api.invoke("agentlog:projects:pick-folder"), {
    cancelled: false,
    path: fs.realpathSync(selected),
  });
  assert.deepEqual(api.calls, []);
});

test("projects:pick-folder rejects a selected file before returning it to the renderer", async (t) => {
  const selected = path.join(os.tmpdir(), `agentlog-picked-file-${process.pid}-${Date.now()}`);
  fs.writeFileSync(selected, "not a directory");
  t.after(() => fs.rmSync(selected, { force: true }));
  const api = createHarness(t, {
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [selected] }) },
  });

  await assert.rejects(
    async () => api.invoke("agentlog:projects:pick-folder"),
    (error) => error.code === "INVALID_ARGUMENT"
  );
  assert.deepEqual(api.calls, []);
});

test("mutations fan out only compact invalidation scopes to every live window", async (t) => {
  const otherSent = [];
  const otherWindow = { webContents: { send: (...input) => otherSent.push(input) } };
  const api = createHarness(t, {
    createBrowserWindow({ sender, window }) {
      return {
        fromWebContents: (contents) => contents === sender ? window : null,
        getAllWindows: () => [window, otherWindow],
      };
    },
  });
  const projectDir = path.join(api.tmp, "broadcast-project");
  fs.mkdirSync(projectDir);

  await api.invoke("agentlog:projects:add-from-folder", { path: projectDir, name: "Broadcast" });

  assert.deepEqual(api.sent, [{ channel: "agentlog:data-changed", payload: "projects" }]);
  assert.deepEqual(otherSent, [["agentlog:data-changed", "projects"]]);
});

test("notification delivery failures do not turn a committed mutation into an error", async (t) => {
  const healthyEvents = [];
  const staleContents = {
    isDestroyed: () => true,
    send() {
      throw new Error("destroyed contents must not receive notifications");
    },
  };
  const throwingContents = {
    send() {
      throw new Error("webContents disappeared during send");
    },
  };
  const healthyContents = {
    send(...input) {
      healthyEvents.push(input);
    },
  };
  const api = createHarness(t, {
    createBrowserWindow({ sender, window }) {
      return {
        fromWebContents: (contents) => contents === sender ? window : null,
        getAllWindows: () => [
          { webContents: staleContents },
          { webContents: throwingContents },
          { webContents: healthyContents },
        ],
      };
    },
  });
  const renderer = createRendererApi(api);
  const projectDir = path.join(api.tmp, "notification-resilience");
  fs.mkdirSync(projectDir);

  assert.deepEqual(await renderer.projects.addFromFolder({ path: projectDir, name: "Committed" }), {
    id: "project-1",
    path: projectDir,
    name: "Committed",
    description: "",
  });
  assert.deepEqual(healthyEvents, [["agentlog:data-changed", "projects"]]);
});

test("duplicate IPC registration reuses its owner and disposal removes only owned handlers", (t) => {
  const handlers = new Map([["unrelated:channel", () => {}]]);
  const removed = [];
  let handleCalls = 0;
  const ipcMain = {
    handle(channel, listener) {
      handleCalls += 1;
      handlers.set(channel, listener);
    },
    removeHandler(channel) {
      removed.push(channel);
      handlers.delete(channel);
    },
  };
  const api = createHarness(t, { ipcMain });
  const duplicate = registerManagerIpc({ ipcMain });

  assert.equal(duplicate, api.registration);
  assert.equal(handleCalls, 22);
  api.registration.dispose();
  duplicate.dispose();
  assert.equal(removed.length, 22);
  assert.equal(handlers.has("unrelated:channel"), true);
  assert.equal(handlers.size, 1);
});

test("registration can notify manager windows about non-IPC data changes", (t) => {
  const api = createHarness(t);

  api.registration.notify("agent-events");

  assert.deepEqual(api.sent, [{
    channel: "agentlog:data-changed",
    payload: "agent-events",
  }]);
});

test("manager hide does not act on a window when the sender has no BrowserWindow", async (t) => {
  const hidden = [];
  const api = createHarness(t, {
    createBrowserWindow() {
      return {
        fromWebContents: () => null,
        getAllWindows: () => [{ hide: () => hidden.push("other"), webContents: { send() {} } }],
      };
    },
  });

  await api.invoke("agentlog:manager:hide", { windowId: 1 });

  assert.deepEqual(hidden, []);
});

test("projects:list rejects an unsupported lifecycle before querying", async (t) => {
  const api = createHarness(t);

  await assert.rejects(
    async () => api.invoke("agentlog:projects:list", { lifecycle: "deleted" }),
    (error) => error.code === "INVALID_ARGUMENT"
  );
  assert.deepEqual(api.calls, []);
});

test("registers only the named manager invoke channels", (t) => {
  const api = createHarness(t);

  assert.deepEqual(api.channels(), [
    "agentlog:diagnostics:get",
    "agentlog:host:open-settings",
    "agentlog:human-timer:get",
    "agentlog:human-timer:pause",
    "agentlog:human-timer:resume",
    "agentlog:human-timer:start",
    "agentlog:human-timer:stop",
    "agentlog:manager:hide",
    "agentlog:overview:get",
    "agentlog:projects:add-from-folder",
    "agentlog:projects:add-path",
    "agentlog:projects:archive",
    "agentlog:projects:confirm",
    "agentlog:projects:get",
    "agentlog:projects:list",
    "agentlog:projects:merge",
    "agentlog:projects:pick-folder",
    "agentlog:projects:rebind",
    "agentlog:projects:remove-path",
    "agentlog:projects:update",
    "agentlog:sessions:list",
    "agentlog:sessions:timeline",
  ]);
});
