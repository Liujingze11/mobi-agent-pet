"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadFocusWithMock } = require("./helpers/load-focus-with-mock");

test("Linux conversation jump confirms the editor window and terminal tab", async () => {
  const activations = [];
  const { initFocus, cleanup } = loadFocusWithMock((command, args, options, callback) => {
    if (typeof callback === "function") callback(Object.assign(new Error("not installed"), { code: "ENOENT" }), "", "");
  }, { platform: "linux" });
  try {
    const focus = initFocus({
      activateLinuxX11Window: (request) => {
        activations.push(request);
        return { submitted: true, windowId: 0x600004 };
      },
      getLinuxX11ActiveWindow: () => 0x600004,
      requestTerminalTabFocus: async () => true,
    });
    const result = await focus.focusTerminalWindow({
      sourcePid: 23820, editor: "code", pidChain: [23820, 23600, 3961],
      sessionId: "claude-session", agentId: "claude-code", requestSource: "dashboard",
    });
    assert.strictEqual(activations.length, 1);
    assert.strictEqual(activations[0].sourcePid, 23820);
    assert.deepStrictEqual(activations[0].pidChain, [23820, 23600, 3961]);
    assert.strictEqual(result.confirmed, true);
    assert.strictEqual(result.status, "confirmed");
  } finally {
    cleanup();
  }
});

test("Linux independent terminal jump confirms its window without an editor tab", async () => {
  const { initFocus, cleanup } = loadFocusWithMock((command, args, options, callback) => {
    if (typeof callback === "function") callback(Object.assign(new Error("not installed"), { code: "ENOENT" }), "", "");
  }, { platform: "linux" });
  try {
    const focus = initFocus({
      activateLinuxX11Window: () => ({ submitted: true, windowId: 0x800001 }),
      getLinuxX11ActiveWindow: () => 0x800001,
    });
    const result = await focus.focusTerminalWindow({ sourcePid: 410, agentId: "claude-code" });
    assert.strictEqual(result.confirmed, true);
  } finally {
    cleanup();
  }
});

test("opening a Codex editor window alone does not claim its conversation panel was shown", async () => {
  const { initFocus, cleanup } = loadFocusWithMock((command, args, options, callback) => {
    if (typeof callback === "function") callback(Object.assign(new Error("not installed"), { code: "ENOENT" }), "", "");
  }, { platform: "linux" });
  try {
    const focus = initFocus({
      activateLinuxX11Window: () => ({ submitted: true, windowId: 0x600004 }),
      getLinuxX11ActiveWindow: () => 0x600004,
      isUnverifiedConversationPanel: () => true,
    });
    const result = await focus.focusTerminalWindow({ sourcePid: 4388, agentId: "codex" });
    assert.strictEqual(result.confirmed, false);
    assert.strictEqual(result.reason, "conversation-panel-unverified");
  } finally {
    cleanup();
  }
});
