"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const snapshotListeners = new Set();
const langListeners = new Set();
const pageListeners = new Set();
const animationSettingsListeners = new Set();
const animationPosterListeners = new Set();

ipcRenderer.on("dashboard:session-snapshot", (_event, snapshot) => {
  for (const cb of snapshotListeners) {
    try { cb(snapshot); } catch (err) { console.warn("dashboard snapshot listener threw:", err); }
  }
});

ipcRenderer.on("dashboard:lang-change", (_event, payload) => {
  for (const cb of langListeners) {
    try { cb(payload); } catch (err) { console.warn("dashboard lang listener threw:", err); }
  }
});

ipcRenderer.on("dashboard:select-page", (_event, page) => {
  for (const cb of pageListeners) {
    try { cb(page); } catch (err) { console.warn("dashboard page listener threw:", err); }
  }
});

ipcRenderer.on("settings-changed", (_event, payload) => {
  for (const cb of animationSettingsListeners) {
    try { cb(payload); } catch (err) { console.warn("dashboard animation settings listener threw:", err); }
  }
});

ipcRenderer.on("settings:animation-preview-poster-ready", (_event, payload) => {
  for (const cb of animationPosterListeners) {
    try { cb(payload); } catch (err) { console.warn("dashboard animation poster listener threw:", err); }
  }
});

contextBridge.exposeInMainWorld("dashboardAPI", {
  getSnapshot: () => ipcRenderer.invoke("dashboard:get-snapshot"),
  getPetScene: () => ipcRenderer.invoke("dashboard:get-pet-scene"),
  getI18n: () => ipcRenderer.invoke("dashboard:get-i18n"),
  focusSession: (sessionId) => ipcRenderer.invoke("dashboard:focus-session", sessionId),
  hideSession: (sessionId) => ipcRenderer.invoke("dashboard:hide-session", sessionId),
  openSessionFolder: (sessionId) => ipcRenderer.invoke("dashboard:open-session-folder", sessionId),
  setSessionAlias: (payload) => ipcRenderer.invoke("dashboard:set-session-alias", payload),
  ackCompletion: (sessionId) => ipcRenderer.invoke("session:ack-completion", sessionId),
  onSessionSnapshot: (cb) => {
    if (typeof cb !== "function") return () => {};
    snapshotListeners.add(cb);
    return () => snapshotListeners.delete(cb);
  },
  onLangChange: (cb) => {
    if (typeof cb !== "function") return () => {};
    langListeners.add(cb);
    return () => langListeners.delete(cb);
  },
  onSelectPage: (cb) => {
    if (typeof cb !== "function") return () => {};
    pageListeners.add(cb);
    return () => pageListeners.delete(cb);
  },
});

// The pet's Theme page reuses the existing Settings theme controller. Keep
// this bridge limited to theme operations rather than exposing all Settings.
contextBridge.exposeInMainWorld("petThemeAPI", {
  getSnapshot: () => ipcRenderer.invoke("settings:get-snapshot"),
  getPetTintOptions: () => ipcRenderer.invoke("settings:get-pet-tint-options"),
  getPetAccessoryOptions: () => ipcRenderer.invoke("settings:get-pet-accessory-options"),
  listThemes: () => ipcRenderer.invoke("settings:list-themes"),
  update: (key, value) => ["petTint", "petAccessory"].includes(key)
    ? ipcRenderer.invoke("settings:update", { key, value })
    : Promise.resolve({ status: "error", message: "unsupported theme preference" }),
  command: (action, payload) => ["setThemeSelection", "removeTheme"].includes(action)
    ? ipcRenderer.invoke("settings:command", { action, payload })
    : Promise.resolve({ status: "error", message: "unsupported theme command" }),
  openUserThemesDir: () => ipcRenderer.invoke("settings:open-user-themes-dir"),
  importUserThemeZip: () => ipcRenderer.invoke("settings:import-user-theme-zip"),
  refreshCodexPets: () => ipcRenderer.invoke("settings:refresh-codex-pets"),
  importCodexPetZip: () => ipcRenderer.invoke("settings:import-codex-pet-zip"),
  removeCodexPet: (themeId) => ipcRenderer.invoke("settings:remove-codex-pet", themeId),
  confirmRemoveTheme: (themeId) => ipcRenderer.invoke("settings:confirm-remove-theme", themeId),
});

const ANIMATION_COMMANDS = new Set([
  "setThemeOverrideDisabled", "resetThemeOverrides", "setAnimationOverride",
  "setIdleVisual", "setSoundOverride", "setWideHitboxOverride", "setPetActionPlan",
]);

contextBridge.exposeInMainWorld("settingsAPI", {
  getSnapshot: () => ipcRenderer.invoke("settings:get-snapshot"),
  getAnimationOverridesData: () => ipcRenderer.invoke("settings:get-animation-overrides-data"),
  listThemes: () => ipcRenderer.invoke("settings:list-themes"),
  command: (action, payload) => ANIMATION_COMMANDS.has(action)
    ? ipcRenderer.invoke("settings:command", { action, payload })
    : Promise.resolve({ status: "error", message: "unsupported animation command" }),
  openThemeAssetsDir: () => ipcRenderer.invoke("settings:open-theme-assets-dir"),
  previewAnimationOverride: (payload) => ipcRenderer.invoke("settings:preview-animation-override", payload),
  previewReaction: (payload) => ipcRenderer.invoke("settings:preview-reaction", payload),
  pickSoundFile: (payload) => ipcRenderer.invoke("settings:pick-sound-file", payload),
  previewSound: (payload) => ipcRenderer.invoke("settings:preview-sound", payload),
  openSoundOverridesDir: () => ipcRenderer.invoke("settings:open-sound-overrides-dir"),
  exportAnimationOverrides: () => ipcRenderer.invoke("settings:export-animation-overrides"),
  importAnimationOverrides: () => ipcRenderer.invoke("settings:import-animation-overrides"),
  onChanged: (cb) => {
    if (typeof cb !== "function") return () => {};
    animationSettingsListeners.add(cb);
    return () => animationSettingsListeners.delete(cb);
  },
  onAnimationPreviewPosterReady: (cb) => {
    if (typeof cb !== "function") return () => {};
    animationPosterListeners.add(cb);
    return () => animationPosterListeners.delete(cb);
  },
});
