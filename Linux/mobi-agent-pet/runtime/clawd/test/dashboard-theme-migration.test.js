"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const src = path.join(__dirname, "..", "src");
const read = (name) => fs.readFileSync(path.join(src, name), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("pet status theme page selects pets and customizes the active pet", async () => {
  const dom = new JSDOM(read("dashboard.html"), { url: "file:///dashboard.html", runScripts: "outside-only" });
  const { window } = dom;
  window.ClawdDashboardAnimation = { create: () => ({ enter: async () => {}, leave: () => {}, refreshLanguage: () => {} }) };
  const writes = [];
  let selected = "clawd";
  let tint = {};
  window.setInterval = () => 1;
  window.dashboardAPI = {
    onLangChange: () => {}, onSessionSnapshot: () => {},
    getI18n: async () => ({ lang: "zh", translations: { dashboardWindowTitle: "桌面宠物", dashboardStatusTab: "概览", dashboardOverviewTitle: "宠物概览", dashboardBehaviorTab: "桌宠行为", openDashboard: "桌面宠物" } }),
    getSnapshot: async () => ({ sessions: [], groups: [], accountQuota: {} }),
    getPetScene: async () => ({ name: "Pet" }),
    getPetBehavior: async () => ({ freeRoam: false, allowEdgePinning: false, keepSizeAcrossDisplays: false }),
  };
  window.petThemeAPI = {
    getSnapshot: async () => ({ petTint: tint, petAccessory: {} }),
    getPetTintOptions: async () => [{ id: "none", labelKey: "tintNone" }, { id: "blue", labelKey: "tintBlue" }],
    getPetAccessoryOptions: async () => [{ id: "none", labelKey: "accessoryNone" }],
    listThemes: async () => [
      { id: "clawd", name: { zh: "小蟹" }, builtin: true, active: selected === "clawd", capabilities: {} },
      { id: "cloudling", name: { zh: "云朵" }, builtin: true, active: selected === "cloudling", capabilities: { petTint: true, accessories: true } },
    ],
    command: async (action, payload) => {
      writes.push([action, payload]);
      if (action === "setThemeSelection") selected = payload.themeId;
      return { status: "ok" };
    },
    update: async (key, value) => {
      writes.push([key, value]);
      if (key === "petTint") tint = value;
      return { status: "ok" };
    },
    importCodexPetZip: async () => ({ status: "cancel" }),
    refreshCodexPets: async () => ({ status: "ok", summary: {} }),
    importUserThemeZip: async () => ({ status: "cancel" }),
    openUserThemesDir: async () => ({ status: "ok" }),
    removeCodexPet: async () => ({ status: "cancel" }),
    confirmRemoveTheme: async () => ({ confirmed: false }),
  };
  window.eval(fs.readFileSync(path.join(src, "..", "..", "agentlog", "brand-renderer.js"), "utf8"));
  window.eval(read("settings-i18n.js"));
  window.eval(read("settings-tab-theme.js"));
  window.eval(read("dashboard-theme.js"));
  window.eval(read("session-focus-unavailable.js"));
  window.eval(read("dashboard-renderer.js"));
  await tick();

  assert.equal(window.document.querySelector("#themeTabLabel").textContent, "主题");
  window.document.getElementById("themeTab").click();
  await tick();
  assert.equal(window.document.getElementById("themePage").hidden, false);
  assert.equal(window.document.querySelectorAll("#themePage .theme-card").length, 2);
  const cloudling = [...window.document.querySelectorAll("#themePage .theme-card")].find((card) => card.textContent.includes("云朵"));
  cloudling.click();
  await tick();
  assert.equal(writes[0][0], "setThemeSelection");
  assert.equal(writes[0][1].themeId, "cloudling");
  const customize = [...window.document.querySelectorAll("#themePage .theme-customize-btn")].find((button) => button.getAttribute("aria-label").includes("云朵"));
  customize.click();
  await tick();
  const tintSelect = window.document.querySelector("#themePage .pet-tint-select");
  assert.ok(tintSelect);
  tintSelect.value = "blue";
  tintSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  await tick();
  assert.equal(writes.at(-1)[0], "petTint");
  assert.equal(writes.at(-1)[1].cloudling, "blue");
  dom.window.close();
});
