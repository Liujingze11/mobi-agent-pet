"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { describe, it } = require("node:test");
const initUpdater = require("../src/updater");
const {
  APP_MODE,
  createAppModeRuntime,
  resolveEffectiveSoundMuted,
  resolveEffectiveTrayFlashEnabled,
  resolveEffectiveBubblePolicy,
  resolveAppModePolicy,
} = require("../src/app-mode");

const MAIN_JS = path.join(__dirname, "..", "src", "main.js");

function loadApplyAppModeTransition(deps) {
  const source = fs.readFileSync(MAIN_JS, "utf8");
  const start = source.indexOf("async function applyAppModeTransition(");
  const end = source.indexOf("\n}\n\nconst _appModeRuntime", start) + 2;
  assert.ok(start >= 0 && end > start, "main should expose the app mode transition implementation");
  return vm.runInNewContext(
    `${source.slice(start, end)}; applyAppModeTransition`,
    { APP_MODE, _appModeTransitionMode: null, ...deps },
  );
}

function loadMainAppModeRuntime(deps) {
  const source = fs.readFileSync(MAIN_JS, "utf8");
  const start = source.indexOf("let _appModeTransitionMode = null;");
  const end = source.indexOf("\nlet _remoteSshInstallationIdentity", start);
  assert.ok(start >= 0 && end > start, "main should expose the app mode runtime wiring");
  return vm.runInNewContext(
    `${source.slice(start, end)}; ({ getActiveAppMode, getEffectiveAppModePolicy, setActiveAppMode })`,
    { APP_MODE, createAppModeRuntime, resolveAppModePolicy, ...deps },
  );
}

function loadPermissionAutomationModeReader(deps) {
  const source = fs.readFileSync(MAIN_JS, "utf8");
  const match = source.match(/getPermissionAutomationMode: \(\) =>\s*([^,]+),/);
  assert.ok(match, "main should provide a permission automation reader");
  return vm.runInNewContext(`() => (${match[1]})`, deps);
}

function createDeferredUpdater(mode, bubbles) {
  const prefs = new Map();
  return initUpdater({
    get doNotDisturb() { return mode.current === APP_MODE.AUTOMATIC; },
    miniMode: false,
    rebuildAllMenus() {},
    updateLog() {},
    t: (key) => key,
    showUpdateBubble: (payload) => {
      bubbles.push(payload);
      return Promise.resolve({ action: "closed", source: "policy" });
    },
    hideUpdateBubble() {},
    setUpdateVisualState() {},
    applyState() {},
    resolveDisplayState: () => "idle",
    getUpdatePref: (key) => prefs.get(key),
    setUpdatePref: (key, value) => prefs.set(key, value),
  }, {
    app: { isPackaged: true, getVersion: () => "0.5.0", relaunch() {}, exit() {} },
    dialog: { showMessageBox: async () => ({ response: 1 }) },
    shell: { openExternal() {} },
    Notification: class { show() {} },
    autoUpdaterFactory: () => ({
      autoDownload: false,
      autoInstallOnAppQuit: true,
      on() {},
      checkForUpdates: async () => null,
      quitAndInstall() {},
      downloadUpdate() {},
    }),
  });
}

function makeTransitionDeps(overrides = {}) {
  return {
    doNotDisturb: false,
    stopTrayFlash() {},
    _perm: { dismissPermissionsForDnd() {} },
    hideUpdateBubble() {},
    syncSessionHudVisibility() {},
    _roam: { cancelRoam() {} },
    _state: {
      enableDoNotDisturb() {},
      disableDoNotDisturb() {},
      resolveDisplayState: () => "idle",
      getSvgOverride: () => null,
      applyState() {},
    },
    ...overrides,
  };
}

