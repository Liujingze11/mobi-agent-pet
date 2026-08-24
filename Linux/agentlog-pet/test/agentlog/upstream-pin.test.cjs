"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(root, "runtime", "clawd");
const AGENTLOG_PATCHED_UPSTREAM_FILES = [
  "README.ja-JP.md",
  "README.ko-KR.md",
  "README.md",
  "README.zh-CN.md",
  "README.zh-TW.md",
  "package.json",
  "pwa/icons/icon-256.png",
  "pwa/icons/icon-512.png",
  "scripts/audit-repository-assets.js",
  "src/app-mode.js",
  "src/discord-presence-rpc.js",
  "src/i18n.js",
  "src/index.html",
  "src/login-item.js",
  "src/main.js",
  "src/menu.js",
  "src/prefs.js",
  "src/preload-settings.js",
  "src/roam.js",
  "src/settings-i18n.js",
  "src/settings-ipc.js",
  "src/settings-renderer.js",
  "src/settings-tab-about.js",
  "src/settings-window-icon.js",
  "src/settings-window.js",
  "src/settings.css",
  "src/settings.html",
  "src/state.js",
  "src/tray-flash-icon.js",
  "src/tutorial-renderer.js",
  "src/tutorial.js",
  "test/agents.test.js",
  "test/app-mode-main.test.js",
  "test/app-mode.test.js",
  "test/doctor-modal-no-active-integrations.test.js",
  "test/discord-presence-rpc.test.js",
  "test/i18n.test.js",
  "test/menu-display.test.js",
  "test/menu-hide-pet.test.js",
  "test/package-build-config.test.js",
  "test/permission-auto-approve.test.js",
  "test/readme-contributors.test.js",
  "test/roam.test.js",
  "test/server-route-permission.test.js",
  "test/settings-ipc.test.js",
  "test/settings-renderer-browser-env.test.js",
  "test/settings-window-icon.test.js",
  "test/settings-window.test.js",
  "test/state.test.js",
  "test/telegram-direct-send.test.js",
  "test/tray-flash-icon.test.js",
  "test/tutorial-hero-asset.test.js",
  "test/tutorial-renderer-agent-icons.test.js",
  "test/tutorial.test.js",
];

test("the complete Clawd runtime is pinned to the approved commit", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(runtimeRoot, "AGENTLOG_UPSTREAM.json"), "utf8")
  );
  const upstreamPackage = JSON.parse(
    fs.readFileSync(path.join(runtimeRoot, "package.json"), "utf8")
  );

  assert.equal(
    manifest.upstreamCommit,
    "45d388aa661824443cd96779ff0a5d277972bd10"
  );
  assert.equal(manifest.upstreamRepository, "https://github.com/rullerzhou-afk/clawd-on-desk.git");
  assert.equal(upstreamPackage.version, "0.13.0");
  assert.deepEqual(manifest.agentLogPatchedFiles, AGENTLOG_PATCHED_UPSTREAM_FILES);

  for (const relativePath of [
    "src/main.js",
    "src/state.js",
    "src/permission.js",
    "src/server.js",
    "agents/claude-code.js",
    "agents/codex.js",
    "agents/codex-log-monitor.js",
    "hooks/clawd-hook.js",
    "hooks/codex-install.js",
    "themes/clawd/theme.json",
    "test/run-tests.js",
  ]) {
    assert.equal(
      fs.existsSync(path.join(runtimeRoot, relativePath)),
      true,
      `missing pinned runtime file: ${relativePath}`
    );
  }

  for (const relativePath of manifest.agentLogPatchedFiles) {
    assert.equal(
      fs.existsSync(path.join(runtimeRoot, relativePath)),
      true,
      `missing AgentLog-patched upstream file: ${relativePath}`
    );
  }
});
