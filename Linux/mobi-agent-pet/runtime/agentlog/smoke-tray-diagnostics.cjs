"use strict";

const {
  TRAY_CODES,
  TRAY_STATUSES,
  sanitizeTrayDiagnostics,
} = require("./tray-diagnostics.cjs");

function readTrayDiagnostics(getHealth) {
  const health = getHealth();
  return sanitizeTrayDiagnostics(health && health.tray);
}

async function waitForTrayDiagnostics(getHealth, {
  deadlineMs = 4_000,
  pollIntervalMs = 50,
  now = Date.now,
  sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
} = {}) {
  const deadline = now() + deadlineMs;
  let tray = readTrayDiagnostics(getHealth);
  while (tray.status === "starting" && now() < deadline) {
    await sleep(Math.min(pollIntervalMs, deadline - now()));
    tray = readTrayDiagnostics(getHealth);
  }
  return tray;
}

module.exports = { TRAY_CODES, TRAY_STATUSES, waitForTrayDiagnostics };
