"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createAgentEventStream,
} = require("../../runtime/agentlog/events/event-stream.cjs");

test("publishes in order and keeps only the configured recent events", () => {
  let now = 100;
  const stream = createAgentEventStream({ capacity: 2, now: () => now++ });
  const seen = [];
  stream.subscribe((event) => seen.push(event.type));

  stream.publish({ sessionId: "s", state: "working", event: "UserPromptSubmit", opts: { agentId: "claude-code" } });
  stream.publish({ sessionId: "s", state: "working", event: "PreToolUse", opts: { agentId: "claude-code" } });
  stream.publish({ sessionId: "s", state: "idle", event: "Stop", opts: { agentId: "claude-code" } });

  assert.deepEqual(seen, ["UserPromptSubmit", "PreToolUse", "Stop"]);
  assert.deepEqual(stream.getSnapshot().map((event) => event.type), ["PreToolUse", "Stop"]);
  assert.equal(stream.getStats().published, 3);
});

test("subscriber failures never block other subscribers", () => {
  const stream = createAgentEventStream({ onError: () => {} });
  let delivered = 0;
  stream.subscribe(() => { throw new Error("consumer failed"); });
  stream.subscribe(() => { delivered += 1; });

  const event = stream.publish({
    sessionId: "codex-s",
    state: "thinking",
    event: "UserPromptSubmit",
    opts: { agentId: "codex" },
  });

  assert.ok(event);
  assert.equal(delivered, 1);
  assert.equal(stream.getStats().subscriberErrors, 1);
});

test("deduplicates retries with the same source event identity", () => {
  const stream = createAgentEventStream();
  const input = {
    sessionId: "claude-s",
    state: "working",
    event: "PreToolUse",
    opts: { agentId: "claude-code", sourceEventId: "hook-event-21" },
  };

  assert.ok(stream.publish(input));
  assert.equal(stream.publish(input), null);
  assert.equal(stream.getSnapshot().length, 1);
  assert.equal(stream.getStats().duplicates, 1);
});

test("drops invalid input and reports a defensive stats snapshot", () => {
  const errors = [];
  const stream = createAgentEventStream({ onError: (...args) => errors.push(args) });

  assert.equal(stream.publish({ state: "working", event: "Stop" }), null);
  const stats = stream.getStats();
  stats.published = 999;

  assert.equal(stream.getStats().received, 1);
  assert.equal(stream.getStats().dropped, 1);
  assert.equal(stream.getStats().published, 0);
  assert.equal(errors.length, 1);
  assert.equal(stream.getSnapshot().length, 0);
});

test("returns a snapshot copy and clear removes recent events without resetting diagnostics", () => {
  const stream = createAgentEventStream();
  stream.publish({ sessionId: "s", state: "idle", event: "Stop", opts: { agentId: "codex" } });
  const snapshot = stream.getSnapshot();
  snapshot.pop();

  assert.equal(stream.getSnapshot().length, 1);
  stream.clear();
  assert.equal(stream.getSnapshot().length, 0);
  assert.equal(stream.getStats().published, 1);
});
