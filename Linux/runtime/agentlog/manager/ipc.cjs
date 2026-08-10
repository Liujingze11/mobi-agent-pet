"use strict";

const {
  boundedInteger,
  boundedText,
  directoryPath,
  inputObject,
  optionalBoolean,
  optionalEnum,
  optionalText,
  requiredId,
  validationError,
} = require("./validation.cjs");

const registrations = new WeakMap();
const PROJECT_SOURCES = ["manual", "agent"];
const PROJECT_CONFIRMATIONS = ["pending", "confirmed"];
const PROJECT_LIFECYCLES = ["active", "archived"];
const SESSION_SOURCES = ["agent", "human"];
const AGENT_SESSION_STATUSES = ["active", "completed", "errored", "interrupted"];
const HUMAN_SESSION_STATUSES = ["running", "paused", "completed"];
const EVENT_CATEGORIES = [
  "permission_requested",
  "session_started",
  "session_ended",
  "turn_started",
  "completed",
  "errored",
  "tool_activity",
  "state_changed",
];

function copyDefined(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function domainError(error) {
  if (error && error.code === "INVALID_ARGUMENT") return error;
  const result = new Error(error instanceof RangeError && error.message
    ? error.message
    : "AgentLog operation failed");
  result.code = error instanceof RangeError ? "NOT_FOUND"
    : (error && typeof error.code === "string" ? error.code : "INTERNAL_ERROR");
  return result;
}

function redactedHealth(runtime) {
  const health = runtime.getHealth();
  const storage = health && ["starting", "ready", "error"].includes(health.storage)
    ? health.storage
    : "error";
  const errorMessage = health && health.errorMessage ? "Unable to open AgentLog storage" : null;
  return { storage, databaseName: "agentlog.db", errorMessage };
}

function registerManagerIpc({
  ipcMain,
  fs,
  dialog,
  BrowserWindow,
  projectRepository,
  overviewQueries,
  humanTimer,
  runtime,
  hostBridge,
} = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function" || typeof ipcMain.removeHandler !== "function") {
    throw new TypeError("ipcMain with handle and removeHandler is required");
  }
  const existing = registrations.get(ipcMain);
  if (existing) return existing;

  const handlers = new Set();
  let disposed = false;

  function broadcast(scope) {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window || (typeof window.isDestroyed === "function" && window.isDestroyed())) continue;
      const contents = window.webContents;
      if (contents && typeof contents.send === "function") contents.send("agentlog:data-changed", scope);
    }
  }

  function mutation(scope, operation) {
    const result = operation();
    if (!result || !result.code) broadcast(scope);
    return result;
  }

  function handle(channel, listener) {
    ipcMain.handle(channel, async (event, input) => {
      try {
        return await listener(event, input);
      } catch (error) {
        throw domainError(error);
      }
    });
    handlers.add(channel);
  }

  handle("agentlog:overview:get", () => overviewQueries.getOverview());
  handle("agentlog:projects:list", (_event, value) => {
    const input = inputObject(value);
    return overviewQueries.listProjects(copyDefined({
      includeArchived: optionalBoolean(input.includeArchived, { name: "includeArchived" }),
      createdSource: optionalEnum(input.createdSource, { name: "createdSource", values: PROJECT_SOURCES }),
      confirmation: optionalEnum(input.confirmation, { name: "confirmation", values: PROJECT_CONFIRMATIONS }),
      lifecycle: optionalEnum(input.lifecycle, { name: "lifecycle", values: PROJECT_LIFECYCLES }),
    }));
  });
  handle("agentlog:projects:get", (_event, value) => {
    const input = inputObject(value);
    return overviewQueries.getProjectDetail(requiredId(input.id), {
      includeArchived: optionalBoolean(input.includeArchived, { name: "includeArchived" }) || false,
    });
  });
  handle("agentlog:projects:pick-folder", async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) || undefined;
    const result = await dialog.showOpenDialog(parent, { properties: ["openDirectory"] });
    if (!result || result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length !== 1) {
      return { cancelled: true, path: null };
    }
    return { cancelled: false, path: directoryPath(result.filePaths[0], fs) };
  });
  handle("agentlog:projects:add-from-folder", (_event, value) => {
    const input = inputObject(value);
    return mutation("projects", () => projectRepository.createManual({
      path: directoryPath(input.path, fs),
      name: boundedText(input.name, { name: "name", max: 200, required: true }),
      description: boundedText(input.description, { name: "description", max: 2000 }),
    }));
  });
  handle("agentlog:projects:update", (_event, value) => {
    const input = inputObject(value);
    return mutation("projects", () => projectRepository.update(requiredId(input.id), copyDefined({
      name: optionalText(input.name, { name: "name", max: 200, required: true }),
      description: optionalText(input.description, { name: "description", max: 2000 }),
    })));
  });
  handle("agentlog:projects:confirm", (_event, value) => {
    const input = inputObject(value);
    return mutation("projects", () => projectRepository.confirm(requiredId(input.id), copyDefined({
      name: optionalText(input.name, { name: "name", max: 200, required: true }),
      description: optionalText(input.description, { name: "description", max: 2000 }),
    })));
  });
  handle("agentlog:projects:archive", (_event, value) => {
    const input = inputObject(value);
    return mutation("projects", () => projectRepository.archive(requiredId(input.id)));
  });
  handle("agentlog:projects:add-path", (_event, value) => {
    const input = inputObject(value);
    return mutation("projects", () => projectRepository.addPath(requiredId(input.projectId, "projectId"), {
      path: directoryPath(input.path, fs),
      kind: optionalEnum(input.kind, { name: "kind", values: ["alias"] }) || "alias",
    }));
  });
  handle("agentlog:projects:remove-path", (_event, value) => {
    const input = inputObject(value);
    return mutation("projects", () => projectRepository.removePath(
      requiredId(input.projectId, "projectId"),
      requiredId(input.pathId, "pathId")
    ));
  });
  handle("agentlog:projects:rebind", (_event, value) => {
    const input = inputObject(value);
    return mutation("projects", () => projectRepository.rebindPrimary(
      requiredId(input.projectId, "projectId"),
      requiredId(input.pathId, "pathId")
    ));
  });
  handle("agentlog:projects:merge", (_event, value) => {
    const input = inputObject(value);
    const sourceProjectId = requiredId(input.sourceProjectId, "sourceProjectId");
    const targetProjectId = requiredId(input.targetProjectId, "targetProjectId");
    if (sourceProjectId === targetProjectId) throw validationError("sourceProjectId and targetProjectId must differ");
    return mutation("projects", () => projectRepository.merge({ sourceProjectId, targetProjectId }));
  });
  handle("agentlog:sessions:list", (_event, value) => {
    const input = inputObject(value);
    const source = optionalEnum(input.source, { name: "source", values: SESSION_SOURCES });
    const statuses = source === "agent" ? AGENT_SESSION_STATUSES
      : source === "human" ? HUMAN_SESSION_STATUSES
        : [...AGENT_SESSION_STATUSES, ...HUMAN_SESSION_STATUSES];
    return overviewQueries.listSessions(copyDefined({
      source,
      projectId: optionalText(input.projectId, { name: "projectId", max: 128, required: true }),
      status: optionalEnum(input.status, { name: "status", values: statuses }),
      agentId: optionalText(input.agentId, { name: "agentId", max: 128, required: true }),
      includeArchived: optionalBoolean(input.includeArchived, { name: "includeArchived" }),
      limit: input.limit === undefined ? undefined : boundedInteger(input.limit, { name: "limit", min: 0, max: 500 }),
    }));
  });
  handle("agentlog:sessions:timeline", (_event, value) => {
    const input = inputObject(value);
    return overviewQueries.getProjectTimeline(requiredId(input.projectId, "projectId"), copyDefined({
      agentId: optionalText(input.agentId, { name: "agentId", max: 128, required: true }),
      category: optionalEnum(input.category, { name: "category", values: EVENT_CATEGORIES }),
      type: optionalText(input.type, { name: "type", max: 256, required: true }),
      includeArchived: optionalBoolean(input.includeArchived, { name: "includeArchived" }),
      limit: input.limit === undefined ? undefined : boundedInteger(input.limit, { name: "limit", min: 0, max: 500 }),
    }));
  });
  handle("agentlog:human-timer:get", () => humanTimer.getState());
  handle("agentlog:human-timer:start", (_event, value) => {
    const input = inputObject(value);
    return mutation("human-timer", () => humanTimer.start(requiredId(input.projectId, "projectId")));
  });
  handle("agentlog:human-timer:pause", () => mutation("human-timer", () => humanTimer.pause()));
  handle("agentlog:human-timer:resume", () => mutation("human-timer", () => humanTimer.resume()));
  handle("agentlog:human-timer:stop", (_event, value) => {
    const input = inputObject(value);
    return mutation("human-timer", () => humanTimer.stop({
      notes: boundedText(input.notes, { name: "notes", max: 4000 }),
    }));
  });
  handle("agentlog:diagnostics:get", () => redactedHealth(runtime));
  handle("agentlog:manager:hide", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && !(typeof window.isDestroyed === "function" && window.isDestroyed())) window.hide();
  });
  handle("agentlog:host:open-settings", (_event, value) => {
    const input = inputObject(value);
    return hostBridge.invokeHostAction(
      "openSettingsTab",
      optionalText(input.tab, { name: "tab", max: 64, required: true })
    );
  });

  const registration = Object.freeze({
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const channel of handlers) ipcMain.removeHandler(channel);
      handlers.clear();
      registrations.delete(ipcMain);
    },
  });
  registrations.set(ipcMain, registration);
  return registration;
}

module.exports = Object.freeze({ registerManagerIpc });
