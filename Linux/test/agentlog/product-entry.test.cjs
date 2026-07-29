"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const productMain = fs.readFileSync(path.join(root, "runtime/agentlog/main.cjs"), "utf8");
const upstreamMain = fs.readFileSync(path.join(root, "runtime/clawd/src/main.js"), "utf8");

test("root package exposes one AgentLog Pet Electron application", () => {
  assert.equal(pkg.name, "agentlog-pet");
  assert.equal(pkg.productName, "AgentLog Pet");
  assert.equal(pkg.main, "runtime/agentlog/main.cjs");
  assert.equal(pkg.engines.node, ">=22.12.0");
  assert.equal(pkg.build.appId, "com.agentlog.pet");
  assert.equal(pkg.build.productName, "AgentLog Pet");
  assert.deepEqual(pkg.build.linux.target, [
    { target: "AppImage", arch: ["x64"] },
    { target: "deb", arch: ["x64"] },
  ]);
  assert.equal(
    pkg.build.publish[0].repo,
    "agentlog-pet"
  );
  assert.equal(pkg.dependencies["better-sqlite3"], undefined);
  assert.equal(fs.existsSync(path.join(root, "electron-builder.yml")), false);
});

test("legacy DevPulse main remains source-only and is not packaged as an entry", () => {
  assert.notEqual(pkg.main, "dist-electron/main.js");
  assert.equal(pkg.build.files.includes("dist-electron/**/*"), false);
});

test("the product wrapper delegates lifecycle ownership to one pinned runtime", () => {
  assert.ok(productMain.indexOf("app.setName") < productMain.indexOf("../clawd/src/main.js"));
  assert.doesNotMatch(productMain, /\bnew Tray\b|\bnew BrowserWindow\b/);
  assert.equal(
    (upstreamMain.match(/app\.requestSingleInstanceLock\(\)/g) || []).length,
    1
  );
});

test("postinstall verifies the root Electron installation", () => {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = childProcess.spawnSync(npmCommand, ["run", "postinstall"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Verified Electron \d+\.\d+\.\d+ installation\./);
  assert.doesNotMatch(result.stdout, /Skipped Electron install verification/);
});
