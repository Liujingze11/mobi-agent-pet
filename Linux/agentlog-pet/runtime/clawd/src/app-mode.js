"use strict";

const APP_MODE = Object.freeze({
  NORMAL: "normal",
  BACKGROUND: "background",
  AUTOMATIC: "automatic",
});

function isAppMode(value) {
  return Object.values(APP_MODE).includes(value);
}

function resolveAppModePolicy(mode, snapshot = {}) {
  const savedPermissionMode = ["off", "auto-tools", "unattended"].includes(
    snapshot.permissionAutomationMode
  ) ? snapshot.permissionAutomationMode : "off";
  const quiet = mode === APP_MODE.BACKGROUND || mode === APP_MODE.AUTOMATIC;
  return {
    muteSound: quiet,
    suppressTrayFlash: quiet,
    suppressPermissionBubbles: quiet,
    suppressNotificationBubbles: quiet,
    suppressUpdateBubbles: quiet,
    suppressSessionHud: quiet,
    freezePet: mode === APP_MODE.BACKGROUND,
    allowWorkAnimations: mode !== APP_MODE.BACKGROUND,
    allowNotificationAnimation: mode === APP_MODE.NORMAL,
    allowCompletionAnimation: mode !== APP_MODE.BACKGROUND,
    permissionAutomationMode: mode === APP_MODE.AUTOMATIC
      ? "unattended"
      : (mode === APP_MODE.BACKGROUND ? "off" : savedPermissionMode),
  };
}

function createAppModeRuntime({ applyMode = async () => {} } = {}) {
  let mode = APP_MODE.NORMAL;
  let automaticAuthorized = false;

  return {
    getMode() {
      return mode;
    },

    isAutomaticAuthorized() {
      return automaticAuthorized;
    },

    async setMode(targetMode, { confirmed = false } = {}) {
      if (!isAppMode(targetMode)) {
        return {
          status: "error",
          mode,
          message: `Invalid app mode: ${String(targetMode)}`,
        };
      }

      if (targetMode === mode) {
        return { status: "ok", mode };
      }

      if (
        targetMode === APP_MODE.AUTOMATIC &&
        !automaticAuthorized &&
        !confirmed
      ) {
        return { status: "confirmation-required", mode };
      }

      const previousMode = mode;
      const previousAuthorization = automaticAuthorized;
      if (targetMode === APP_MODE.AUTOMATIC) {
        automaticAuthorized = true;
      }

      try {
        await applyMode(targetMode, previousMode, { rollback: false });
        mode = targetMode;
        return { status: "ok", mode };
      } catch (error) {
        mode = previousMode;
        automaticAuthorized = previousAuthorization;
        try {
          await applyMode(previousMode, targetMode, { rollback: true });
        } catch {
          // Preserve the original transition error for the caller.
        }
        return {
          status: "error",
          mode,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

module.exports = {
  APP_MODE,
  isAppMode,
  resolveAppModePolicy,
  createAppModeRuntime,
};
