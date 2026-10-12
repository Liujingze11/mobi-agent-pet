"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const src = path.join(__dirname, "..", "src");
const read = (file) => fs.readFileSync(path.join(src, file), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("status session list does not inherit Settings panel spacing", () => {
  const { window } = new JSDOM(read("dashboard.html"));
  const sessions = window.document.querySelector("#statusPage #content");
  assert.ok(sessions);
  assert.match(read("settings.css"), /\.content\s*\{[^}]*padding:\s*28px 36px/s);
  assert.equal(sessions.classList.contains("content"), false);
  window.close();
});
