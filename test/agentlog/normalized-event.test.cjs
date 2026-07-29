"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeAgentEvent,
} = require("../../runtime/agentlog/events/normalized-event.cjs");

test("normalizes a Codex permission event", () => {
  const event = normalizeAgentEvent({
    sessionId: "local:codex-42",
    state: "notification",
    event: "CodexUserInputRequest",
    opts: {
      agentId: "codex",
      rawSessionId: "codex-42",
      cwd: "/work/repo",
      toolName: "exec_command",
      permissionAction: "ask",
      permissionCommand: "npm test",
      permissionGateId: "gate-1",
      hookSource: "codex-official",
      sourceEventId: "codex-event-9",
      timestamp: 1_800_000_000_000,
    },
  }, { now: () => 1_800_000_000_500, sequence: 7 });

  assert.equal(event.schemaVersion, 1);
  assert.equal(event.agentId, "codex");
  assert.equal(event.sessionId, "local:codex-42");
  assert.equal(event.rawSessionId, "codex-42");
  assert.equal(event.category, "permission_requested");
  assert.equal(event.occurredAt, 1_800_000_000_000);
  assert.equal(event.receivedAt, 1_800_000_000_500);
  assert.deepEqual(event.permission, {
    action: "ask",
    command: "npm test",
    gateId: "gate-1",
  });
});

test("uses a deterministic id when the source supplies an event id", () => {
  const input = {
    sessionId: "claude-session",
    state: "working",
    event: "PreToolUse",
    opts: { agentId: "claude-code", sourceEventId: "hook-17" },
  };
  const a = normalizeAgentEvent(input, { now: () => 100, sequence: 1 });
  const b = normalizeAgentEvent(input, { now: () => 900, sequence: 99 });
  assert.equal(a.id, b.id);
});

test("bounds assistant output while preserving the original event", () => {
  const input = {
    sessionId: "s1",
    state: "idle",
    event: "Stop",
    opts: { agentId: "claude-code", assistantLastOutput: "x".repeat(20_000) },
  };
  const event = normalizeAgentEvent(input, { now: () => 100, sequence: 1 });
  assert.equal(event.payload.assistantLastOutput.length, 16_384);
  assert.equal(input.opts.assistantLastOutput.length, 20_000);
  assert.equal(event.category, "completed");
});
