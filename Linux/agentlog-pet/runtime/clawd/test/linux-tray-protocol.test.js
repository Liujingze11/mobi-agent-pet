"use strict";

const assert = require("node:assert");
const test = require("node:test");

const {
  LIMITS,
  TrayProtocolError,
  encodeMessage,
  createLineDecoder,
  validateParentMessage,
  validateHelperMessage,
} = require("../src/linux-tray-protocol");

const EXPECTED_ICON_THEME_ROOT = "/opt/agentlog/icons";

function expectCode(code, fn) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof TrayProtocolError);
    assert.strictEqual(error.code, code);
    return true;
  });
}

function parentInit(overrides = {}) {
  return {
    version: 1,
    type: "init",
    revision: 0,
    productId: "com.agentlog.pet",
    tooltip: "AgentLog Pet",
    iconThemeRoot: EXPECTED_ICON_THEME_ROOT,
    icon: "agentlog-pet",
    items: [
      { kind: "command", id: "settings.open", label: "Settings", enabled: true },
    ],
    ...overrides,
  };
}

function commandItem(overrides = {}) {
  return { kind: "command", id: "settings.open", label: "Settings", ...overrides };
}

function validateParentInit(overrides = {}) {
  return validateParentMessage(parentInit(overrides), { expectedIconThemeRoot: EXPECTED_ICON_THEME_ROOT });
}

test("encodes a JSON message as one UTF-8 line and enforces the byte limit", () => {
  const message = { version: 1, type: "ready", backend: "ayatana" };
  const encoded = encodeMessage(message);

  assert.ok(Buffer.isBuffer(encoded));
  assert.strictEqual(encoded.toString("utf8"), `${JSON.stringify(message)}\n`);
  assert.strictEqual(encoded[encoded.length - 1], 0x0a);
  assert.strictEqual(Object.isFrozen(LIMITS), true);
  expectCode("line-too-large", () => encodeMessage({ value: "x".repeat(65536) }));
});

test("decodes split UTF-8 chunks and multiple complete lines without corrupting text", () => {
  const messages = [];
  const decoder = createLineDecoder({ onMessage: (message) => messages.push(message) });
  const first = encodeMessage({ version: 1, type: "error", code: "test", message: "你好" });
  const second = encodeMessage({ version: 1, type: "stopped" });

  decoder.push(first.subarray(0, first.length - 2));
  assert.deepStrictEqual(messages, []);
  decoder.push(Buffer.concat([first.subarray(first.length - 2), second]));
  decoder.end();

  assert.deepStrictEqual(messages, [
    { version: 1, type: "error", code: "test", message: "你好" },
    { version: 1, type: "stopped" },
  ]);
});

test("rejects malformed, incomplete, and oversized JSON lines before accepting them", () => {
  const decoder = createLineDecoder();
  expectCode("malformed-json", () => decoder.push(Buffer.from("{not-json}\n")));

  const incomplete = createLineDecoder();
  incomplete.push(Buffer.from("{\"version\":1"));
  expectCode("incomplete-line", () => incomplete.end());

  const oversized = createLineDecoder();
  expectCode("line-too-large", () => oversized.push(Buffer.alloc(LIMITS.lineBytes + 1, 0x78)));
});

test("validates parent messages into frozen copies", () => {
  const input = parentInit();
  const normalized = validateParentMessage(input, { expectedIconThemeRoot: EXPECTED_ICON_THEME_ROOT });

  assert.notStrictEqual(normalized, input);
  assert.notStrictEqual(normalized.items, input.items);
  assert.notStrictEqual(normalized.items[0], input.items[0]);
  assert.deepStrictEqual(normalized, input);
  assert.strictEqual(Object.isFrozen(normalized), true);
  assert.strictEqual(Object.isFrozen(normalized.items), true);
  assert.strictEqual(Object.isFrozen(normalized.items[0]), true);
});

test("requires init iconThemeRoot to match the supervisor-provided packaged root", () => {
  assert.doesNotThrow(() => validateParentInit());
  expectCode("invalid-icon-theme-root", () => validateParentMessage(parentInit()));
  expectCode("invalid-icon-theme-root", () => validateParentMessage(
    parentInit({ iconThemeRoot: "/tmp/untrusted-icons" }),
    { expectedIconThemeRoot: EXPECTED_ICON_THEME_ROOT }
  ));
});

