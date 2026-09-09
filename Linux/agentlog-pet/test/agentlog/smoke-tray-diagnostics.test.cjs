"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  TRAY_CODES,
  TRAY_STATUSES,
  waitForTrayDiagnostics,
} = require("../../runtime/agentlog/smoke-tray-diagnostics.cjs");

const DOCUMENTED_TRAY_STATUSES = [
  "starting",
  "native",
  "electron-fallback",
  "no-host",
  "failed",
];
const DOCUMENTED_TRAY_CODES = [
  "native-start-timeout",
  "native-protocol-error",
  "native-helper-missing",
  "native-helper-exited",
  "status-notifier-host-missing",
  "electron-fallback-failed",
  "tray-backends-unavailable",
];

test("tray smoke diagnostics expose only status and code", async () => {
  const tray = await waitForTrayDiagnostics(() => ({
    storage: "ready",
    databaseName: "/private/user/data/agentlog.db",
    tray: {
      status: "native",
      code: null,
      helperPath: "/private/package/resources/tray/bin/agentlog-tray",
    },
  }), {
    deadlineMs: 100,
    now: () => 0,
    sleep: async () => assert.fail("native health must not wait"),
  });

  assert.deepEqual(tray, { status: "native", code: null });
});

test("tray smoke diagnostics expose only allowlisted public codes", async () => {
  const tray = await waitForTrayDiagnostics(() => ({
    tray: {
      status: "failed",
      code: "/home/user/.config/agentlog/helper stderr: private",
    },
  }), {
    deadlineMs: 100,
    now: () => 0,
    sleep: async () => assert.fail("failed health must not wait"),
  });

  assert.deepEqual(tray, { status: "failed", code: null });
});

test("tray smoke diagnostics keep every documented public code", async () => {
  assert.deepEqual(TRAY_CODES, DOCUMENTED_TRAY_CODES);
  for (const code of DOCUMENTED_TRAY_CODES) {
    const tray = await waitForTrayDiagnostics(() => ({
      tray: { status: "failed", code },
    }), {
      deadlineMs: 0,
      now: () => 0,
      sleep: async () => assert.fail("failed health must not wait"),
    });
    assert.deepEqual(tray, { status: "failed", code });
  }
});

test("tray smoke diagnostics keep every documented public status", async () => {
  assert.deepEqual(TRAY_STATUSES, DOCUMENTED_TRAY_STATUSES);
  for (const status of DOCUMENTED_TRAY_STATUSES) {
    const tray = await waitForTrayDiagnostics(() => ({
      tray: { status, code: null },
    }), {
      deadlineMs: 0,
      now: () => 0,
      sleep: async () => assert.fail("zero-deadline diagnostics must not wait"),
    });
    assert.deepEqual(tray, { status, code: null });
  }
});

test("tray smoke diagnostics poll until starting changes", async () => {
  let elapsed = 0;
  let reads = 0;
  const tray = await waitForTrayDiagnostics(() => {
    reads += 1;
    return {
      tray: reads < 3
        ? { status: "starting", code: null }
        : { status: "native", code: null },
    };
  }, {
    deadlineMs: 100,
    pollIntervalMs: 25,
    now: () => elapsed,
    sleep: async (delayMs) => { elapsed += delayMs; },
  });

  assert.deepEqual(tray, { status: "native", code: null });
  assert.equal(reads, 3);
  assert.equal(elapsed, 50);
});

test("tray smoke diagnostics stop polling at the bounded deadline", async () => {
  let elapsed = 0;
  const delays = [];
  const tray = await waitForTrayDiagnostics(() => ({
    tray: { status: "starting", code: null },
  }), {
    deadlineMs: 55,
    pollIntervalMs: 20,
    now: () => elapsed,
    sleep: async (delayMs) => {
      delays.push(delayMs);
      elapsed += delayMs;
    },
  });

  assert.deepEqual(tray, { status: "starting", code: null });
  assert.deepEqual(delays, [20, 20, 15]);
  assert.equal(elapsed, 55);
});
