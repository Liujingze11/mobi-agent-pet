"use strict";

const APP_MODE = Object.freeze({
  NORMAL: "normal",
  BACKGROUND: "background",
  AUTOMATIC: "automatic",
});

const PERMISSION_AUTOMATION_MODES = new Set([
  "off",
  "auto-tools",
  "unattended",
]);

function isAppMode(value) {
  return Object.values(APP_MODE).includes(value);
}

function resolveAppModePolicy(mode, snapshot = {}) {
  const savedPermissionMode = PERMISSION_AUTOMATION_MODES.has(
    snapshot.permissionAutomationMode
  ) ? snapshot.permissionAutomationMode : "off";
  const quiet = mode === APP_MODE.BACKGROUND || mode === APP_MODE.AUTOMATIC;
  return {
    muteSound: quiet,
    suppressTrayFlash: quiet,
    suppressPermissionBubbles: quiet,
    suppressNotificationBubbles: quiet,
    suppressSessionHud: quiet,
    freezePet: mode === APP_MODE.BACKGROUND,
    hidePet: mode === APP_MODE.BACKGROUND,
    allowWorkAnimations: mode !== APP_MODE.BACKGROUND,
    allowNotificationAnimation: mode === APP_MODE.NORMAL,
    allowCompletionAnimation: mode !== APP_MODE.BACKGROUND,
    forceCompletionAnimation: mode === APP_MODE.AUTOMATIC,
    permissionAutomationMode: mode === APP_MODE.AUTOMATIC
      ? "unattended"
      : (mode === APP_MODE.BACKGROUND ? "off" : savedPermissionMode),
  };
}

function resolveEffectiveSoundMuted(savedMuted, policy = {}) {
  return savedMuted === true || policy.muteSound === true;
}

function resolveEffectiveTrayFlashEnabled(savedEnabled, policy = {}) {
  return savedEnabled === true && policy.suppressTrayFlash !== true;
}

function resolveEffectiveBubblePolicy(basePolicy, suppressed) {
  if (suppressed) return { enabled: false, autoCloseMs: 0 };
  return basePolicy;
}

function createAppModeRuntime({
  applyMode = async () => {},
  onModeCommitted = async () => {},
} = {}) {
  let mode = APP_MODE.NORMAL;
  let generation = 0;
  let automaticAuthorized = false;
  let transitionQueue = Promise.resolve();

  function isAutomaticPermissionRequestCurrent(requestContext) {
    return !!requestContext
      && requestContext.mode === APP_MODE.AUTOMATIC
      && requestContext.generation === generation
      && mode === APP_MODE.AUTOMATIC;
  }

  function resolvePermissionAutomationMode(requestContext, savedPermissionMode) {
    const savedMode = PERMISSION_AUTOMATION_MODES.has(savedPermissionMode)
      ? savedPermissionMode
      : "off";
    if (!requestContext || !isAppMode(requestContext.mode)) return "off";
    if (requestContext.mode === APP_MODE.NORMAL) return savedMode;
    return isAutomaticPermissionRequestCurrent(requestContext) ? "unattended" : "off";
  }

  async function setModeInternal(targetMode, { confirmed = false } = {}) {
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
      generation += 1;
      try {
        await onModeCommitted(targetMode, previousMode);
      } catch {
        // A post-commit observer must not roll back a completed user transition.
      }
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
  }

  return {
    capturePermissionRequest() {
      return Object.freeze({ mode, generation });
    },

    getMode() {
      return mode;
    },

    isAutomaticPermissionRequestCurrent,

    resolvePermissionAutomationMode,

    isAutomaticAuthorized() {
      return automaticAuthorized;
    },

    setMode(targetMode, options) {
      const transition = transitionQueue.then(() => setModeInternal(targetMode, options));
      transitionQueue = transition.catch(() => {});
      return transition;
    },
  };
}

