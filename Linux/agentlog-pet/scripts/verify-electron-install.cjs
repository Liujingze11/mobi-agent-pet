"use strict";

const path = require("node:path");
const { runCli } = require("../runtime/clawd/scripts/verify-electron-install.js");

const rootDir = path.resolve(__dirname, "..");
const outcome = runCli(process.argv.slice(2), {
  rootDir,
  packageRoot: path.join(rootDir, "node_modules", "electron"),
});

if (outcome.exitCode) process.exitCode = outcome.exitCode;