test("accepts the complete parent message vocabulary and rejects unknown types or versions", () => {
  assert.strictEqual(validateParentInit().type, "init");
  assert.strictEqual(validateParentMessage({
    version: 1,
    type: "replace-menu",
    revision: 1,
    items: [commandItem()],
  }).type, "replace-menu");
  assert.strictEqual(validateParentMessage({
    version: 1,
    type: "set-icon",
    revision: 2,
    icon: "agentlog-pet-attention",
  }).type, "set-icon");
  assert.strictEqual(validateParentMessage({ version: 1, type: "shutdown" }).type, "shutdown");

  expectCode("unknown-message-type", () => validateParentMessage({ version: 1, type: "launch-shell" }));
  expectCode("wrong-version", () => validateParentInit({ version: 2 }));
});

test("requires nonnegative safe integer revisions and rejects stale revisions when bounded", () => {
  expectCode("invalid-revision", () => validateParentMessage({
    version: 1,
    type: "set-icon",
    revision: -1,
    icon: "agentlog-pet",
  }));
  expectCode("invalid-revision", () => validateParentMessage({
    version: 1,
    type: "set-icon",
    revision: Number.MAX_SAFE_INTEGER + 1,
    icon: "agentlog-pet",
  }));
  expectCode("stale-revision", () => validateParentMessage({
    version: 1,
    type: "replace-menu",
    revision: 3,
    items: [commandItem()],
  }, { currentRevision: 4 }));
});

test("enforces menu depth, total item count, label length, and command ID length", () => {
  const nested = (depth) => depth === 0
    ? [commandItem()]
    : [{ kind: "submenu", label: `Level ${depth}`, items: nested(depth - 1) }];

  assert.doesNotThrow(() => validateParentInit({ items: nested(3) }));
  expectCode("menu-too-deep", () => validateParentInit({ items: nested(4) }));
  expectCode("menu-too-many-items", () => validateParentInit({
    items: Array.from({ length: LIMITS.menuItems + 1 }, (_, index) => commandItem({ id: `cmd.${index}` })),
  }));
  expectCode("label-too-long", () => validateParentInit({
    items: [commandItem({ label: "😀".repeat(LIMITS.labelChars + 1) })],
  }));
  expectCode("command-id-too-long", () => validateParentInit({
    items: [commandItem({ id: "x".repeat(LIMITS.commandIdChars + 1) })],
  }));
});

test("rejects duplicate command IDs and executable or path-bearing descriptor keys", () => {
  expectCode("duplicate-command-id", () => validateParentInit({
    items: [commandItem(), commandItem({ label: "Again" })],
  }));
  expectCode("forbidden-key", () => validateParentInit({
    items: [commandItem({ click: "exec" })],
  }));
  expectCode("forbidden-key", () => validateParentInit({
    items: [commandItem({ path: "/tmp/icon" })],
  }));
});

test("validates helper messages and copies only their approved primitive fields", () => {
  const cases = [
    { version: 1, type: "ready", backend: "ayatana" },
    { version: 1, type: "host-status", watcher: true, registered: false },
    { version: 1, type: "menu-opened" },
    { version: 1, type: "command", revision: 7, id: "settings.open" },
    { version: 1, type: "error", code: "host-missing", message: "No host" },
    { version: 1, type: "stopped" },
  ];

  for (const input of cases) {
    const normalized = validateHelperMessage(input);
    assert.deepStrictEqual(normalized, input);
    assert.notStrictEqual(normalized, input);
    assert.strictEqual(Object.isFrozen(normalized), true);
  }

  expectCode("unknown-message-type", () => validateHelperMessage({ version: 1, type: "click" }));
  expectCode("wrong-version", () => validateHelperMessage({ version: 2, type: "stopped" }));
  expectCode("invalid-revision", () => validateHelperMessage({
    version: 1,
    type: "command",
    revision: -1,
    id: "settings.open",
  }));
});
