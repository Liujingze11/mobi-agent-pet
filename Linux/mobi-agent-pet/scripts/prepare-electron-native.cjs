"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const electronVersion = require("electron/package.json").version;
const sqliteVersion = require("better-sqlite3/package.json").version;
const sourceBinding = path.join(root, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
const cacheDir = path.join(root, ".electron-native", `electron-${electronVersion}-${process.platform}-${process.arch}`);
const cachedBinding = path.join(cacheDir, `better-sqlite3-${sqliteVersion}.node`);

function ensureElectronBinding() {
  if (fs.existsSync(cachedBinding)) return cachedBinding;
  fs.mkdirSync(cacheDir, { recursive: true });
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-node-binding-"));
  const backupBinding = path.join(backupDir, "better_sqlite3.node");
  fs.copyFileSync(sourceBinding, backupBinding);
  try {
    const command = process.platform === "win32" ? "electron-rebuild.cmd" : "electron-rebuild";
    const result = spawnSync(path.join(root, "node_modules", ".bin", command), [
      "--version", electronVersion,
      "--force",
      "--which-module", "better-sqlite3",
      "--module-dir", root,
    ], { cwd: root, encoding: "utf8", stdio: "inherit" });
    if (result.status !== 0) throw new Error(`electron-rebuild failed with status ${result.status}`);
    fs.copyFileSync(sourceBinding, cachedBinding);
  } finally {
    fs.copyFileSync(backupBinding, sourceBinding);
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
  return cachedBinding;
}

if (require.main === module) {
  process.stdout.write(`${ensureElectronBinding()}\n`);
}

module.exports = { ensureElectronBinding };
