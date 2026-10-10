"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const src = path.join(__dirname, "..", "src");
const html = fs.readFileSync(path.join(src, "dashboard.html"), "utf8");
const support = fs.readFileSync(path.join(src, "session-focus-unavailable.js"), "utf8");
const renderer = fs.readFileSync(path.join(src, "dashboard-renderer.js"), "utf8");

test("pet status switches to a behavior page and keeps placement settings without a mode-owned roam toggle", async () => {
  const dom = new JSDOM(html, { url: "file:///dashboard.html", runScripts: "outside-only" });
  const { window } = dom;
  const state = { freeRoam: false, allowEdgePinning: true, keepSizeAcrossDisplays: true };
  const writes = [];
  window.setInterval = () => 1;
  window.ClawdDashboardTheme = { create: () => ({ t: () => "主题", enter: () => {}, leave: () => {}, refresh: async () => {}, render: () => {} }) };
  window.ClawdDashboardAnimation = { create: () => ({ enter: async () => {}, leave: () => {}, refreshLanguage: () => {} }) };
  window.dashboardAPI = {
    onLangChange: () => {},
    onSessionSnapshot: () => {},
    getI18n: async () => ({ lang: "zh", translations: {
      dashboardWindowTitle: "桌面宠物", dashboardStatusTab: "概览",
      dashboardOverviewTitle: "宠物概览",
      dashboardBehaviorTab: "桌宠行为", dashboardBehaviorTitle: "桌宠行为",
      dashboardBehaviorIntro: "调整桌宠行为", dashboardBehaviorRoam: "自由漫步",
      dashboardBehaviorRoamDetail: "空闲时漫步", dashboardBehaviorEdge: "允许贴边",
      dashboardBehaviorEdgeDetail: "贴住边缘", dashboardBehaviorSize: "保持大小",
      dashboardBehaviorSizeDetail: "跨屏幕保持大小", dashboardQuotaHint: "额度",
      dashboardQuotaEmpty: "暂无额度", dashboardEmpty: "无会话", dashboardEmptyHint: "暂无",
      dashboardPetResting: "休息中", openDashboard: "桌面宠物",
    } }),
    getSnapshot: async () => ({ sessions: [], groups: [], accountQuota: {} }),
    getPetScene: async () => ({ name: "Pet" }),
    getPetBehavior: async () => ({ ...state }),
    openCustomModeEditor: async () => { writes.push("edit"); },
    updatePetBehavior: async (key, value) => {
      writes.push([key, value]);
      state[key] = value;
      return { status: "ok" };
    },
  };
  window.eval(support);
  window.eval(renderer);
  await new Promise((resolve) => setImmediate(resolve));

  const behaviorTab = window.document.getElementById("behaviorTab");
  assert.ok(window.document.getElementById("dashboardSidebar"));
  assert.equal(window.document.getElementById("statusHeading").textContent, "宠物概览");
  behaviorTab.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(window.document.getElementById("statusPage").hidden, true);
  assert.equal(window.document.getElementById("behaviorPage").hidden, false);
  assert.equal(behaviorTab.getAttribute("aria-selected"), "true");

  assert.equal(window.document.querySelectorAll(".pet-behavior-switch").length, 0);
  window.document.querySelector("[data-edit-custom-mode]").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, ["edit"]);
  window.document.getElementById("statusTab").click();
  assert.equal(window.document.getElementById("statusPage").hidden, false);
  dom.window.close();
});
