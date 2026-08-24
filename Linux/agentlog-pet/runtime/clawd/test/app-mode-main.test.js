"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");
const initUpdater = require("../src/updater");
const prefsModule = require("../src/prefs");
const { getBubblePolicy } = require("../src/bubble-policy");
const { createSettingsController } = require("../src/settings-controller");
const {
  APP_MODE,
  createAppModeController,
  resolveEffectiveBubblePolicy,
  resolveEffectiveSoundMuted,
  resolveEffectiveTrayFlashEnabled,
} = require("../src/app-mode");

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
}

function createDeferredUpdater(getSilentMode, bubbles, showUpdateBubble) {
  const prefs = new Map();
  return initUpdater({
    get doNotDisturb() { return getSilentMode(); },
    miniMode: false,
    rebuildAllMenus() {},
    updateLog() {},
    t: (key) => key,
    showUpdateBubble: showUpdateBubble || ((payload) => {
      bubbles.push(payload);
      return Promise.resolve({ action: "closed", source: "policy" });
    }),
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

function createController(snapshot = {}, overrides = {}) {
  const calls = [];
  let controller;
  const effects = {
    getSettingsSnapshot: () => snapshot,
    stopTrayFlash: () => calls.push("stopTrayFlash"),
    dismissPermissionsForDnd: () => calls.push("dismissPermissionsForDnd"),
    rememberUpdatePrompt: () => calls.push("rememberUpdatePrompt"),
    hideUpdateBubble: () => calls.push("hideUpdateBubble"),
    syncSessionHudVisibility: () => calls.push("syncSessionHudVisibility"),
    cancelRoam: () => calls.push("cancelRoam"),
    enableDoNotDisturb: () => calls.push("enableDoNotDisturb"),
    clearQuietModePermissionState: () => calls.push("clearQuietModePermissionState"),
    disableDoNotDisturb: () => calls.push("disableDoNotDisturb"),
    resolveDisplayState: () => "idle",
    getSvgOverride: () => null,
    applyState: () => calls.push("applyState"),
    notifyUpdaterSilentExit: () => calls.push("notifyUpdaterSilentExit"),
    ...overrides,
  };
  controller = createAppModeController(effects);
  return { controller, calls, effects };
}

function getEffectiveSavedSurfaces(controller, snapshot) {
  const policy = controller.getEffectiveAppModePolicy();
  return {
    soundMuted: resolveEffectiveSoundMuted(snapshot.soundMuted, policy),
    trayFlashEnabled: resolveEffectiveTrayFlashEnabled(
      snapshot.flashTaskbarOnComplete,
      policy
    ),
    permissionBubble: resolveEffectiveBubblePolicy(
      getBubblePolicy(snapshot, "permission"),
      policy.suppressPermissionBubbles
    ),
    notificationBubble: resolveEffectiveBubblePolicy(
      getBubblePolicy(snapshot, "notification"),
      policy.suppressNotificationBubbles
    ),
    updateBubble: resolveEffectiveBubblePolicy(
      getBubblePolicy(snapshot, "update"),
      policy.suppressUpdateBubbles
    ),
    sessionHudEnabled: policy.suppressSessionHud
      ? false
      : snapshot.sessionHudEnabled,
    permissionAutomationMode: policy.permissionAutomationMode,
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

describe("app mode controller lifecycle", () => {
  it("keeps launch mode state out of the preferences file", async () => {
    const prefsDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-app-mode-"));
    const prefsPath = path.join(prefsDir, "clawd-prefs.json");
    const snapshot = {
      ...prefsModule.getDefaults(),
      permissionAutomationMode: "auto-tools",
    };
    prefsModule.save(prefsPath, snapshot);
    const savedBefore = fs.readFileSync(prefsPath, "utf8");
    let settingsController;
    let restartedController;

    try {
      settingsController = createSettingsController({ prefsPath });
      const { controller } = createController(settingsController.getSnapshot());
      assert.equal(controller.getActiveAppMode(), APP_MODE.NORMAL);
      assert.equal(controller.isAutomaticModeAuthorized(), false);
      await controller.setActiveAppMode(APP_MODE.AUTOMATIC, { confirmed: true });
      await controller.setActiveAppMode(APP_MODE.NORMAL);

      const savedAfter = fs.readFileSync(prefsPath, "utf8");
      assert.equal(savedAfter, savedBefore);
      assert.equal(Object.hasOwn(JSON.parse(savedAfter), "appMode"), false);

      restartedController = createSettingsController({ prefsPath });
      const { controller: restarted } = createController(restartedController.getSnapshot());
      assert.equal(restartedController.get("permissionAutomationMode"), "auto-tools");
      assert.equal(Object.hasOwn(restartedController.getSnapshot(), "appMode"), false);
      assert.equal(restarted.getActiveAppMode(), APP_MODE.NORMAL);
      assert.equal(restarted.isAutomaticModeAuthorized(), false);
    } finally {
      if (settingsController) settingsController.dispose();
      if (restartedController) restartedController.dispose();
      fs.rmSync(prefsDir, { recursive: true, force: true });
    }
  });

  it("captures ingress tickets without changing Normal saved automation", async () => {
    const { controller } = createController({ permissionAutomationMode: "auto-tools" });
    const normalRequest = controller.capturePermissionRequest();

    await controller.setActiveAppMode(APP_MODE.AUTOMATIC, { confirmed: true });
    const automaticRequest = controller.capturePermissionRequest();

    assert.equal(
      controller.resolvePermissionAutomationMode(normalRequest, "auto-tools"),
      "auto-tools"
    );
    assert.equal(
      controller.resolvePermissionAutomationMode(automaticRequest, "auto-tools"),
      "unattended"
    );
  });

  it("applies complete quiet-mode cleanup through its production factory", async () => {
    const { controller, calls } = createController();

    await controller.setActiveAppMode(APP_MODE.AUTOMATIC, { confirmed: true });

    assert.deepStrictEqual(calls, [
      "stopTrayFlash",
      "dismissPermissionsForDnd",
      "rememberUpdatePrompt",
      "hideUpdateBubble",
      "syncSessionHudVisibility",
      "cancelRoam",
      "clearQuietModePermissionState",
      "disableDoNotDisturb",
      "applyState",
    ]);
  });

  it("restores every saved surface after Background and Automatic", async () => {
    const snapshot = {
      soundMuted: true,
      flashTaskbarOnComplete: true,
      permissionBubblesEnabled: true,
      hideBubbles: false,
      permissionBubbleAutoCloseSeconds: 6,
      notificationBubbleAutoCloseSeconds: 6,
      updateBubbleAutoCloseSeconds: 6,
      sessionHudEnabled: true,
      permissionAutomationMode: "auto-tools",
    };
    const { controller } = createController(snapshot);
    const savedEffectiveValues = {
      soundMuted: true,
      trayFlashEnabled: true,
      permissionBubble: { enabled: true, autoCloseMs: 6000 },
      notificationBubble: { enabled: true, autoCloseMs: 6000 },
      updateBubble: { enabled: true, autoCloseMs: 6000 },
      sessionHudEnabled: true,
      permissionAutomationMode: "auto-tools",
    };
    const quietEffectiveValues = {
      soundMuted: true,
      trayFlashEnabled: false,
      permissionBubble: { enabled: false, autoCloseMs: 0 },
      notificationBubble: { enabled: false, autoCloseMs: 0 },
      updateBubble: { enabled: false, autoCloseMs: 0 },
      sessionHudEnabled: false,
    };

    await controller.setActiveAppMode(APP_MODE.BACKGROUND);
    assert.deepStrictEqual(getEffectiveSavedSurfaces(controller, snapshot), {
      ...quietEffectiveValues,
      permissionAutomationMode: "off",
    });
    await controller.setActiveAppMode(APP_MODE.NORMAL);
    assert.deepStrictEqual(getEffectiveSavedSurfaces(controller, snapshot), savedEffectiveValues);

    await controller.setActiveAppMode(APP_MODE.AUTOMATIC, { confirmed: true });
    assert.deepStrictEqual(getEffectiveSavedSurfaces(controller, snapshot), {
      ...quietEffectiveValues,
      permissionAutomationMode: "unattended",
    });
    await controller.setActiveAppMode(APP_MODE.NORMAL);
    assert.deepStrictEqual(getEffectiveSavedSurfaces(controller, snapshot), savedEffectiveValues);
  });

  it("resumes a deferred update only after Automatic commits Normal", async () => {
    let controller;
    const bubbles = [];
    const updater = createDeferredUpdater(
      () => controller.getEffectiveAppModePolicy().suppressUpdateBubbles,
      bubbles
    );
    ({ controller } = createController({}, {
      notifyUpdaterSilentExit: () => updater.onSilentModeExit(),
      rememberUpdatePrompt: () => updater.onSilentModeEnter(),
    }));

    await controller.setActiveAppMode(APP_MODE.AUTOMATIC, { confirmed: true });
    await updater.handlePendingVersion("v0.9.0", { tag_name: "v0.9.0" });
    assert.equal(bubbles.length, 0, "Automatic should defer the update prompt");

    await controller.setActiveAppMode(APP_MODE.NORMAL);
    await flushAsyncWork();

    assert.equal(bubbles.length, 1, "Normal should restore the deferred update prompt");
  });

  it("resumes a deferred update only after Background commits Normal", async () => {
    let controller;
    const bubbles = [];
    const updater = createDeferredUpdater(
      () => controller.getEffectiveAppModePolicy().suppressUpdateBubbles,
      bubbles
    );
    ({ controller } = createController({}, {
      notifyUpdaterSilentExit: () => updater.onSilentModeExit(),
      rememberUpdatePrompt: () => updater.onSilentModeEnter(),
    }));

    await controller.setActiveAppMode(APP_MODE.BACKGROUND);
    await updater.handlePendingVersion("v0.9.0", { tag_name: "v0.9.0" });
    assert.equal(bubbles.length, 0, "Background should defer the update prompt");

    await controller.setActiveAppMode(APP_MODE.NORMAL);
    await flushAsyncWork();

    assert.equal(bubbles.length, 1, "Normal should restore the Background-deferred prompt");
  });

  it("restores an already-visible update prompt after a quiet-mode round trip", async () => {
    let controller;
    const bubbles = [];
    const visiblePromptResolvers = [];
    const updater = createDeferredUpdater(
      () => controller.getEffectiveAppModePolicy().suppressUpdateBubbles,
      bubbles,
      (payload) => {
        bubbles.push(payload);
        return new Promise((resolve) => { visiblePromptResolvers.push(resolve); });
      }
    );
    ({ controller } = createController({}, {
      notifyUpdaterSilentExit: () => updater.onSilentModeExit(),
      rememberUpdatePrompt: () => updater.onSilentModeEnter(),
    }));

    const visiblePrompt = updater.handlePendingVersion("v0.9.0", { tag_name: "v0.9.0" });
    await flushAsyncWork();
    assert.equal(bubbles.length, 1, "the prompt starts visible in Normal");

    await controller.setActiveAppMode(APP_MODE.AUTOMATIC, { confirmed: true });
    await controller.setActiveAppMode(APP_MODE.NORMAL);
    await flushAsyncWork();
    assert.equal(bubbles.length, 2, "Normal replays the prompt hidden by Automatic");

    for (const resolve of visiblePromptResolvers) {
      resolve({ action: "closed", source: "policy" });
    }
    await visiblePrompt;
  });

  it("does not duplicate updater resume after an actual DND exit", async () => {
    let controller;
    let updaterSilentExits = 0;
    ({ controller } = createController({}, {
      disableDoNotDisturb: () => controller.notifyUpdaterSilentExit(),
      notifyUpdaterSilentExit: () => { updaterSilentExits += 1; },
    }));

    await controller.setActiveAppMode(APP_MODE.BACKGROUND);
    await controller.setActiveAppMode(APP_MODE.NORMAL);

    assert.equal(updaterSilentExits, 1);
  });

  it("keeps deferred updater work quiet when a Normal transition rolls back", async () => {
    let controller;
    let shouldFail = false;
    const bubbles = [];
    const updater = createDeferredUpdater(
      () => controller.getEffectiveAppModePolicy().suppressUpdateBubbles,
      bubbles
    );
    ({ controller } = createController({}, {
      notifyUpdaterSilentExit: () => updater.onSilentModeExit(),
      rememberUpdatePrompt: () => updater.onSilentModeEnter(),
      applyState: () => {
        if (shouldFail) throw new Error("apply failed");
      },
    }));

    await controller.setActiveAppMode(APP_MODE.AUTOMATIC, { confirmed: true });
    await updater.handlePendingVersion("v0.9.0", { tag_name: "v0.9.0" });
    shouldFail = true;
    const failed = await controller.setActiveAppMode(APP_MODE.NORMAL);
    await flushAsyncWork();

    assert.equal(failed.status, "error");
    assert.equal(controller.getActiveAppMode(), APP_MODE.AUTOMATIC);
    assert.equal(bubbles.length, 0);

    shouldFail = false;
    await controller.setActiveAppMode(APP_MODE.NORMAL);
    await flushAsyncWork();
    assert.equal(bubbles.length, 1);
  });
});
