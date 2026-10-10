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
const { sanitizeTrayDiagnostics } = require("../tray-diagnostics.cjs");
const { boundedConfig } = require("../providers/service.cjs");

const registrations = new WeakMap();
const PROJECT_SOURCES = ["manual", "agent"];
const PROJECT_CONFIRMATIONS = ["pending", "confirmed"];
const PROJECT_LIFECYCLES = ["active", "archived"];
const SESSION_SOURCES = ["agent", "human"];
const AGENT_SESSION_STATUSES = ["active", "completed", "errored", "interrupted"];
const HUMAN_SESSION_STATUSES = ["running", "paused", "completed"];
const SUPPORTED_LANGUAGES = new Set(["en", "zh", "zh-TW", "ko", "ja"]);
const PROVIDER_APP_IDS = ["claude", "codex", "gemini", "grokbuild", "claude-desktop", "opencode", "openclaw", "hermes", "pi", "mcode", "universal"];
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
const EXPECTED_DOMAIN_ERRORS = Object.freeze({
  PRIMARY_PATH_CANNOT_BE_REMOVED: Object.freeze({
    code: "INVALID_OPERATION",
    message: "primary path cannot be removed",
  }),
  PROJECT_NOT_FOUND: Object.freeze({ code: "NOT_FOUND", message: "project not found" }),
  PROJECT_PATH_NOT_FOUND: Object.freeze({ code: "NOT_FOUND", message: "project path not found" }),
  PROJECT_PATH_CONFLICT: Object.freeze({
    code: "PROJECT_PATH_CONFLICT",
    message: "project path belongs to another project",
  }),
});

