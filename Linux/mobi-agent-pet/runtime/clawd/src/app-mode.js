"use strict";
const { defaultCustomModeProfile, builtInModeProfile, normalizeCustomModeProfile } = require("./custom-mode-profile");
const HIDDEN_PET_STATES = Object.freeze([]);

const APP_MODE = Object.freeze({
  NORMAL: "normal",
  BACKGROUND: "background",
  AUTOMATIC: "automatic",
  CUSTOM: "custom",
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
  const profile = mode === APP_MODE.CUSTOM ? normalizeCustomModeProfile(snapshot.customModeProfile)
    : builtInModeProfile(mode === APP_MODE.BACKGROUND || mode === APP_MODE.AUTOMATIC ? mode : APP_MODE.NORMAL);
  const states = profile.petVisible ? Object.freeze([...profile.states]) : HIDDEN_PET_STATES;
  return {
    muteSound: true,
    suppressTrayFlash: !profile.trayAlerts,
    agentBubblesEnabled: profile.agentBubbles,
    suppressPermissionBubbles: !profile.agentBubbles,
    suppressNotificationBubbles: !profile.agentBubbles,
    suppressSessionHud: !profile.sessionHud,
    freezePet: !profile.petVisible,
    hidePet: !profile.petVisible,
    allowedPetStates: states,
    allowRoamAnimation: states.includes("roam"),
    allowWorkAnimations: states.includes("working"),
    allowNotificationAnimation: states.includes("waiting"),
    allowCompletionAnimation: states.includes("complete"),
    forceCompletionAnimation: states.includes("complete"),
    permissionAutomationMode: profile.permissionAutomationMode,
    permissionBubblePolicy: {enabled: profile.agentBubbles, autoCloseMs: profile.agentBubbles ? profile.permissionSeconds * 1000 : 0},
    notificationBubblePolicy: {enabled: profile.agentBubbles, autoCloseMs: profile.agentBubbles ? profile.notificationSeconds * 1000 : 0},
    fullscreenOverlay: profile.fullscreenOverlay,
    roamIntervalMs: profile.roamIntervalSeconds * 1000,
    trayAlerts: profile.trayAlerts,
    flashIntervalMs: profile.flashIntervalMs,
    flashDurationMs: profile.flashDurationMs,
    sessionHudEnabled: profile.sessionHud,
    sessionHudShowStateLabels: profile.hudStateLabels,
    sessionHudShowContextUsage: profile.hudContext,
    sessionHudShowQuota: profile.hudQuota && (mode === APP_MODE.NORMAL || mode === APP_MODE.CUSTOM),
    keepAwakeWhileWorking: profile.keepAwake,
    keepSizeAcrossDisplays: profile.keepSizeAcrossDisplays,
  };
}

function resolveEffectiveSoundMuted(savedMuted, policy = {}) {
  return true;
}

function resolveEffectiveTrayFlashEnabled(savedEnabled, policy = {}) {
  return policy.trayAlerts === true;
}

function resolveEffectiveBubblePolicy(basePolicy, suppressed) {
  if (suppressed) return { enabled: false, autoCloseMs: 0 };
  return basePolicy;
}

function createAppModeRuntime({applyMode = async () => {}, onModeCommitted = async () => {}, getCustomModeProfile = defaultCustomModeProfile} = {}) {
  let mode = APP_MODE.NORMAL, generation = 0, transitionQueue = Promise.resolve();
  const authorized = new Set();
  let committedCustomSignature = null;
  const profile = () => normalizeCustomModeProfile(getCustomModeProfile());
  const signature = () => JSON.stringify(profile());
  const approvalFor = target => target === APP_MODE.AUTOMATIC ? "unattended" : (target === APP_MODE.CUSTOM ? profile().permissionAutomationMode : "off");
  const isAuthorized = level => level === "off" || authorized.has(level) || (level === "auto-tools" && authorized.has("unattended"));
  function isAutomaticPermissionRequestCurrent(ticket) {
    return !!ticket && ticket.mode === mode && ticket.generation === generation
      && (mode === APP_MODE.AUTOMATIC || (mode === APP_MODE.CUSTOM && ticket.customProfileSignature === signature()));
  }
  function resolvePermissionAutomationMode(ticket) {
    if (!isAutomaticPermissionRequestCurrent(ticket)) return "off";
    const level = ticket.mode === APP_MODE.AUTOMATIC ? "unattended" : ticket.permissionAutomationMode;
    return PERMISSION_AUTOMATION_MODES.has(level) && isAuthorized(level) ? level : "off";
  }
  async function setModeInternal(target, {confirmed = false, confirmationToken, force = false} = {}) {
    if (!isAppMode(target)) return {status:"error", mode, message:`Invalid app mode: ${String(target)}`};
    const level = approvalFor(target);
    const customSignature = target === APP_MODE.CUSTOM ? signature() : null;
    const changedConsent = target === APP_MODE.CUSTOM && confirmed
      && confirmationToken !== undefined && confirmationToken !== customSignature;
    if ((!isAuthorized(level) && !confirmed) || changedConsent) return {
      status:"confirmation-required", mode,
      ...(target === APP_MODE.CUSTOM ? {confirmationToken:customSignature} : {}),
    };
    if (target === mode && !force && (target !== APP_MODE.CUSTOM || committedCustomSignature === signature())) return {status:"ok", mode};
    const previous = mode, previousAuthorization = new Set(authorized);
    if (confirmed && level !== "off") authorized.add(level);
    try {
      await applyMode(target, previous, {rollback:false});
      if (target === APP_MODE.CUSTOM && customSignature !== signature()) {
        throw new Error("Custom mode configuration changed during the transition. Select the mode again.");
      }
      mode = target; generation++;
      committedCustomSignature = target === APP_MODE.CUSTOM ? signature() : null;
      try { await onModeCommitted(target, previous); } catch {}
      return {status:"ok", mode};
    } catch (error) {
      mode = previous; authorized.clear();for(const entry of previousAuthorization)authorized.add(entry);
      try { await applyMode(previous, target, {rollback:true}); } catch {}
      return {status:"error", mode, message:error instanceof Error ? error.message : String(error)};
    }
  }
  return {
    capturePermissionRequest() {return Object.freeze({mode,generation,permissionAutomationMode:approvalFor(mode),...(mode === APP_MODE.CUSTOM ? {customProfileSignature:signature()} : {})});},
    getMode:()=>mode,
    isAutomaticPermissionRequestCurrent,
    resolvePermissionAutomationMode,
    isAutomaticAuthorized:()=>authorized.has("unattended"),
    setMode(target, options) {const operation=transitionQueue.then(()=>setModeInternal(target,options));transitionQueue=operation.catch(()=>{});return operation;},
  };
}

function createAppModeController(options = {}) {
  const getSettingsSnapshot = options.getSettingsSnapshot || (() => ({}));
  const syncModeFeatures = options.syncModeFeatures || (() => {});
  const stopTrayFlash = options.stopTrayFlash || (() => {});
  const dismissPermissionsForDnd = options.dismissPermissionsForDnd || (() => {});
  const syncSessionHudVisibility = options.syncSessionHudVisibility || (() => {});
  const cancelRoam = options.cancelRoam || (() => {});
  const cancelPetHeld = options.cancelPetHeld || (() => {});
  const clearQuietModePermissionState = options.clearQuietModePermissionState || (() => {});
  const disableDoNotDisturb = options.disableDoNotDisturb || (() => {});
  const resolveDisplayState = options.resolveDisplayState || (() => "idle");
  const getSvgOverride = options.getSvgOverride || (() => null);
  const applyState = options.applyState || (() => {});
  const hidePet = options.hidePet || (() => {});
  const showPet = options.showPet || (() => {});
  const isPetHidden = options.isPetHidden || (() => false);
  let transitionMode = null;

  async function applyModeTransition(mode) {
    stopTrayFlash();
    dismissPermissionsForDnd();
    syncSessionHudVisibility();
    cancelRoam();

    const policy = resolveAppModePolicy(mode, getSettingsSnapshot());
    if (!policy.allowedPetStates.includes("held")) cancelPetHeld();
    if (policy.hidePet) hidePet();
    if (mode === APP_MODE.BACKGROUND || mode === APP_MODE.AUTOMATIC || mode === APP_MODE.CUSTOM) clearQuietModePermissionState();
    disableDoNotDisturb();
    if (policy.hidePet) {await syncModeFeatures();return;}
    if (!policy.hidePet && isPetHidden()) showPet();
    const resolved = resolveDisplayState();
    const shown = policy.allowedPetStates.includes(resolved) ? resolved : "idle";
    applyState(shown, getSvgOverride(shown));
    await syncModeFeatures();
  }

  const runtime = createAppModeRuntime({
    getCustomModeProfile: () => getSettingsSnapshot().customModeProfile,
    onModeCommitted: options.onModeCommitted,
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
    refreshCustomMode: options => runtime.getMode() === APP_MODE.CUSTOM ? runtime.setMode(APP_MODE.CUSTOM, {...options, force:true}) : Promise.resolve({status:"ok",mode:runtime.getMode()}),
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
