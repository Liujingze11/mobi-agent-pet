"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const model = import("../../src/manager/model.mjs");

test("formatDuration keeps long project time compact and stable", async () => {
  const { formatDuration } = await model;
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(3_900_000), "1h 5m");
  assert.equal(formatDuration(444_660_000), "123h 31m");
});

test("formatDuration normalizes negative and nonfinite input", async () => {
  const { formatDuration } = await model;
  assert.equal(formatDuration(-60_000), "0m");
  assert.equal(formatDuration(Number.NaN), "0m");
  assert.equal(formatDuration(Number.POSITIVE_INFINITY), "0m");
});

test("formatPath preserves root and basename context when compacting", async () => {
  const { formatPath } = await model;
  assert.equal(formatPath("/home/dev/work/agentlog-pet", 22), "/.../agentlog-pet");
  assert.equal(formatPath("C:\\Users\\dev\\agentlog-pet", 22), "C:\\...\\agentlog-pet");
  assert.equal(formatPath("/", 22), "/");
});

test("formatPath handles unusable input and very narrow limits", async () => {
  const { formatPath } = await model;
  assert.equal(formatPath("", 22), "Unknown path");
  assert.equal(formatPath(null, 22), "Unknown path");
  assert.equal(formatPath("/projects/agentlog-pet", -5), "agentlog-pet");
  assert.equal(formatPath("/projects/agentlog-pet", 10), "/.../g-pet");
});

test("deriveNavigationBadge reports only actionable pending work", async () => {
  const { deriveNavigationBadge } = await model;
  assert.equal(deriveNavigationBadge("projects", { pendingProjectCount: 4 }), "4");
  assert.equal(deriveNavigationBadge("projects", { pendingProjectCount: 104 }), "99+");
  assert.equal(deriveNavigationBadge("projects", { pendingProjectCount: -1 }), null);
  assert.equal(deriveNavigationBadge("projects", { pendingProjectCount: Number.NaN }), null);
  assert.equal(deriveNavigationBadge("sessions", { pendingProjectCount: 4 }), null);
});
