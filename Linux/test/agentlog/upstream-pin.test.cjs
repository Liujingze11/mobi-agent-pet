"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(root, "runtime", "clawd");

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
});
