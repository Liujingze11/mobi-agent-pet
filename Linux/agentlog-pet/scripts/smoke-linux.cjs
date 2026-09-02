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
const appArgs = packagedBinary
  ? []
  : ["--ozone-platform=x11", root];
const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-pet-smoke-"));
const env = {
  ...process.env,
  HOME: isolatedHome,
  XDG_CONFIG_HOME: path.join(isolatedHome, ".config"),
  CLAWD_SKIP_SIDECAR_FETCH: "1",
  CLAWD_OZONE_PLATFORM: "x11",
  AGENTLOG_SMOKE_MODE: "1",
};
if (!packagedBinary) env.AGENTLOG_BETTER_SQLITE3_BINDING = ensureElectronBinding();
delete env.ELECTRON_RUN_AS_NODE;

function waitForReady(child, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(
      () => reject(new Error(`readiness timeout:\n${output}`)),
      timeoutMs
    );
    const inspect = (chunk) => {
      output += chunk.toString();
      const line = output
        .split(/\r?\n/)
        .find((entry) => entry.startsWith("AGENTLOG_SMOKE_READY "));
      if (!line) return;
      clearTimeout(timeout);
      resolve(JSON.parse(line.slice("AGENTLOG_SMOKE_READY ".length)));
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("exit", (code) => {
      if (code === 0 && output.includes("relaunching under XWayland")) return;
      clearTimeout(timeout);
      reject(
        new Error(`application exited before ready with code ${code}:\n${output}`)
      );
    });
  });
}

function waitForExit(child, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("second instance did not exit")),
      timeoutMs
    );
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

function waitForMarker(child, marker, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(
      () => reject(new Error(`timed out waiting for ${marker}:\n${output}`)),
      timeoutMs
    );
    const inspect = (chunk) => {
      output += chunk.toString();
      if (!output.includes(marker)) return;
      clearTimeout(timeout);
      child.stdout.removeListener("data", inspect);
      resolve();
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`application exited before ${marker} with code ${code}:\n${output}`));
    });
  });
}

(async () => {
  let first;
  let firstPid;
  try {
    first = spawn(executable, appArgs, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const ready = await waitForReady(first);
    firstPid = ready.pid;
    assert.equal(ready.productName, "AgentLog Pet");
    assert.ok(ready.windowCount >= 1, "pet runtime must create at least one window");

    const managerActivated = waitForMarker(first, "AGENTLOG_SMOKE_MANAGER_ACTIVATED");
    const second = spawn(executable, appArgs, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(await waitForExit(second), 0);
    await managerActivated;

    process.stdout.write(`${JSON.stringify({ status: "ok", ...ready })}\n`);
  } finally {
    if (firstPid) await stopPid(firstPid);
    await stopChild(first);
    fs.rmSync(isolatedHome, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
