"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const {
  APP_MODE,
  resolveEffectiveSoundMuted,
  resolveEffectiveTrayFlashEnabled,
  resolveEffectiveBubblePolicy,
} = require("../src/app-mode");

const MAIN_JS = path.join(__dirname, "..", "src", "main.js");

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
});
