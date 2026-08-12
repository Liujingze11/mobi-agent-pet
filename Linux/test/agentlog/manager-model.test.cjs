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

test("deriveTimerActions exposes only valid controls", async () => {
  const { deriveTimerActions } = await model;
  assert.deepEqual(deriveTimerActions({ status: "running" }), ["pause", "stop"]);
  assert.deepEqual(deriveTimerActions({ status: "paused" }), ["resume", "stop"]);
  assert.deepEqual(deriveTimerActions({ status: "completed" }), ["start"]);
  assert.deepEqual(deriveTimerActions(null), ["start"]);
});

test("deriveHumanTimerMs advances only persisted running timers", async () => {
  const { deriveHumanTimerMs } = await model;
  const base = {
    startedAt: 1_000,
    accumulatedPauseMs: 2_000,
    effectiveMs: 4_000,
  };
  assert.equal(deriveHumanTimerMs({ ...base, status: "running" }, 10_000), 7_000);
  assert.equal(deriveHumanTimerMs({ ...base, status: "paused" }, 10_000), 4_000);
  assert.equal(deriveHumanTimerMs(null, 10_000), 0);
});

test("formatElapsedClock keeps the live timer stable", async () => {
  const { formatElapsedClock } = await model;
  assert.equal(formatElapsedClock(0), "00:00:00");
  assert.equal(formatElapsedClock(3_661_000), "01:01:01");
  assert.equal(formatElapsedClock(Number.POSITIVE_INFINITY), "00:00:00");
});
