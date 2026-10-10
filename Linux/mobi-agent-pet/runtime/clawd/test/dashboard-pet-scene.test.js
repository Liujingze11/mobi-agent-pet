"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { describeDashboardPetScene } = require("../src/dashboard-pet-scene");

test("dashboard scene uses the active pet's idle artwork", () => {
  const theme = { _id: "calico", name: "Calico", states: { idle: ["calico-idle-follow.svg"] } };
  const asset = path.join(__dirname, "..", "themes", "calico", "assets", "calico-idle-follow.svg");
  assert.deepStrictEqual(describeDashboardPetScene(theme, (filename) => {
    assert.strictEqual(filename, "calico-idle-follow.svg");
    return asset;
  }), {
    themeId: "calico",
    name: "Calico",
    imageUrl: new URL(`file://${asset}`).href,
  });
});

test("dashboard scene keeps the page usable when idle artwork is unavailable", () => {
  assert.deepStrictEqual(describeDashboardPetScene(null, () => {
    throw new Error("must not resolve without a theme");
  }), { themeId: null, name: null, imageUrl: null });
  assert.deepStrictEqual(describeDashboardPetScene({ _id: "custom", states: { idle: [] } }, () => null), {
    themeId: "custom", name: "custom", imageUrl: null,
  });
});
