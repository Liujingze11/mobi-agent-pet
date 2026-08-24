"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const { ensureElectronBinding } = require("./prepare-electron-native.cjs");

const root = path.resolve(__dirname, "..");
const env = {
  ...process.env,
  AGENTLOG_BETTER_SQLITE3_BINDING: ensureElectronBinding(),
};
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(require("electron"), ["--ozone-platform=x11", root], {
  cwd: root,
  env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code || 0;
});
