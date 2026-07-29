"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { BRAND, rebrandText, rebrandTree } = require("../../runtime/agentlog/brand.cjs");

const root = path.resolve(__dirname, "../..");

test("brand helper replaces product copy without changing lowercase protocol markers", () => {
  assert.equal(BRAND.productName, "AgentLog Pet");
  assert.equal(rebrandText("Welcome to Clawd on Desk"), "Welcome to AgentLog Pet");
  assert.equal(rebrandText("Restart Clawd"), "Restart AgentLog Pet");
  assert.equal(rebrandText("clawd://import"), "clawd://import");
  const tree = rebrandTree({ title: "Clawd Settings", fn: () => "Wake Clawd" });
  assert.equal(tree.title, "AgentLog Pet Settings");
  assert.equal(tree.fn(), "Wake AgentLog Pet");
});

test("renderer brand helper rebrands cyclic language trees without changing compatibility strings", () => {
  const context = vm.createContext({});
  const source = fs.readFileSync(
    path.join(root, "runtime", "agentlog", "brand-renderer.js"),
    "utf8"
  );
  vm.runInContext(source, context, { filename: "brand-renderer.js" });

  const languageTree = {
    en: {
      title: "Clawd Settings",
      values: ["Restart Clawd", "clawd://import", ".clawd", "CLAWD_THEME"],
    },
    zh: { title: "欢迎使用 Clawd on Desk" },
  };
  languageTree.self = languageTree;
  languageTree.en.parent = languageTree;

  const branded = context.AgentLogBrand.rebrandTree(languageTree);
  assert.equal(context.AgentLogBrand.productName, "AgentLog Pet");
  assert.equal(branded.en.title, "AgentLog Pet Settings");
  assert.equal(branded.en.values[0], "Restart AgentLog Pet");
  assert.equal(branded.zh.title, "欢迎使用 AgentLog Pet");
  assert.equal(Array.isArray(branded.en.values), true);
  assert.deepEqual(Array.from(branded.en.values.slice(1)), [
    "clawd://import",
    ".clawd",
    "CLAWD_THEME",
  ]);
  assert.equal(branded.self, branded);
  assert.equal(branded.en.parent, branded);
});

test("primary visible shells contain the AgentLog product name", () => {
  const visibleFiles = [
    "runtime/clawd/src/index.html",
    "runtime/clawd/src/settings.html",
    "runtime/clawd/src/settings-window-icon.js",
    "runtime/clawd/src/settings-tab-about.js",
    "runtime/clawd/src/menu.js",
    "runtime/clawd/src/login-item.js",
  ];

  for (const relativePath of visibleFiles) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(source, /AgentLog Pet/, relativePath);
    assert.doesNotMatch(source, /Clawd on Desk|Clawd Settings|Clawd Desktop Pet/, relativePath);
  }
});

test("translated application copy is branded at runtime", () => {
  const { i18n } = require("../../runtime/clawd/src/i18n.js");
  assert.equal(i18n.en.tutorialWelcomeTitle, "Welcome to AgentLog Pet");
  assert.equal(i18n.en.settingsWindowTitle, "AgentLog Pet Settings");
  assert.equal(i18n.zh.tutorialWelcomeTitle, "欢迎使用 AgentLog Pet");
});
