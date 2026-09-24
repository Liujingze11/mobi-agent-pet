"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  sumIntervalDuration,
  unionIntervalDuration,
} = require("../../runtime/agentlog/time/intervals.cjs");

test("sums session duration but unions overlapping wall-clock time", () => {
  const intervals = [
    { startedAt: 0, endedAt: 10_000 },
    { startedAt: 5_000, endedAt: 15_000 },
  ];

  assert.equal(sumIntervalDuration(intervals), 20_000);
  assert.equal(unionIntervalDuration(intervals), 15_000);
});

test("clips before summing or unioning and closes open intervals at the range end", () => {
  const intervals = [
    { startedAt: -5_000, endedAt: 4_000 },
    { startedAt: 0, endedAt: 10_000 },
    { startedAt: 8_000, endedAt: null },
  ];
  const range = { start: 0, end: 10_000 };

  assert.equal(sumIntervalDuration(intervals, range), 16_000);
  assert.equal(unionIntervalDuration(intervals, range), 10_000);
});

test("ignores empty and invalid intervals", () => {
  const intervals = [
    { startedAt: 10, endedAt: 10 },
    { startedAt: 12, endedAt: 11 },
    { startedAt: Number.NaN, endedAt: 20 },
    { startedAt: 0, endedAt: Number.POSITIVE_INFINITY },
  ];

  assert.equal(sumIntervalDuration(intervals, { start: 0, end: 20 }), 0);
  assert.equal(unionIntervalDuration(intervals, { start: 20, end: 0 }), 0);
});
