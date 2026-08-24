"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { stopChild, stopPid } = require("./smoke-process.cjs");
const { ensureElectronBinding } = require("./prepare-electron-native.cjs");

const root = path.resolve(__dirname, "..");
const packagedBinary = process.argv[2] ? path.resolve(process.argv[2]) : null;
const executable = packagedBinary || require("electron");
const appArgs = packagedBinary ? ["--ozone-platform=x11"] : ["--ozone-platform=x11", root];
const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-manager-smoke-"));
const env = {
  ...process.env,
  HOME: isolatedHome,
  XDG_CONFIG_HOME: path.join(isolatedHome, ".config"),
  CLAWD_SKIP_SIDECAR_FETCH: "1",
  CLAWD_OZONE_PLATFORM: "x11",
  AGENTLOG_MANAGER_SMOKE_MODE: "1",
};
if (!packagedBinary) env.AGENTLOG_BETTER_SQLITE3_BINDING = ensureElectronBinding();
delete env.ELECTRON_RUN_AS_NODE;

function waitForReady(child, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`manager readiness timeout:\n${output}`)), timeoutMs);
    const inspect = (chunk) => {
      output += chunk.toString();
      const errorLine = output.split(/\r?\n/).find((entry) => entry.startsWith("AGENTLOG_MANAGER_SMOKE_ERROR "));
      if (errorLine) {
        clearTimeout(timeout);
        reject(new Error(errorLine));
        return;
      }
      const line = output.split(/\r?\n/).find((entry) => entry.startsWith("AGENTLOG_MANAGER_SMOKE_READY "));
      if (!line) return;
      clearTimeout(timeout);
      resolve(JSON.parse(line.slice("AGENTLOG_MANAGER_SMOKE_READY ".length)));
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`application exited before manager ready with code ${code}:\n${output}`));
    });
  });
}

(async () => {
  let child;
  let managerPid;
  try {
    child = spawn(executable, appArgs, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const ready = await waitForReady(child);
    managerPid = ready.pid;
    assert.ok(Number.isInteger(managerPid) && managerPid > 0);
    const { pid, ...metadata } = ready;
    assert.deepEqual(metadata, {
      status: "ok",
      productName: "AgentLog Pet",
      managerTitle: "AgentLog Pet",
      databaseName: "agentlog.db",
      managerShell: true,
    });
    process.stdout.write(`${JSON.stringify(ready)}\n`);
  } finally {
    if (managerPid) await stopPid(managerPid);
    await stopChild(child);
    fs.rmSync(isolatedHome, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
