"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const bridge = require("../../runtime/agentlog/runtime-bridge.cjs");

test("the process bridge publishes Codex and Claude events", () => {
  bridge.clearRecentAgentEvents();
  const seen = [];
  const unsubscribe = bridge.subscribeToAgentEvents((event) => seen.push(event));

  bridge.publishUpstreamEvent({
    sessionId: "codex-1",
    state: "thinking",
    event: "UserPromptSubmit",
    opts: { agentId: "codex", cwd: "/repo/a" },
  });
  bridge.publishUpstreamEvent({
    sessionId: "claude-1",
    state: "working",
    event: "PreToolUse",
    opts: { agentId: "claude-code", cwd: "/repo/b" },
  });
  unsubscribe();

  assert.deepEqual(seen.map((event) => event.agentId), ["codex", "claude-code"]);
  assert.equal(bridge.getAgentEventStats().published, 2);
});
