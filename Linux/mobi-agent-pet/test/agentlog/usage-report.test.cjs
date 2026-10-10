"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { periodBounds, summarizeIntervalBuckets } = require("../../runtime/agentlog/analytics/usage-report.cjs");

test("usage report counts concurrent Agent activity once and splits project shares", () => {
  const minute = 60_000;
  const report = summarizeIntervalBuckets([
    { sessionId: "a", projectId: "alpha", startedAt: 0, endedAt: 30 * minute },
    { sessionId: "b", projectId: "beta", startedAt: 15 * minute, endedAt: 45 * minute },
  ], [0, 30 * minute, 60 * minute]);

  assert.equal(report.totalMs, 45 * minute);
  assert.deepEqual(report.buckets.map((bucket) => bucket.activeMs), [30 * minute, 15 * minute]);
  assert.deepEqual(report.projects, [
    { projectId: "alpha", activeMs: 22.5 * minute },
    { projectId: "beta", activeMs: 22.5 * minute },
  ]);
  assert.equal(report.sessionCount, 2);
});

test("usage report clips open intervals and gives one project full credit for overlapping sessions", () => {
  const report = summarizeIntervalBuckets([
    { sessionId: "a", projectId: "alpha", startedAt: -10, endedAt: null },
    { sessionId: "b", projectId: "alpha", startedAt: 20, endedAt: 90 },
  ], [0, 50, 80]);

  assert.equal(report.totalMs, 80);
  assert.deepEqual(report.buckets.map((bucket) => bucket.activeMs), [50, 30]);
  assert.deepEqual(report.projects, [{ projectId: "alpha", activeMs: 80 }]);
  assert.equal(report.sessionCount, 2);
});

test("period bounds use local calendar days and cap the current period at now", () => {
  const now = new Date(2026, 8, 24, 13, 30).getTime();
  const today = periodBounds("day", now, now);
  const week = periodBounds("week", now, now);

  assert.equal(today.boundaries[0], new Date(2026, 8, 24).getTime());
  assert.equal(today.end, now);
  assert.equal(today.boundaries.length, 25);
  assert.equal(week.boundaries[0], new Date(2026, 8, 21).getTime());
  assert.equal(week.boundaries.length, 8);
  assert.equal(week.end, now);
  assert.equal(today.previousStart, new Date(2026, 8, 23).getTime());
});

test("hour buckets cover local daylight saving days without duplicate boundaries", () => {
  const prior = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const spring = periodBounds("day", new Date(2026, 2, 8, 12).getTime(), new Date(2026, 2, 9).getTime());
    const autumn = periodBounds("day", new Date(2026, 10, 1, 12).getTime(), new Date(2026, 10, 2).getTime());
    assert.equal(spring.boundaries.length - 1, 23);
    assert.equal(autumn.boundaries.length - 1, 25);
    assert.ok(spring.boundaries.every((at, index) => index === 0 || at > spring.boundaries[index - 1]));
  } finally {
    if (prior === undefined) delete process.env.TZ;
    else process.env.TZ = prior;
  }
});
