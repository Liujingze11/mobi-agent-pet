"use strict";

function freezeGroup(methods) {
  return Object.freeze(methods);
}

function localError(payload) {
  const error = new Error(payload.message);
  error.code = payload.code;
  error.stack = undefined;
  return error;
}

function unwrapEnvelope(envelope) {
  if (envelope && envelope.ok === true && Object.prototype.hasOwnProperty.call(envelope, "value")) {
    return envelope.value;
  }
  if (envelope && envelope.ok === false && envelope.error
    && typeof envelope.error.code === "string" && typeof envelope.error.message === "string") {
    throw localError(envelope.error);
  }
  throw localError({ code: "INTERNAL_ERROR", message: "Mobi Agent Pet operation failed" });
}

function installPreload({ contextBridge, ipcRenderer } = {}) {
  if (!contextBridge || typeof contextBridge.exposeInMainWorld !== "function") {
    throw new TypeError("contextBridge is required");
  }
  if (!ipcRenderer || typeof ipcRenderer.invoke !== "function") {
    throw new TypeError("ipcRenderer is required");
  }

  const invoke = async (channel, input) => unwrapEnvelope(input === undefined
    ? await ipcRenderer.invoke(channel)
    : await ipcRenderer.invoke(channel, input));
  const api = Object.freeze({
    providers: freezeGroup({
      list: (appId) => invoke("agentlog:providers:list", { appId }),
      getEditDraft: (id) => invoke("agentlog:providers:get-edit-draft", { id }),
      create: (input) => invoke("agentlog:providers:create", input),
      update: (input) => invoke("agentlog:providers:update", input),
      remove: (id) => invoke("agentlog:providers:remove", { id }),
      move: (id, beforeId) => invoke("agentlog:providers:move", { id, beforeId }),
      exportData: () => invoke("agentlog:providers:export"),
      importData: (document) => invoke("agentlog:providers:import", document),
      getEditorView: (appId) => invoke("agentlog:providers:get-editor-view", { appId }),
      fetchModels: (input) => invoke("agentlog:providers:fetch-models", input),
      checkEndpoint: (input) => invoke("agentlog:providers:check-endpoint", input),
      status: (appId) => invoke("agentlog:providers:status", { appId }),
      activate: (id) => invoke("agentlog:providers:activate", { id }),
      addToLive: (id) => invoke("agentlog:providers:add-to-live", { id }),
      removeFromLive: (id) => invoke("agentlog:providers:remove-from-live", { id }),
      restoreOriginal: (appId) => invoke("agentlog:providers:restore-original", { appId }),
      balance: (id) => invoke("agentlog:providers:balance", { id }),
      refreshBalance: (id) => invoke("agentlog:providers:refresh-balance", { id }),
      getBalanceRule: (id) => invoke("agentlog:providers:get-balance-rule", { id }),
      setBalanceRule: (id, rule) => invoke("agentlog:providers:set-balance-rule", { id, rule }),
    }),
    overview: freezeGroup({
      get: () => invoke("agentlog:overview:get"),
    }),
    analytics: freezeGroup({
      get: (input) => invoke("agentlog:analytics:get", input),
    }),
    projects: freezeGroup({
      list: (filters) => invoke("agentlog:projects:list", filters),
      get: (id) => invoke("agentlog:projects:get", { id }),
      pickFolder: () => invoke("agentlog:projects:pick-folder"),
      addFromFolder: (input) => invoke("agentlog:projects:add-from-folder", input),
      update: (input) => invoke("agentlog:projects:update", input),
      confirm: (input) => invoke("agentlog:projects:confirm", input),
      archive: (id) => invoke("agentlog:projects:archive", { id }),
      addPath: (input) => invoke("agentlog:projects:add-path", input),
      removePath: (input) => invoke("agentlog:projects:remove-path", input),
      rebind: (input) => invoke("agentlog:projects:rebind", input),
      merge: (input) => invoke("agentlog:projects:merge", input),
    }),
    sessions: freezeGroup({
      list: (filters) => invoke("agentlog:sessions:list", filters),
      usage: (id) => invoke("agentlog:sessions:usage", { id }),
      assignProject: (input) => invoke("agentlog:sessions:assign-project", input),
      timeline: (input) => invoke("agentlog:sessions:timeline", input),
    }),
    humanTimer: freezeGroup({
      get: () => invoke("agentlog:human-timer:get"),
      start: (projectId) => invoke("agentlog:human-timer:start", { projectId }),
      pause: () => invoke("agentlog:human-timer:pause"),
      resume: () => invoke("agentlog:human-timer:resume"),
      stop: (notes) => invoke("agentlog:human-timer:stop", { notes }),
    }),
    settings: freezeGroup({
      open: (tab) => invoke("agentlog:host:open-settings", { tab }),
    }),
    diagnostics: freezeGroup({
      get: () => invoke("agentlog:diagnostics:get"),
    }),
    localization: freezeGroup({
      getLanguage: () => invoke("agentlog:host:get-language"),
    }),
    managerWindow: freezeGroup({
      hide: () => invoke("agentlog:manager:hide"),
    }),
    events: freezeGroup({
      onChanged(callback) {
        if (typeof callback !== "function") throw new TypeError("callback must be a function");
        const listener = (_event, scope) => callback(scope);
        ipcRenderer.on("agentlog:data-changed", listener);
        return () => ipcRenderer.removeListener("agentlog:data-changed", listener);
      },
    }),
  });
  contextBridge.exposeInMainWorld("agentLog", api);
  return api;
}

if (process.type === "renderer") installPreload(require("electron"));

module.exports = Object.freeze({ installPreload, unwrapEnvelope });
