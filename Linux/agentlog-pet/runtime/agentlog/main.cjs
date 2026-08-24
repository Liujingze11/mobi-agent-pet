"use strict";

const { app } = require("electron");
const { BRAND } = require("./brand.cjs");

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
  app.whenReady().then(() => {
    const timer = setTimeout(() => {
      const payload = {
        productName: app.getName(),
        windowCount: BrowserWindow.getAllWindows().length,
        pid: process.pid,
      };
      process.stdout.write(`AGENTLOG_SMOKE_READY ${JSON.stringify(payload)}\n`);
    }, 1500);
    if (timer && typeof timer.unref === "function") timer.unref();
  });
}
