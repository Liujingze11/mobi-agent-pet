"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { setImmediate: settle } = require("node:timers/promises");
const test = require("node:test");
const { createLinuxTraySupervisor } = require("../../runtime/clawd/src/linux-tray-supervisor.js");
const { sanitizeTrayDiagnostics } = require("../../runtime/agentlog/tray-diagnostics.cjs");
const { waitForTrayDiagnostics } = require("../../runtime/agentlog/smoke-tray-diagnostics.cjs");

function createHelper() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.write = () => true;
  child.stdin.end = () => queueMicrotask(() => child.exit());
  child.kill = () => child.exit();
  child.exit = () => {
    if (child.exited) return;
    child.exited = true;
    child.emit("exit", 1);
  };
  return child;
}

const failures = [
  { name: "startup timeout", code: "native-start-timeout", trigger: (child, t) => t.mock.timers.tick(2000) },
  { name: "stdout EOF", code: "native-helper-exited", trigger: (child) => child.stdout.emit("end") },
  { name: "process exit", code: "native-helper-exited", trigger: (child) => child.exit() },
  { name: "stdin error", code: "native-helper-error", trigger: (child) => child.stdin.emit("error", new Error("private pipe path")) },
  { name: "process error", code: "native-helper-error", trigger: (child) => child.emit("error", new Error("private executable path")) },
  { name: "malformed output", code: "native-protocol-error", trigger: (child) => child.stdout.emit("data", Buffer.from("invalid\n")) },
  { name: "spawn failure", code: "native-spawn-failed", spawnError: true, trigger: () => {} },
];

for (const failure of failures) {
  test(`real supervisor ${failure.name} survives public diagnostics filtering`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const child = createHelper();
    let fallbackActive = false;
    const supervisor = createLinuxTraySupervisor({
      spawn() {
        if (failure.spawnError) throw new Error("private executable path");
        return child;
      },
      helperPath: "/private/package/tray/bin/agentlog-tray",
      iconThemeRoot: "/private/package/tray/icons",
      sessionType: "x11",
      fallback: {
        start: () => { fallbackActive = true; },
        stop: () => { fallbackActive = false; },
        isActive: () => fallbackActive,
        onMenuOpened: () => {},
      },
    });
    t.after(() => supervisor.stop());
    await supervisor.start({ items: [], commands: { has: () => false, execute: () => {} } });
    failure.trigger(child, t);
    await settle();

    const expected = { status: "electron-fallback", code: failure.code };
    assert.deepEqual(sanitizeTrayDiagnostics(supervisor.getHealth()), expected);
    assert.deepEqual(await waitForTrayDiagnostics(() => ({ tray: supervisor.getHealth() })), expected);
  });
}
