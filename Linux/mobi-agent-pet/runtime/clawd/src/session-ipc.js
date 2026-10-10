"use strict";

const { classifyConversationJumpResult } = require("./conversation-jump-result");

function requiredDependency(value, name) {
  if (!value) throw new Error(`registerSessionIpc requires ${name}`);
  return value;
}

function registerSessionIpc(options = {}) {
  const ipcMain = requiredDependency(options.ipcMain, "ipcMain");
  const getSessionSnapshot = requiredDependency(options.getSessionSnapshot, "getSessionSnapshot");
  const getPetScene = requiredDependency(options.getPetScene, "getPetScene");
  const getI18n = requiredDependency(options.getI18n, "getI18n");
  const focusSession = requiredDependency(options.focusSession, "focusSession");
  const onConversationJumpResult = typeof options.onConversationJumpResult === "function"
    ? options.onConversationJumpResult : null;
  const hideSession = requiredDependency(options.hideSession, "hideSession");
  const setSessionAlias = requiredDependency(options.setSessionAlias, "setSessionAlias");
  const showDashboard = requiredDependency(options.showDashboard, "showDashboard");
  const setSessionHudPinned = requiredDependency(options.setSessionHudPinned, "setSessionHudPinned");
  const ackSessionCompletion = requiredDependency(options.ackSessionCompletion, "ackSessionCompletion");
  const openSessionFolder = requiredDependency(options.openSessionFolder, "openSessionFolder");
  const getPetBehaviorSettings = requiredDependency(options.getPetBehaviorSettings, "getPetBehaviorSettings");
  const updatePetBehaviorSetting = requiredDependency(options.updatePetBehaviorSetting, "updatePetBehaviorSetting");
  const disposers = [];

  function handle(channel, listener) {
    ipcMain.handle(channel, listener);
    disposers.push(() => ipcMain.removeHandler(channel));
  }

  function on(channel, listener) {
    ipcMain.on(channel, listener);
    disposers.push(() => ipcMain.removeListener(channel, listener));
  }

  handle("dashboard:get-snapshot", () => getSessionSnapshot());
  handle("dashboard:get-pet-scene", () => getPetScene());
  handle("dashboard:get-pet-behavior", () => getPetBehaviorSettings());
  handle("dashboard:update-pet-behavior", () => ({status:"error", message:"Mode behavior is fixed; use Edit Custom Mode"}));
  handle("dashboard:edit-custom-mode", () => options.openCustomModeEditor?.() || {status:"error", message:"Custom mode editor unavailable"});
  handle("dashboard:get-i18n", () => getI18n());
  handle("dashboard:focus-session", async (_event, sessionId) => {
    if (typeof sessionId !== "string" || !sessionId) return { status: "failed" };
    try {
      const result = await focusSession(sessionId, { requestSource: "dashboard" });
      const feedback = { status: classifyConversationJumpResult(result) };
      if (onConversationJumpResult) onConversationJumpResult(feedback);
      return feedback;
    } catch {
      const feedback = { status: "failed" };
      if (onConversationJumpResult) onConversationJumpResult(feedback);
      return feedback;
    }
  });
  handle("dashboard:hide-session", (_event, sessionId) => hideSession(sessionId));
  handle("dashboard:open-session-folder", (_event, sessionId) => {
    if (typeof sessionId !== "string" || !sessionId) {
      return { status: "error", message: "dashboard:open-session-folder requires a sessionId string" };
    }
    return openSessionFolder(sessionId);
  });
  handle("dashboard:set-session-alias", (_event, payload) => setSessionAlias(payload));

  handle("session-hud:get-i18n", () => getI18n());
  handle("session-hud:open-session-folder", (_event, sessionId) => {
    if (typeof sessionId !== "string" || !sessionId) {
      return { status: "error", message: "session-hud:open-session-folder requires a sessionId string" };
    }
    return openSessionFolder(sessionId);
  });
  on("session-hud:focus-session", (_event, sessionId) =>
    focusSession(sessionId, { requestSource: "hud" })
  );
  on("session-hud:open-dashboard", () => showDashboard({ source: "hud" }));
  on("session-hud:set-pinned", (_event, value) => setSessionHudPinned(!!value));

  on("settings:open-dashboard", (_event, page) => showDashboard({
    source: "settings",
    ...(page === "theme" ? { page: "theme" } : {}),
  }));
  on("show-dashboard", () => showDashboard());

  // Both HUD and Dashboard call into this — invoke/handle (not send) so the
  // click handlers can re-enable the Mark-read button if the ack failed.
  handle("session:ack-completion", (_event, sessionId) => {
    if (typeof sessionId !== "string" || !sessionId) {
      return { status: "error", message: "session:ack-completion requires a sessionId string" };
    }
    try {
      const acked = ackSessionCompletion(sessionId);
      if (!acked) return { status: "noop", reason: "not-pending-or-missing" };
      return { status: "ok" };
    } catch (err) {
      return { status: "error", message: err && err.message };
    }
  });

  return {
    dispose() {
      while (disposers.length) {
        const dispose = disposers.pop();
        dispose();
      }
    },
  };
}

module.exports = {
  registerSessionIpc,
};
