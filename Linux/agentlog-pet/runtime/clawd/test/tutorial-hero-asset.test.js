"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");
const PRODUCT_ROOT = path.resolve(ROOT, "..", "..");
const BRAND_ICON = path.join(PRODUCT_ROOT, "assets", "brand", "icon.png");

test("tutorial uses the product brand icon", () => {
  assert.ok(fs.existsSync(BRAND_ICON), "assets/brand/icon.png should exist");

  const mainSource = fs.readFileSync(path.join(ROOT, "src", "main.js"), "utf8");
  assert.match(
    mainSource,
    /"assets", "brand", "icon\.png"/,
    "main.js should point the tutorial hero at the product brand icon"
  );
  assert.doesNotMatch(mainSource, /clawd-about-hero|assets", "icon\.png"/);
});