describe("effective app mode boundaries", () => {
  it("applies quiet overrides without changing Normal Mode saved values", () => {
    assert.equal(resolveEffectiveSoundMuted(false, { muteSound: true }), true);
    assert.equal(resolveEffectiveTrayFlashEnabled(true, { suppressTrayFlash: true }), false);
    assert.deepStrictEqual(
      resolveEffectiveBubblePolicy({ enabled: true, autoCloseMs: 6000 }, true),
      { enabled: false, autoCloseMs: 0 }
    );

    assert.equal(resolveEffectiveSoundMuted(false, { muteSound: false }), false);
    assert.equal(resolveEffectiveTrayFlashEnabled(true, { suppressTrayFlash: false }), true);
    assert.deepStrictEqual(
      resolveEffectiveBubblePolicy({ enabled: true, autoCloseMs: 6000 }, false),
      { enabled: true, autoCloseMs: 6000 }
    );
  });
});

describe("main app mode runtime wiring", () => {
  const mainSource = fs.readFileSync(MAIN_JS, "utf8");

  it("owns an in-memory runtime mode source and leaves preferences untouched", () => {
    assert.ok(mainSource.includes('require("./app-mode")'));
    assert.match(mainSource, /const _appModeRuntime = createAppModeRuntime\(/);
    assert.match(mainSource, /function getActiveAppMode\(\) \{\s*return _appModeRuntime\.getMode\(\);\s*\}/);
    assert.match(mainSource, /function getEffectiveAppModePolicy\(mode = _appModeRuntime\.getMode\(\)\) \{\s*return resolveAppModePolicy\(_appModeTransitionMode \|\| mode, _settingsController\.getSnapshot\(\)\);\s*\}/);
    assert.match(mainSource, /async function setActiveAppMode\(mode, options\) \{\s*return _appModeRuntime\.setMode\(mode, options\);\s*\}/);
    assert.doesNotMatch(mainSource, /applyUpdate\(\s*["']appMode["']/);
    assert.doesNotMatch(mainSource, /appMode\s*:/);
  });

  it("keeps Automatic permission automation runtime-only while returning to Normal", async () => {
    const snapshot = { permissionAutomationMode: "auto-tools" };
    const applyCommandCalls = [];
    const runtime = loadMainAppModeRuntime({
      doNotDisturb: false,
      stopTrayFlash() {},
      _perm: { dismissPermissionsForDnd() {} },
      hideUpdateBubble() {},
      notifyUpdaterSilentExit() {},
      syncSessionHudVisibility() {},
      _roam: { cancelRoam() {} },
      _state: {
        clearQuietModePermissionState() {},
        enableDoNotDisturb() {},
        disableDoNotDisturb() {},
        resolveDisplayState: () => "idle",
        getSvgOverride: () => null,
        applyState() {},
      },
      _settingsController: {
        getSnapshot: () => snapshot,
        applyCommand: (...args) => applyCommandCalls.push(args),
      },
    });
    const getPermissionAutomationMode = loadPermissionAutomationModeReader({
      getEffectiveAppModePolicy: runtime.getEffectiveAppModePolicy,
      _settingsController: {
        get: (key) => snapshot[key],
      },
    });

    assert.equal(getPermissionAutomationMode(), "auto-tools");
    assert.deepEqual(
      await runtime.setActiveAppMode(APP_MODE.AUTOMATIC, { confirmed: true }),
      { status: "ok", mode: APP_MODE.AUTOMATIC }
    );
    assert.equal(getPermissionAutomationMode(), "unattended");
    assert.deepEqual(
      await runtime.setActiveAppMode(APP_MODE.NORMAL),
      { status: "ok", mode: APP_MODE.NORMAL }
    );
    assert.equal(getPermissionAutomationMode(), "auto-tools");
    assert.deepEqual(snapshot, { permissionAutomationMode: "auto-tools" });
    assert.deepEqual(applyCommandCalls, []);
  });

  it("gates quiet surfaces and restores mode effects in the required order", () => {
    assert.ok(mainSource.includes("resolveEffectiveSoundMuted(soundMuted, getEffectiveAppModePolicy())"));
    assert.ok(mainSource.includes("resolveEffectiveTrayFlashEnabled(_settingsController.get(\"flashTaskbarOnComplete\"), getEffectiveAppModePolicy())"));
    assert.ok(mainSource.includes("isModeMovementAllowed: () => !getEffectiveAppModePolicy().freezePet"));
    assert.ok(mainSource.includes("allowNotificationAnimation: () => getEffectiveAppModePolicy().allowNotificationAnimation"));

    const transitionStart = mainSource.indexOf("async function applyAppModeTransition(");
    assert.ok(transitionStart >= 0, "main should define the runtime transition effects");
    const transition = mainSource.slice(transitionStart, mainSource.indexOf("\n}\n", transitionStart) + 2);
    const effects = [
      "stopTrayFlash()",
      "_perm.dismissPermissionsForDnd()",
      "hideUpdateBubble()",
      "syncSessionHudVisibility()",
      "_roam.cancelRoam()",
    ];
    let previousIndex = -1;
    for (const effect of effects) {
      const index = transition.indexOf(effect);
      assert.ok(index > previousIndex, `${effect} should follow the quiet-surface cleanup order`);
      previousIndex = index;
    }
    assert.ok(transition.includes("APP_MODE.BACKGROUND"));
    assert.ok(transition.includes("enableDoNotDisturb()"));
    assert.ok(transition.includes("disableDoNotDisturb()"));
    assert.ok(transition.includes("_state.resolveDisplayState()"));
  });

  it("evaluates quiet-surface cleanup against the transition target mode", () => {
    assert.match(mainSource, /let _appModeTransitionMode = null;/);
    assert.match(mainSource, /resolveAppModePolicy\(_appModeTransitionMode \|\| mode, _settingsController\.getSnapshot\(\)\)/);
    assert.match(mainSource, /_appModeTransitionMode = mode;/);
    assert.match(mainSource, /finally \{\s*_appModeTransitionMode = null;\s*\}/);
  });

  it("clears Kimi permission runtime state during the Automatic transition", async () => {
    let kimiPermissionStateClears = 0;
    const deps = makeTransitionDeps();
    deps._state.clearQuietModePermissionState = () => { kimiPermissionStateClears += 1; };

    const applyAppModeTransition = loadApplyAppModeTransition(deps);
    await applyAppModeTransition(APP_MODE.AUTOMATIC);

    assert.equal(kimiPermissionStateClears, 1);
  });

  it("restores an updater prompt deferred in Automatic when the Normal transition finishes", async () => {
    const mode = { current: APP_MODE.AUTOMATIC };
    const bubbles = [];
    const updater = createDeferredUpdater(mode, bubbles);
    await updater.handlePendingVersion("v0.9.0", { tag_name: "v0.9.0" });
    assert.equal(bubbles.length, 0, "Automatic should defer the update prompt");

    mode.current = APP_MODE.NORMAL;
    const applyAppModeTransition = loadApplyAppModeTransition(makeTransitionDeps({
      notifyUpdaterSilentExit: () => updater.onSilentModeExit(),
    }));
    await applyAppModeTransition(APP_MODE.NORMAL);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(bubbles.length, 1, "Normal should restore the deferred update prompt");
  });

  it("does not duplicate the updater resume after an actual DND exit", async () => {
    let updaterSilentExits = 0;
    const deps = makeTransitionDeps({
      doNotDisturb: true,
      notifyUpdaterSilentExit: () => { updaterSilentExits += 1; },
    });
    deps._state.disableDoNotDisturb = () => { updaterSilentExits += 1; };

    const applyAppModeTransition = loadApplyAppModeTransition(deps);
    await applyAppModeTransition(APP_MODE.NORMAL);

    assert.equal(updaterSilentExits, 1);
  });
});
