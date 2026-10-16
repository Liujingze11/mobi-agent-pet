"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const src = path.join(__dirname, "..", "src");
const { i18n } = require("../src/i18n");

test("Desktop Pet keeps overview, actions and theme navigation after removing the unused behavior page", async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(src, "dashboard.html"), "utf8"), { runScripts: "outside-only" });
  const { window } = dom;
  try {
    window.setInterval = () => 1;
    window.ClawdDashboardTheme = { create: () => ({ t: () => "角色", enter() {}, leave() {}, refresh: async () => {}, render() {} }) };
    window.dashboardAPI = {
      onLangChange() {}, onSessionSnapshot() {},
      getI18n: async () => ({ lang: "zh", translations: i18n.zh }),
      getSnapshot: async () => ({ sessions: [], groups: [], accountQuota: {} }),
      getPetScene: async () => ({ name: "Pet" }),
    };
    window.eval(fs.readFileSync(path.join(src, "session-focus-unavailable.js"), "utf8"));
    window.eval(fs.readFileSync(path.join(src, "dashboard-renderer.js"), "utf8"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(window.document.getElementById("statusHeading").textContent, "主页");
    assert.equal(window.document.querySelectorAll("#dashboardSidebar [role=tab]").length, 3);
    window.document.getElementById("actionsTab").click();
    assert.equal(window.document.getElementById("actionsPage").hidden, false);
    assert.equal(window.document.getElementById("statusPage").hidden, true);
    window.document.getElementById("themeTab").click();
    assert.equal(window.document.getElementById("themePage").hidden, false);
    assert.equal(window.document.getElementById("actionsPage").hidden, true);
    window.document.getElementById("statusTab").click();
    assert.equal(window.document.getElementById("statusPage").hidden, false);
  } finally { dom.window.close(); }
});
