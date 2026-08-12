"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ensureElectronBinding } = require("./prepare-electron-native.cjs");

const root = path.resolve(__dirname, "..");
const binding = path.join(root, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-build-binding-"));
const backup = path.join(tmp, "better_sqlite3.node");
fs.copyFileSync(binding, backup);
try {
  fs.copyFileSync(ensureElectronBinding(), binding);
  const executable = process.platform === "win32" ? "electron-builder.cmd" : "electron-builder";
  const result = spawnSync(path.join(root, "node_modules", ".bin", executable), ["--linux"], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exitCode = result.status || 1;
} finally {
  fs.copyFileSync(backup, binding);
  fs.rmSync(tmp, { recursive: true, force: true });
}
