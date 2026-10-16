"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const src = path.join(__dirname, "..", "src");
const read = (name) => fs.readFileSync(path.join(src, name), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const { i18n } = require("../src/i18n");

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
    getI18n: async () => ({ lang: "zh", translations: i18n.zh }),
    getSnapshot: async () => ({ sessions: [], groups: [], accountQuota: {} }),
    getPetScene: async () => ({ name: "Pet" }),
    getPetBehavior: async () => ({ freeRoam: false, allowEdgePinning: false, keepSizeAcrossDisplays: false }),
  };
  window.petThemeAPI = {
    getSnapshot: async () => ({ petTint: tint, petAccessory: {} }),
    getPetTintOptions: async () => [{ id: "none", labelKey: "tintNone" }, { id: "blue", labelKey: "tintBlue" }],
    getPetAccessoryOptions: async () => [{ id: "none", labelKey: "accessoryNone" }],
    listThemes: async () => [
      { id: "clawd", name: { zh: "小蟹" }, description: { en: "A busy companion.", zh: "认真忙碌的小伙伴。" }, builtin: true, active: selected === "clawd", capabilities: {} },
      { id: "cloudling", name: { zh: "云朵" }, description: "轻轻飘来，安静陪伴。", builtin: true, active: selected === "cloudling", capabilities: { petTint: true, accessories: true } },
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
    confirmRemoveTheme: async () => ({ confirmed: false }),
  };
  window.eval(fs.readFileSync(path.join(src, "..", "..", "agentlog", "brand-renderer.js"), "utf8"));
  window.eval(read("settings-i18n.js"));
  window.eval(read("settings-tab-theme.js"));
  window.eval(read("dashboard-theme.js"));
  window.eval(read("session-focus-unavailable.js"));
  window.eval(read("dashboard-renderer.js"));
  await tick();

  assert.equal(window.document.querySelector("#themeTabLabel").textContent, "角色");
  window.document.getElementById("themeTab").click();
  await tick();
  assert.equal(window.document.getElementById("themePage").hidden, false);
  assert.equal(window.document.querySelector("#themePage h1").textContent, "角色");
  assert.equal(window.document.querySelector("#themePage .theme-actions"), null);
  assert.equal(window.document.querySelectorAll("#themePage .theme-card").length, 2);
  assert.deepEqual([...window.document.querySelectorAll("#themePage .theme-card-description")].map((description) => description.textContent), ["认真忙碌的小伙伴。", "轻轻飘来，安静陪伴。"]);
  const activeName = window.document.querySelector("#themePage .theme-card.active .theme-card-name");
  assert.equal(activeName.querySelector(".theme-card-check").textContent, "✓ 当前");
  const cloudling = [...window.document.querySelectorAll("#themePage .theme-card")].find((card) => card.textContent.includes("云朵"));
  cloudling.click();
  await tick();
  assert.equal(writes[0][0], "setThemeSelection");
  assert.equal(writes[0][1].themeId, "cloudling");
  assert.equal(window.document.querySelector("#themePage .theme-card.active .theme-card-description").textContent, "轻轻飘来，安静陪伴。");
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
