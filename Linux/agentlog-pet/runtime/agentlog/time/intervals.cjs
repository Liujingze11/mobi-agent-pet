"use strict";

function normalizedRange(range = {}) {
  return {
    start: Number.isFinite(range.start) ? range.start : -Infinity,
    end: Number.isFinite(range.end) ? range.end : Date.now(),
  };
}

function clippedIntervals(intervals, range) {
  const bounds = normalizedRange(range);
  if (!Array.isArray(intervals) || bounds.end <= bounds.start) return [];

  return intervals.flatMap((interval) => {
    if (!interval || !Number.isFinite(interval.startedAt)) return [];
    const endedAt = interval.endedAt == null ? bounds.end : interval.endedAt;
    if (!Number.isFinite(endedAt)) return [];
    const startedAt = Math.max(bounds.start, interval.startedAt);
    const clippedEnd = Math.min(bounds.end, endedAt);
    return clippedEnd > startedAt ? [[startedAt, clippedEnd]] : [];
  });
}

function sumIntervalDuration(intervals, range = {}) {
  return clippedIntervals(intervals, range)
    .reduce((total, [startedAt, endedAt]) => total + endedAt - startedAt, 0);
}

function unionIntervalDuration(intervals, range = {}) {
  const sorted = clippedIntervals(intervals, range)
    .sort(([leftStart, leftEnd], [rightStart, rightEnd]) => leftStart - rightStart || leftEnd - rightEnd);
  let total = 0;
  let current = null;

  for (const interval of sorted) {
    if (!current || interval[0] > current[1]) {
      if (current) total += current[1] - current[0];
      current = interval.slice();
    } else {
      current[1] = Math.max(current[1], interval[1]);
    }
  }
  return total + (current ? current[1] - current[0] : 0);
}

module.exports = { sumIntervalDuration, unionIntervalDuration };
