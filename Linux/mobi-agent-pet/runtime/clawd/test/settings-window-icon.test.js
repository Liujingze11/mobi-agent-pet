"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {
  WINDOWS_APP_USER_MODEL_ID,
  SETTINGS_WINDOW_LAUNCH_ARG,
  SETTINGS_WINDOW_TITLE,
  getSettingsWindowIconPath,
  getWindowsShellIconPath,
  getSettingsWindowTaskbarDetails,
  shouldOpenSettingsWindowFromArgv,
  applyWindowsAppUserModelId,
} = require("../src/settings-window-icon");

describe("settings window icon path", () => {
  it("uses the product brand icon for unpackaged Linux runs", () => {
    const appDir = "/workspace/agentlog-pet/runtime/clawd";
    const expected = path.resolve(appDir, "..", "..", "assets", "brand", "icon.png");
    assert.strictEqual(getSettingsWindowIconPath({
      platform: "linux",
      isPackaged: false,
      appDir,
      existsSync: (candidate) => candidate === expected,
    }), expected);
  });

  it("uses the copied brand icon for packaged Linux runs", () => {
    const resourcesPath = "/opt/AgentLog Pet/resources";
    const expected = path.join(resourcesPath, "icon.png");
    assert.strictEqual(getSettingsWindowIconPath({
      platform: "linux",
      isPackaged: true,
      resourcesPath,
      existsSync: (candidate) => candidate === expected,
    }), expected);
  });

  it("returns undefined on macOS", () => {
    assert.strictEqual(getSettingsWindowIconPath({ platform: "darwin" }), undefined);
  });
});

describe("windows compatibility helpers", () => {
  it("uses the same brand source for shell metadata", () => {
    const appDir = "D:\\agentlog-pet\\runtime\\clawd";
    const expected = path.resolve(appDir, "..", "..", "assets", "brand", "icon.png");
    assert.strictEqual(getWindowsShellIconPath({
      isPackaged: false,
      appDir,
      existsSync: (candidate) => candidate === expected,
    }), expected);
  });

  it("applies the product app id only on Windows", () => {
    let appId = null;
    const app = { setAppUserModelId(value) { appId = value; } };
    applyWindowsAppUserModelId(app, "win32");
    assert.strictEqual(appId, WINDOWS_APP_USER_MODEL_ID);
    appId = null;
    applyWindowsAppUserModelId(app, "linux");
    assert.strictEqual(appId, null);
  });

  it("builds taskbar metadata from the brand source", () => {
    const resourcesPath = "C:\\Program Files\\AgentLog Pet\\resources";
    const execPath = "C:\\Program Files\\AgentLog Pet\\AgentLog Pet.exe";
    const iconPath = path.join(resourcesPath, "icon.png");
    assert.deepStrictEqual(getSettingsWindowTaskbarDetails({
      platform: "win32",
      isPackaged: true,
      resourcesPath,
      execPath,
      existsSync: (candidate) => candidate === iconPath,
    }), {
      appId: WINDOWS_APP_USER_MODEL_ID,
      appIconPath: iconPath,
      appIconIndex: 0,
      relaunchCommand: `"${execPath}" "${SETTINGS_WINDOW_LAUNCH_ARG}"`,
      relaunchDisplayName: SETTINGS_WINDOW_TITLE,
    });
  });

  it("returns null taskbar metadata outside Windows", () => {
    assert.strictEqual(getSettingsWindowTaskbarDetails({ platform: "linux" }), null);
  });
});

describe("settings window launch arg", () => {
  it("detects the settings window launch arg in argv", () => {
    assert.strictEqual(shouldOpenSettingsWindowFromArgv(["electron", ".", SETTINGS_WINDOW_LAUNCH_ARG]), true);
  });

  it("ignores argv that do not request the settings window", () => {
    assert.strictEqual(shouldOpenSettingsWindowFromArgv(["electron", "."]), false);
    assert.strictEqual(shouldOpenSettingsWindowFromArgv(null), false);
  });
});
