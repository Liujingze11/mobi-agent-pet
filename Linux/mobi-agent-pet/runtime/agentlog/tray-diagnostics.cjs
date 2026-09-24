"use strict";

const TRAY_STATUSES = Object.freeze([
  "starting",
  "native",
  "electron-fallback",
  "no-host",
  "failed",
]);

const TRAY_CODES = Object.freeze([
  "native-start-timeout",
  "native-protocol-error",
  "native-helper-missing",
  "native-helper-exited",
  "native-helper-error",
  "native-spawn-failed",
  "status-notifier-host-missing",
  "electron-fallback-failed",
  "tray-backends-unavailable",
]);

function sanitizeTrayDiagnostics(tray) {
  const status = tray && tray.status;
  const code = tray && tray.code;
  return {
    status: TRAY_STATUSES.includes(status) ? status : "failed",
    code: TRAY_CODES.includes(code) ? code : null,
  };
}

module.exports = { TRAY_CODES, TRAY_STATUSES, sanitizeTrayDiagnostics };
