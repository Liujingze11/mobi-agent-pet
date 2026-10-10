"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const { constants } = require("node:os");

// Own only this Electron child; unrelated Agent processes are never signalled.
function launchElectron({ root, electronPath, env = process.env, spawnFn = spawn, processRef = process }) {
  const childEnv = { ...env };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const child = spawnFn(electronPath, ["--ozone-platform=x11", root], {
    cwd: root,
    env: childEnv,
    stdio: "inherit",
  });
  const forwards = new Map();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const forward = () => child.kill(signal);
    forwards.set(signal, forward);
    processRef.on(signal, forward);
  }
  let failed = false;
  child.once("error", error => {
    failed = true;
    console.error(`Mobi Agent Pet could not start: ${error.message}`);
  });
  // close also waits for inherited descriptors/child resources to finish.
  child.once("close", (code, signal) => {
    for (const [name, handler] of forwards) processRef.removeListener(name, handler);
    processRef.exitCode = failed ? 1 : signal ? 128 + (constants.signals[signal] || 0) : code || 0;
  });
  return child;
}

if (require.main === module) {
  try {
    const { ensureElectronBinding } = require("./prepare-electron-native.cjs");
    launchElectron({
      root: path.resolve(__dirname, ".."),
      electronPath: require("electron"),
      env: { ...process.env, AGENTLOG_BETTER_SQLITE3_BINDING: ensureElectronBinding() },
    });
  } catch (error) {
    console.error(`Mobi Agent Pet could not start: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { launchElectron };
