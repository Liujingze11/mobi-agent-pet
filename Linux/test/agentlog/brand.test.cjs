"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
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
