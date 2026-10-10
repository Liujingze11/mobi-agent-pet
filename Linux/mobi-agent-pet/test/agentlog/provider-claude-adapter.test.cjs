"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createClaudeAdapter } = require("../../runtime/agentlog/providers/adapters/claude.cjs");

test("Claude switching replaces only connection fields and keeps comments and Mobi Hook", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-claude-adapter-"));
  try {
    const file = path.join(home, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(file));
    const original = [
      "{", "  // local user comment",
      '  "env": { "ANTHROPIC_BASE_URL": "https://old.example", "ANTHROPIC_AUTH_TOKEN": "old-key", "DEBUG": "keep" },',
      '  "hooks": { "Stop": [{ "command": "mobi-hook" }] },',
      '  "mcpServers": { "local": {} }', "}",
    ].join("\n");
    fs.writeFileSync(file, original);
    const adapter = createClaudeAdapter({ fs, home });
    const changes = adapter.plan({ currentBytes: fs.readFileSync(file),
      previousConfig: { env: { ANTHROPIC_BASE_URL: "https://old.example", ANTHROPIC_AUTH_TOKEN: "old-key" } },
      targetConfig: { env: { ANTHROPIC_BASE_URL: "https://new.example", ANTHROPIC_AUTH_TOKEN: "new-key" } } });
    assert.equal(changes.length, 1);
    const result = changes[0].nextBytes.toString("utf8");
    assert.match(result, /local user comment/);
    assert.match(result, /mobi-hook/);
    assert.match(result, /mcpServers/);
    assert.match(result, /new-key/);
    assert.doesNotMatch(result, /old-key/);
    assert.match(result, /DEBUG/);
    assert.equal(adapter.restartHint(), "none");
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("Claude official profile clears third-party API keys", () => {
  const adapter = createClaudeAdapter({ fs, home: "/tmp/example" });
  const changes = adapter.plan({ currentBytes: Buffer.from('{"env":{"ANTHROPIC_AUTH_TOKEN":"old-key","ANTHROPIC_BASE_URL":"https://old.example"},"hooks":{"Stop":[]}}'),
    previousConfig: { env: { ANTHROPIC_AUTH_TOKEN: "old-key", ANTHROPIC_BASE_URL: "https://old.example" } },
    targetConfig: { env: {} } });
  const result = changes[0].nextBytes.toString("utf8");
  assert.doesNotMatch(result, /old-key|old\.example/);
  assert.match(result, /hooks/);
});

test("malformed Claude settings fail before a file change is created", () => {
  const adapter = createClaudeAdapter({ fs, home: "/tmp/example" });
  assert.throws(() => adapter.plan({ currentBytes: Buffer.from("{broken"), targetConfig: { env: {} } }), /invalid/i);
});