function createAppModeController(options = {}) {
  const getSettingsSnapshot = options.getSettingsSnapshot || (() => ({}));
  const stopTrayFlash = options.stopTrayFlash || (() => {});
  const dismissPermissionsForDnd = options.dismissPermissionsForDnd || (() => {});
  const syncSessionHudVisibility = options.syncSessionHudVisibility || (() => {});
  const cancelRoam = options.cancelRoam || (() => {});
  const enableDoNotDisturb = options.enableDoNotDisturb || (() => {});
  const clearQuietModePermissionState = options.clearQuietModePermissionState || (() => {});
  const disableDoNotDisturb = options.disableDoNotDisturb || (() => {});
  const resolveDisplayState = options.resolveDisplayState || (() => "idle");
  const getSvgOverride = options.getSvgOverride || (() => null);
  const applyState = options.applyState || (() => {});
  const hidePet = options.hidePet || (() => {});
  const showPet = options.showPet || (() => {});
  const isPetHidden = options.isPetHidden || (() => false);
  let transitionMode = null;
  let petVisibleOnBackgroundEnter = null;

  async function applyModeTransition(mode) {
    stopTrayFlash();
    dismissPermissionsForDnd();
    syncSessionHudVisibility();
    cancelRoam();

    if (mode === APP_MODE.BACKGROUND) {
      // Background mode owns pet visibility: remember whether the user had
      // the pet visible so leaving the mode restores it only when it was
      // not manually hidden beforehand.
      petVisibleOnBackgroundEnter = !isPetHidden();
      hidePet();
      enableDoNotDisturb();
      return;
    }

    if (mode === APP_MODE.AUTOMATIC) {
      clearQuietModePermissionState();
    }
    disableDoNotDisturb();
    if (petVisibleOnBackgroundEnter === true && isPetHidden()) {
      showPet();
    }
    petVisibleOnBackgroundEnter = null;
    const resolved = resolveDisplayState();
    applyState(resolved, getSvgOverride(resolved));
  }

  const runtime = createAppModeRuntime({
    applyMode: async (targetMode, previousMode, transitionOptions) => {
      transitionMode = targetMode;
      try {
        await applyModeTransition(targetMode, previousMode, transitionOptions);
      } finally {
        transitionMode = null;
      }
    },
  });

  async function setActiveAppMode(mode, options) {
    return runtime.setMode(mode, options);
  }

  return {
    getActiveAppMode: runtime.getMode,
    isAutomaticModeAuthorized: runtime.isAutomaticAuthorized,
    getEffectiveAppModePolicy(mode = runtime.getMode()) {
      return resolveAppModePolicy(transitionMode || mode, getSettingsSnapshot());
    },
    capturePermissionRequest: runtime.capturePermissionRequest,
    isAutomaticPermissionRequestCurrent: runtime.isAutomaticPermissionRequestCurrent,
    resolvePermissionAutomationMode: runtime.resolvePermissionAutomationMode,
    setActiveAppMode,
  };
}

function createAppModePermissionBridge({
  controller,
  getSavedPermissionAutomationMode = () => "off",
} = {}) {
  if (!controller) throw new TypeError("controller is required");
  return {
    capturePermissionRequest: () => controller.capturePermissionRequest(),
    isAutomaticPermissionRequestCurrent: (requestContext) =>
      controller.isAutomaticPermissionRequestCurrent(requestContext),
    getPermissionAutomationMode: (permEntry) =>
      controller.resolvePermissionAutomationMode(
        permEntry && permEntry.appModeRequest,
        getSavedPermissionAutomationMode(),
      ),
  };
}

module.exports = {
  APP_MODE,
  isAppMode,
  resolveAppModePolicy,
  resolveEffectiveSoundMuted,
  resolveEffectiveTrayFlashEnabled,
  resolveEffectiveBubblePolicy,
  createAppModeRuntime,
  createAppModeController,
  createAppModePermissionBridge,
};
