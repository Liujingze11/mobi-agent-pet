"use strict";

const { app } = require("electron");
const fs = require("node:fs");
const { BRAND, legacyUserDataPath } = require("./brand.cjs");

// Keep existing preferences and history when the displayed product name changes.
const userDataPath = legacyUserDataPath(app.getPath("appData"));
fs.mkdirSync(userDataPath, { recursive: true });
app.setPath("userData", userDataPath);
app.setName(BRAND.productName);

const agentLogApp = require("./app-runtime.cjs");
agentLogApp.install();

require("../clawd/src/main.js");

if (process.env.AGENTLOG_MANAGER_SMOKE_MODE === "1") {
  const path = require("node:path");
  app.whenReady().then(() => {
    const startedAt = Date.now();
    const openWhenReady = () => {
      const manager = agentLogApp.openManager();
      if (!manager) {
        if (Date.now() - startedAt < 10_000) setTimeout(openWhenReady, 50);
        else process.stdout.write("AGENTLOG_MANAGER_SMOKE_ERROR runtime-not-ready\n");
        return;
      }
      const report = async () => {
        try {
          const managerShell = await manager.webContents.executeJavaScript(
            "Boolean(document.querySelector(\"[data-testid='manager-shell']\"))",
            true
          );
          const services = agentLogApp.getServices();
          const payload = {
            status: "ok",
            pid: process.pid,
            productName: app.getName(),
            managerTitle: manager.getTitle(),
            databaseName: path.basename(services.database.name),
            managerShell,
          };
          process.stdout.write(`AGENTLOG_MANAGER_SMOKE_READY ${JSON.stringify(payload)}\n`);
        } catch {
          process.stdout.write("AGENTLOG_MANAGER_SMOKE_ERROR renderer-probe-failed\n");
        }
      };
      if (manager.webContents.isLoadingMainFrame?.() === false) void report();
      else manager.webContents.once("did-finish-load", () => void report());
    };
    openWhenReady();
  });
}

if (process.env.AGENTLOG_SMOKE_MODE === "1") {
  const { BrowserWindow } = require("electron");
  const { waitForTrayDiagnostics } = require("./smoke-tray-diagnostics.cjs");
  app.whenReady().then(() => {
    const timer = setTimeout(async () => {
      const tray = await waitForTrayDiagnostics(() => agentLogApp.getHealth());
      const payload = {
        productName: app.getName(),
        windowCount: BrowserWindow.getAllWindows().length,
        pid: process.pid,
        tray,
      };
      process.stdout.write(`AGENTLOG_SMOKE_READY ${JSON.stringify(payload)}\n`);
    }, 1500);
    if (timer && typeof timer.unref === "function") timer.unref();
  });
}
