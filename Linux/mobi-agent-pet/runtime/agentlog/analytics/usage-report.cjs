"use strict";

function periodBounds(period, anchor, now = Date.now()) {
  if (period !== "day" && period !== "week") throw new TypeError("period must be day or week");
  if (!Number.isFinite(anchor) || !Number.isFinite(now)) throw new TypeError("timestamps must be finite");
  const date = new Date(Math.min(anchor, now));
  date.setHours(0, 0, 0, 0);
  if (period === "week") date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const start = date.getTime();
  const boundaries = [start];
  if (period === "day") {
    const midnight = new Date(start);
    midnight.setDate(midnight.getDate() + 1);
    for (let at = start + 3_600_000; at < midnight.getTime(); at += 3_600_000) boundaries.push(at);
    boundaries.push(midnight.getTime());
  } else {
    for (let index = 1; index <= 7; index += 1) {
      const next = new Date(start);
      next.setDate(next.getDate() + index);
      boundaries.push(next.getTime());
    }
  }
  const previous = new Date(start);
  previous.setDate(previous.getDate() - (period === "day" ? 1 : 7));
  return {
    start,
    end: Math.min(now, boundaries.at(-1)),
    boundaries,
    previousStart: previous.getTime(),
  };
}

function clippedInterval(interval, start, end) {
  const from = Math.max(start, Number(interval.startedAt));
  const until = Math.min(end, interval.endedAt == null ? end : Number(interval.endedAt));
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) return null;
  return { from, until, projectId: interval.projectId ?? null, sessionId: interval.sessionId };
}

function summarizeBucket(intervals, start, end) {
  const events = [];
  for (const interval of intervals) {
    const clipped = clippedInterval(interval, start, end);
    if (!clipped) continue;
    events.push({ at: clipped.from, delta: 1, projectId: clipped.projectId });
    events.push({ at: clipped.until, delta: -1, projectId: clipped.projectId });
  }
  events.sort((left, right) => left.at - right.at || left.delta - right.delta);

  const active = new Map();
  const projects = new Map();
  let totalMs = 0;
  let cursor = start;
  for (let index = 0; index < events.length;) {
    const at = events[index].at;
    if (at > cursor && active.size) {
      const duration = at - cursor;
      totalMs += duration;
      const share = duration / active.size;
      for (const projectId of active.keys()) {
        projects.set(projectId, (projects.get(projectId) || 0) + share);
      }
    }
    while (index < events.length && events[index].at === at) {
      const event = events[index++];
      const count = (active.get(event.projectId) || 0) + event.delta;
      if (count > 0) active.set(event.projectId, count);
      else active.delete(event.projectId);
    }
    cursor = at;
  }
  return { activeMs: totalMs, projects };
}

function summarizeIntervalBuckets(intervals, boundaries) {
  if (!Array.isArray(intervals) || !Array.isArray(boundaries) || boundaries.length < 2) {
    throw new TypeError("intervals and at least two boundaries are required");
  }
  const projects = new Map();
  const sessions = new Set();
  const buckets = [];
  let totalMs = 0;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new TypeError("boundaries must increase");
    }
    const bucket = summarizeBucket(intervals, start, end);
    totalMs += bucket.activeMs;
    buckets.push({ start, end, activeMs: bucket.activeMs });
    for (const [projectId, activeMs] of bucket.projects) {
      projects.set(projectId, (projects.get(projectId) || 0) + activeMs);
    }
  }
  for (const interval of intervals) {
    if (clippedInterval(interval, boundaries[0], boundaries.at(-1)) && interval.sessionId != null) {
      sessions.add(interval.sessionId);
    }
  }
  return {
    totalMs,
    buckets,
    projects: [...projects].map(([projectId, activeMs]) => ({ projectId, activeMs }))
      .sort((left, right) => right.activeMs - left.activeMs || String(left.projectId).localeCompare(String(right.projectId))),
    sessionCount: sessions.size,
  };
}

module.exports = { periodBounds, summarizeIntervalBuckets };
