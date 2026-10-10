"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { runConversationJumpCheck } = require("../src/doctor-conversation-jump");

test("doctor tests a focusable local conversation using the same jump path", async () => {
  const calls = [];
  const result = await runConversationJumpCheck({
    getSessionSnapshot: () => ({ sessions: [
      { id: "remote", canFocus: true, host: "example.com", updatedAt: 300 },
      { id: "local", canFocus: true, host: null, updatedAt: 200, agentName: "Claude Code" },
    ] }),
    focusSession: async (id, options) => {
      calls.push([id, options]);
      return { confirmed: true, status: "confirmed" };
    },
  });
  assert.deepStrictEqual(calls, [["local", { requestSource: "doctor" }]]);
  assert.deepStrictEqual(result, { status: "ok", agentName: "Claude Code" });
});

test("doctor leaves the check waiting when no conversation can be tested", async () => {
  const result = await runConversationJumpCheck({
    getSessionSnapshot: () => ({ sessions: [{ id: "remote", canFocus: false }] }),
    focusSession: () => { throw new Error("must not focus"); },
  });
  assert.deepStrictEqual(result, { status: "unavailable" });
});

test("doctor reports a failed focus rather than treating a submitted command as success", async () => {
  const result = await runConversationJumpCheck({
    getSessionSnapshot: () => ({ sessions: [{ id: "local", canFocus: true, host: null }] }),
    focusSession: async () => ({ confirmed: false, reason: "terminal-tab-not-found" }),
  });
  assert.deepStrictEqual(result, { status: "failed", agentName: "Agent" });
});