function copyDefined(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function domainError(error) {
  if (error && error.agentLogValidation === true && error.code === "INVALID_ARGUMENT"
    && typeof error.message === "string") {
    return { code: "INVALID_ARGUMENT", message: error.message };
  }
  const expected = error && EXPECTED_DOMAIN_ERRORS[error.agentLogDomain];
  if (expected) return { ...expected };
  return { code: "INTERNAL_ERROR", message: "Mobi Agent Pet operation failed" };
}

function redactedHealth(runtime) {
  const health = runtime.getHealth();
  const storage = health && ["starting", "ready", "error"].includes(health.storage)
    ? health.storage
    : "error";
  const errorMessage = health && health.errorMessage ? "Unable to open Mobi Agent Pet storage" : null;
  const tray = sanitizeTrayDiagnostics(health && health.tray);
  return {
    storage,
    databaseName: "agentlog.db",
    errorMessage,
    tray,
  };
}

function registerManagerIpc({
  ipcMain,
  fs,
  dialog,
  BrowserWindow,
  projectRepository,
  projectAssignment,
  overviewQueries,
  usageReader,
  humanTimer,
  providerService,
  providerActivation,
  providerBalanceStore,
  providerBalanceQuery,
  providerProfileTransfer,
  onProviderBalanceChange,
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
      if (!contents || (typeof contents.isDestroyed === "function" && contents.isDestroyed())) continue;
      try {
        if (typeof contents.send === "function") contents.send("agentlog:data-changed", scope);
      } catch {
        // A window can disappear after enumeration; its committed mutation still succeeds.
      }
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
        return { ok: true, value: await listener(event, input) };
      } catch (error) {
        return { ok: false, error: domainError(error) };
      }
    });
    handlers.add(channel);
  }

  try {
  if (providerService) {
    const providerAppId = (value) => optionalEnum(value, { name: "appId", values: PROVIDER_APP_IDS });
    const providerPayload = (value) => {
      const input = inputObject(value);
      boundedConfig(input);
      providerAppId(input.appId);
      return input;
    };
    handle("agentlog:providers:list", (_event, value) => providerService.list(providerAppId(inputObject(value).appId)));
    handle("agentlog:providers:get-edit-draft", (_event, value) => providerService.getEditDraft(requiredId(inputObject(value).id)));
    handle("agentlog:providers:create", (_event, value) => mutation("providers", () => providerService.create(providerPayload(value))));
    handle("agentlog:providers:update", (_event, value) => {
      const input = providerPayload(value);
      return mutation("providers", () => providerService.update(requiredId(input.id), input));
    });
    handle("agentlog:providers:remove", (_event, value) => mutation("providers", () => providerService.remove(requiredId(inputObject(value).id))));
    handle("agentlog:providers:move", (_event, value) => {
      const input = inputObject(value);
      return mutation("providers", () => providerService.move(requiredId(input.id),
        input.beforeId === null ? null : requiredId(input.beforeId)));
    });
    handle("agentlog:providers:get-editor-view", (_event, value) => providerService.getEditorView(providerAppId(inputObject(value).appId)));
    handle("agentlog:providers:fetch-models", (_event, value) => {
      const input = inputObject(value);
      return providerService.fetchModels({
        appId: providerAppId(input.appId),
        endpoint: boundedText(input.endpoint, { name: "endpoint", max: 4000, required: true }),
        apiKey: optionalText(input.apiKey, { name: "apiKey", max: 4000 }),
        allowLocal: optionalBoolean(input.allowLocal, { name: "allowLocal" }) || false,
      });
    });
    handle("agentlog:providers:check-endpoint", (_event, value) => {
      const input = inputObject(value);
      return providerService.checkEndpoint({
        appId: providerAppId(input.appId),
        endpoint: boundedText(input.endpoint, { name: "endpoint", max: 4000, required: true }),
        apiKey: optionalText(input.apiKey, { name: "apiKey", max: 4000 }),
        allowLocal: optionalBoolean(input.allowLocal, { name: "allowLocal" }) || false,
      });
    });
  }
  if (providerActivation) {
    const switchingAppId = (value) => {
      const appId = optionalEnum(value, { name: "appId", values: PROVIDER_APP_IDS });
      if (!appId || appId === "universal") throw validationError("appId is required");
      return appId;
    };
    handle("agentlog:providers:status", (_event, value) => providerActivation.status(switchingAppId(inputObject(value).appId)));
    handle("agentlog:providers:activate", async (_event, value) => {
      const id = requiredId(inputObject(value).id);
      const result = await providerActivation.activate(id);
      broadcast("providers");
      onProviderBalanceChange?.();
      if (providerBalanceQuery) void providerBalanceQuery.query(id).catch(() => {});
      return result;
    });
    handle("agentlog:providers:add-to-live", async (_event, value) => {
      const id = requiredId(inputObject(value).id);
      const result = await providerActivation.addToLive(id);
      broadcast("providers");
      onProviderBalanceChange?.();
      if (providerBalanceQuery) void providerBalanceQuery.query(id).catch(() => {});
      return result;
    });
    handle("agentlog:providers:remove-from-live", async (_event, value) => {
      const result = await providerActivation.removeFromLive(requiredId(inputObject(value).id));
      broadcast("providers");
      onProviderBalanceChange?.();
      return result;
    });
    handle("agentlog:providers:restore-original", async (_event, value) => {
      const result = await providerActivation.restoreOriginal(switchingAppId(inputObject(value).appId));
      broadcast("providers");
      onProviderBalanceChange?.();
      return result;
    });
  }
  if (providerBalanceStore && providerBalanceQuery) {
    handle("agentlog:providers:balance", (_event, value) =>
      providerBalanceStore.get(requiredId(inputObject(value).id)));
    handle("agentlog:providers:refresh-balance", (_event, value) =>
      providerBalanceQuery.query(requiredId(inputObject(value).id), { force: true }));
    handle("agentlog:providers:get-balance-rule", (_event, value) =>
      providerBalanceQuery.getRule(requiredId(inputObject(value).id)));
    handle("agentlog:providers:set-balance-rule", (_event, value) => {
      const input = inputObject(value);
      boundedConfig(input.rule);
      return mutation("providers", () => providerBalanceQuery.setRule(requiredId(input.id), input.rule));
    });
  }
  if (providerProfileTransfer) {
    handle("agentlog:providers:export", () => providerProfileTransfer.exportData());
    handle("agentlog:providers:import", (_event, value) => {
      const document = inputObject(value);
      boundedConfig(document);
      return mutation("providers", () => providerProfileTransfer.importData(document));
    });
  }
  handle("agentlog:overview:get", () => overviewQueries.getOverview());
  handle("agentlog:analytics:get", async (_event, value) => {
    const input = inputObject(value);
    const force = optionalBoolean(input.force, { name: "force" }) || false;
    const report = overviewQueries.getUsageReport(copyDefined({
      period: optionalEnum(input.period, { name: "period", values: ["day", "week"] }),
      anchor: input.anchor === undefined ? undefined : boundedInteger(input.anchor, {
        name: "anchor", min: 0, max: Number.MAX_SAFE_INTEGER,
      }),
    }));
    if (!usageReader) return report;
    try {
      const sessions = overviewQueries.listUsageSessions(report.start, report.end);
      const boundaries = Array.isArray(report.buckets) && report.buckets.length
        ? [...report.buckets.map((bucket) => bucket.start), report.buckets.at(-1).end]
        : [report.start, report.end];
      const usage = await usageReader.report(sessions, { start: report.start, end: report.end, boundaries, force });
      return { ...report, ...usage };
    } catch {
      if (typeof runtime.recordProblem === "function") runtime.recordProblem("usage-refresh");
      if (force) throw new Error("usage refresh failed");
      return report;
    }
  });
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
  handle("agentlog:sessions:usage", async (_event, value) => {
    const input = inputObject(value);
    const session = overviewQueries.getUsageSession(requiredId(input.id));
    if (!session || !usageReader) return null;
    try { return await usageReader.sessionSummary(session); }
    catch { return null; }
  });
  handle("agentlog:sessions:assign-project", (_event, value) => {
    const input = inputObject(value);
    if (!projectAssignment) throw new Error("project assignment unavailable");
    return mutation("sessions", () => projectAssignment.assign(
      requiredId(input.sessionId, "sessionId"),
      input.projectId === null ? null : requiredId(input.projectId, "projectId")
    ));
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
  handle("agentlog:host:get-language", () => {
    const language = hostBridge.invokeHostAction("getLanguage");
    return SUPPORTED_LANGUAGES.has(language) ? language : "en";
  });
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
  } catch (error) {
    for (const channel of handlers) ipcMain.removeHandler(channel);
    handlers.clear();
    throw error;
  }

  const registration = Object.freeze({
    notify(scope) {
      if (!disposed) broadcast(scope);
    },
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
