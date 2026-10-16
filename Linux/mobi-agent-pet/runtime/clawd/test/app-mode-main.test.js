"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { describe, it } = require("node:test");
const prefsModule = require("../src/prefs");
const { getBubblePolicy } = require("../src/bubble-policy");
const { createSettingsController } = require("../src/settings-controller");
const {
  APP_MODE,
  createAppModeController,
  resolveAppModePolicy,
  resolveEffectiveBubblePolicy,
  resolveEffectiveSoundMuted,
  resolveEffectiveTrayFlashEnabled,
} = require("../src/app-mode");
const { defaultCustomModeProfile } = require("../src/custom-mode-profile");
const { evaluateBaseEligible } = require("../src/session-hud").__test;

it("quota-only Custom mode survives the main HUD projection while quiet presets stay hidden", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const getter = source.match(/get sessionHudShowQuota\(\) \{([\s\S]*?)\n  \},/);
  assert.ok(getter);
  const snapshot = { sessions: [], accountQuota: [{ host: "fixture", claudeQuota: {
    group: { claudeWeekly: { usedPercent: 41, resetAt: Date.now() + 3600000 } }, updatedAt: Date.now(),
  } }] };
  for (const [mode, cards, quota, want] of [
    ["custom", false, true, true], ["custom", true, false, false],
    ["custom", false, false, false], ["normal", false, false, true],
    ["automatic", true, true, false], ["background", true, true, false],
  ]) {
    const policy = resolveAppModePolicy(mode, { customModeProfile: {
      ...defaultCustomModeProfile(), sessionHud: cards, hudQuota: quota,
    } });
    const projected = vm.runInNewContext(`({get sessionHudShowQuota() {${getter[1]}}})`, {
      getEffectiveAppModePolicy: () => policy, sessionHudShowQuota: policy.sessionHudShowQuota,
    });
    assert.equal(evaluateBaseEligible({ snapshot, sessionHudEnabled: policy.sessionHudEnabled,
      showQuota: projected.sessionHudShowQuota }), want, `${mode}: cards=${cards}, quota=${quota}`);
  }
});

function createController(snapshot = {}, overrides = {}) {
  const calls = [];
  let controller;
  const effects = {
    getSettingsSnapshot: () => snapshot,
    stopTrayFlash: () => calls.push("stopTrayFlash"),
    dismissPermissionsForDnd: () => calls.push("dismissPermissionsForDnd"),
    syncSessionHudVisibility: () => calls.push("syncSessionHudVisibility"),
    cancelRoam: () => calls.push("cancelRoam"),
    enableDoNotDisturb: () => calls.push("enableDoNotDisturb"),
    clearQuietModePermissionState: () => calls.push("clearQuietModePermissionState"),
    disableDoNotDisturb: () => calls.push("disableDoNotDisturb"),
    resolveDisplayState: () => "idle",
    getSvgOverride: () => null,
    applyState: () => calls.push("applyState"),
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
    permissionBubble: policy.permissionBubblePolicy,
    notificationBubble: policy.notificationBubblePolicy,
    sessionHudEnabled: policy.sessionHudEnabled,
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

    assert.equal(resolveEffectiveSoundMuted(false, { muteSound: false }), true);
    assert.equal(resolveEffectiveTrayFlashEnabled(false, { trayAlerts: true }), true);
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
      "off"
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
      sessionHudEnabled: true,
      permissionAutomationMode: "auto-tools",
    };
    const { controller } = createController(snapshot);
    const savedEffectiveValues = {
      soundMuted: true,
      trayFlashEnabled: true,
      permissionBubble: { enabled: true, autoCloseMs: 0 },
      notificationBubble: { enabled: true, autoCloseMs: 6000 },
      sessionHudEnabled: true,
      permissionAutomationMode: "off",
    };
    const quietEffectiveValues = {
      soundMuted: true,
      trayFlashEnabled: true,
      permissionBubble: { enabled: false, autoCloseMs: 0 },
      notificationBubble: { enabled: false, autoCloseMs: 0 },
      sessionHudEnabled: false,
    };

    await controller.setActiveAppMode(APP_MODE.BACKGROUND);
    assert.deepStrictEqual(getEffectiveSavedSurfaces(controller, snapshot), {
      ...savedEffectiveValues,
      sessionHudEnabled: false,
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

});
