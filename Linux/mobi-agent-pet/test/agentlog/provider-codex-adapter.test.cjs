"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createCodexAdapter } = require("../../runtime/agentlog/providers/adapters/codex.cjs");

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-codex-adapter-"));
  const dir = path.join(home, ".codex");
  fs.mkdirSync(dir);
  return { home, config: path.join(dir, "config.toml"), auth: path.join(dir, "auth.json"), close: () => fs.rmSync(home, { recursive: true, force: true }) };
}

test("Codex switches TOML provider and key without dropping comments, MCP or OAuth material", () => {
  const f = fixture();
  try {
    fs.writeFileSync(f.config, '# user comment\nmodel = "old"\nmodel_provider = "custom"\n\n[model_providers.custom]\nbase_url = "https://old.example"\nwire_api = "responses"\n\n[mcp_servers.local]\ncommand = "mobi-hook"\n');
    fs.writeFileSync(f.auth, '{"OPENAI_API_KEY":"old-key","tokens":{"refresh_token":"keep-oauth"}}');
    const adapter = createCodexAdapter({ fs, home: f.home });
    const changes = adapter.plan({ currentBytes: { config: fs.readFileSync(f.config), auth: fs.readFileSync(f.auth) },
      previousConfig: { auth: { OPENAI_API_KEY: "old-key" }, config: 'model = "old"' },
      targetConfig: { auth: { OPENAI_API_KEY: "new-key" }, config: 'model_provider = "custom"\nmodel = "new"\n[model_providers.custom]\nbase_url = "https://new.example"\nwire_api = "responses"' } });
    assert.equal(changes.length, 2);
    const config = changes.find((change) => change.path === f.config).nextBytes.toString();
    const auth = changes.find((change) => change.path === f.auth).nextBytes.toString();
    assert.match(config, /user comment/);
    assert.match(config, /mobi-hook/);
    assert.match(config, /new\.example/);
    assert.doesNotMatch(config, /old\.example/);
    assert.equal(JSON.parse(auth).tokens.refresh_token, "keep-oauth");
    assert.equal(JSON.parse(auth).OPENAI_API_KEY, undefined);
    assert.equal(require("smol-toml").parse(config).model_providers.custom.experimental_bearer_token, "new-key");
    assert.equal(adapter.restartHint(), "restart-agent");
  } finally { f.close(); }
});

test("Codex official profile removes third-party key and custom routing", () => {
  const f = fixture();
  try {
    const adapter = createCodexAdapter({ fs, home: f.home });
    const changes = adapter.plan({ currentBytes: {
      config: Buffer.from('model_provider = "custom"\n[model_providers.custom]\nbase_url = "https://third.example"\n[mcp_servers.keep]\ncommand = "ok"\n'),
      auth: Buffer.from('{"OPENAI_API_KEY":"third-key","tokens":{"refresh_token":"oauth"}}'),
    }, targetConfig: { auth: {}, config: "" } });
    const auth = JSON.parse(changes.find((change) => change.path === f.auth).nextBytes.toString());
    const config = changes.find((change) => change.path === f.config).nextBytes.toString();
    assert.equal(auth.OPENAI_API_KEY, undefined);
    assert.equal(auth.tokens.refresh_token, "oauth");
    assert.match(config, /mcp_servers\.keep/);
    assert.doesNotMatch(config, /model_provider|third\.example/);
  } finally { f.close(); }
});

test("Codex rejects malformed TOML before making a change", () => {
  const f = fixture();
  try {
    const adapter = createCodexAdapter({ fs, home: f.home });
    assert.throws(() => adapter.plan({ currentBytes: { config: Buffer.from('model = "unterminated'), auth: null }, targetConfig: { auth: {}, config: "" } }), /invalid/i);
  } finally { f.close(); }
});
