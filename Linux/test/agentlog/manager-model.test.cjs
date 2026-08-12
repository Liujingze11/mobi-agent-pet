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

test("project list sorts pending work before confirmed active work", async () => {
  const { sortProjects } = await model;
  const result = sortProjects([
    { id: "a", confirmation: "confirmed", lifecycle: "active", updatedAt: 20 },
    { id: "b", confirmation: "pending", lifecycle: "active", updatedAt: 10 },
    { id: "c", confirmation: "confirmed", lifecycle: "active", updatedAt: 30 },
  ]);
  assert.deepEqual(result.map((item) => item.id), ["b", "c", "a"]);
});

test("session filters preserve agent and human sources separately", async () => {
  const { filterSessions } = await model;
  const rows = [
    { id: "agent-1", source: "agent", projectId: "p1", disposition: "completed", startedAt: 100 },
    { id: "human-1", source: "human", projectId: "p1", status: "completed", startedAt: 200 },
    { id: "agent-2", source: "agent", projectId: "p2", disposition: "active", startedAt: 300 },
  ];
  assert.deepEqual(filterSessions(rows, { kind: "agent", projectId: "p1" }).map((row) => row.id), ["agent-1"]);
  assert.deepEqual(filterSessions(rows, { kind: "human", status: "completed" }).map((row) => row.id), ["human-1"]);
  assert.deepEqual(filterSessions(rows, { kind: "all", projectId: "p2" }).map((row) => row.id), ["agent-2"]);
});

test("session filters apply inclusive local date bounds and newest-first sorting", async () => {
  const { filterSessions } = await model;
  const rows = [
    { id: "early", source: "human", projectId: "p1", status: "completed", startedAt: new Date(2026, 7, 10, 9).getTime() },
    { id: "late", source: "agent", projectId: "p1", disposition: "completed", startedAt: new Date(2026, 7, 11, 17).getTime() },
    { id: "outside", source: "agent", projectId: "p1", disposition: "completed", startedAt: new Date(2026, 7, 12, 0).getTime() },
  ];
  assert.deepEqual(filterSessions(rows, { kind: "all", from: "2026-08-10", to: "2026-08-11" }).map((row) => row.id), ["late", "early"]);
});
