"use strict";

const { app } = require("electron");
const { BRAND } = require("./brand.cjs");

app.setName(BRAND.productName);

const agentLogApp = require("./app-runtime.cjs");
agentLogApp.install();

require("../clawd/src/main.js");

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
