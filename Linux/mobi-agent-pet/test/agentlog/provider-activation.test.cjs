"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { openAgentLogDatabase } = require("../../runtime/agentlog/storage/database.cjs");
const { createProviderVault } = require("../../runtime/agentlog/providers/vault.cjs");
const { createProviderRepository } = require("../../runtime/agentlog/providers/repository.cjs");
const { createProviderFileTransaction } = require("../../runtime/agentlog/providers/file-transaction.cjs");
const { createClaudeAdapter } = require("../../runtime/agentlog/providers/adapters/claude.cjs");
const { createCodexAdapter } = require("../../runtime/agentlog/providers/adapters/codex.cjs");
const { createCoexistingAdapter } = require("../../runtime/agentlog/providers/adapters/coexisting.cjs");
const { createGrokAdapter } = require("../../runtime/agentlog/providers/adapters/grokbuild.cjs");
const { createDesktopAdapter } = require("../../runtime/agentlog/providers/adapters/claude-desktop.cjs");
const { createProviderActivation } = require("../../runtime/agentlog/providers/activation.cjs");

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-activation-"));
  const db = openAgentLogDatabase({ databasePath: path.join(home, "store.db") });
  const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: (value) => Buffer.from(Buffer.from(value).toString("base64")),
    decryptString: (value) => Buffer.from(value.toString(), "base64").toString() };
  const vault = createProviderVault({ safeStorage });
  let sequence = 0;
  const repository = createProviderRepository(db, { createId: () => `p${++sequence}`, vault });
  const transaction = createProviderFileTransaction({ db, fs, vault });
  const adapters = { claude: createClaudeAdapter({ fs, home }), codex: createCodexAdapter({ fs, home }),
    opencode: createCoexistingAdapter("opencode", { fs, home }),
    grokbuild: createGrokAdapter({ fs, home }),
    "claude-desktop": createDesktopAdapter({ fs, home }) };
  const activation = createProviderActivation({ repository, transaction, adapters, fs });
  return { home, db, repository, activation, close() { db.close(); fs.rmSync(home, { recursive: true, force: true }); } };
}

test("activates Claude profile, preserves hook, and restores original credentials", async () => {
  const f = fixture();
  try {
    const file = path.join(f.home, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, '{\n  // user comment\n  "env": { "ANTHROPIC_AUTH_TOKEN": "old" },\n  "hooks": { "SessionStart": ["mobi"] }\n}\n');
    const row = f.repository.create({ appId: "claude", name: "New", settingsConfig: { env: { ANTHROPIC_AUTH_TOKEN: "new" } } });
    const result = await f.activation.activate(row.id);
    assert.equal(result.activeId, row.id);
    assert.match(fs.readFileSync(file, "utf8"), /SessionStart/);
    assert.match(fs.readFileSync(file, "utf8"), /ANTHROPIC_AUTH_TOKEN": "new"/);
    await f.activation.restoreOriginal("claude");
    assert.match(fs.readFileSync(file, "utf8"), /ANTHROPIC_AUTH_TOKEN": "old"/);
    assert.match(fs.readFileSync(file, "utf8"), /SessionStart/);
    assert.equal(f.repository.getActive("claude").providerId, null);
  } finally { f.close(); }
});

test("fresh Claude installation can return to its original official configuration", async () => {
  const f = fixture();
  try {
    const file = path.join(f.home, ".claude", "settings.json");
    const row = f.repository.create({ appId: "claude", name: "Relay",
      settingsConfig: { env: { ANTHROPIC_BASE_URL: "https://relay.example",
        ANTHROPIC_AUTH_TOKEN: "secret" } } });
    await f.activation.activate(row.id);
    await f.activation.restoreOriginal("claude");
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(text, /secret|relay\.example/);
    assert.equal(f.activation.status("claude").activeId, null);
  } finally { f.close(); }
});

test("rejects an external config edit and leaves the active pointer untouched", async () => {
  const f = fixture();
  try {
    const file = path.join(f.home, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, '{"env":{}}');
    const a = f.repository.create({ appId: "claude", name: "A", settingsConfig: { env: { ANTHROPIC_AUTH_TOKEN: "a" } } });
    const b = f.repository.create({ appId: "claude", name: "B", settingsConfig: { env: { ANTHROPIC_AUTH_TOKEN: "b" } } });
    await f.activation.activate(a.id);
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('"a"', '"external"'));
    await assert.rejects(() => f.activation.activate(b.id), /conflict/i);
    assert.equal(f.repository.getActive("claude").providerId, a.id);
    assert.match(fs.readFileSync(file, "utf8"), /external/);
  } finally { f.close(); }
});

test("an unrelated Claude Hook edit survives the next provider switch", async () => {
  const f = fixture();
  try {
    const file = path.join(f.home, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, '{"env":{}}');
    const a = f.repository.create({ appId: "claude", name: "A", settingsConfig: { env: { ANTHROPIC_AUTH_TOKEN: "a" } } });
    const b = f.repository.create({ appId: "claude", name: "B", settingsConfig: { env: { ANTHROPIC_AUTH_TOKEN: "b" } } });
    await f.activation.activate(a.id);
    const live = JSON.parse(fs.readFileSync(file, "utf8"));
    live.hooks = { SessionStart: ["mobi"] };
    fs.writeFileSync(file, JSON.stringify(live));
    assert.equal(f.activation.status("claude").conflict, false);
    await f.activation.activate(b.id);
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).hooks.SessionStart[0], "mobi");
  } finally { f.close(); }
});

test("Codex activation routes the key in TOML and leaves OAuth refresh token intact", async () => {
  const f = fixture();
  try {
    const dir = path.join(f.home, ".codex");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "config.toml"), '# keep\nmodel = "old"\n[mcp_servers.mobi]\ncommand = "hook"\n');
    fs.writeFileSync(path.join(dir, "auth.json"), '{"tokens":{"refresh_token":"oauth"}}');
    const row = f.repository.create({ appId: "codex", name: "Relay", settingsConfig: {
      auth: { OPENAI_API_KEY: "secret" },
      config: 'model_provider = "custom"\nmodel = "new"\n[model_providers.custom]\nbase_url = "https://relay.example/v1"\nwire_api = "responses"',
    } });
    await f.activation.activate(row.id);
    const toml = fs.readFileSync(path.join(dir, "config.toml"), "utf8");
    assert.match(toml, /experimental_bearer_token = "secret"/);
    assert.match(toml, /mcp_servers\.mobi/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "auth.json"))).tokens.refresh_token, "oauth");
  } finally { f.close(); }
});

test("coexisting accounts add independently and removal keeps the other account", async () => {
  const f = fixture();
  try {
    const first = f.repository.create({ appId: "opencode", name: "One", settingsConfig: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://one.test", apiKey: "one" } } });
    const second = f.repository.create({ appId: "opencode", name: "Two", settingsConfig: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://two.test", apiKey: "two" } } });
    await f.activation.addToLive(first.id);
    await f.activation.addToLive(second.id);
    const file = path.join(f.home, ".config", "opencode", "opencode.json");
    assert.deepEqual(f.repository.getEnabled("opencode"), [first.id, second.id]);
    assert.equal(JSON.parse(fs.readFileSync(file)).provider[first.id].options.apiKey, "one");
    await f.activation.removeFromLive(first.id);
    assert.deepEqual(f.repository.getEnabled("opencode"), [second.id]);
    assert.equal(JSON.parse(fs.readFileSync(file)).provider[first.id], undefined);
    assert.equal(JSON.parse(fs.readFileSync(file)).provider[second.id].options.apiKey, "two");
  } finally { f.close(); }
});

test("coexisting provider uses its chosen native key for add and remove", async () => {
  const f = fixture();
  try {
    const row = f.repository.create({ appId: "opencode", name: "One",
      metadata: { providerKey: "my-gateway" },
      settingsConfig: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://one.test", apiKey: "one" } } });
    await f.activation.addToLive(row.id);
    const file = path.join(f.home, ".config", "opencode", "opencode.json");
    assert.equal(JSON.parse(fs.readFileSync(file)).provider["my-gateway"].options.apiKey, "one");
    assert.equal(JSON.parse(fs.readFileSync(file)).provider[row.id], undefined);
    await f.activation.removeFromLive(row.id);
    assert.equal(JSON.parse(fs.readFileSync(file)).provider["my-gateway"], undefined);
  } finally { f.close(); }
});

test("coexisting providers cannot share a native key", async () => {
  const f = fixture();
  try {
    const config = { npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://one.test", apiKey: "one" } };
    const first = f.repository.create({ appId: "opencode", name: "One",
      metadata: { providerKey: "shared" }, settingsConfig: config });
    const second = f.repository.create({ appId: "opencode", name: "Two",
      metadata: { providerKey: "shared" }, settingsConfig: config });
    await f.activation.addToLive(first.id);
    await assert.rejects(() => f.activation.addToLive(second.id), /config key|already|duplicate/i);
    assert.deepEqual(f.repository.getEnabled("opencode"), [first.id]);
  } finally { f.close(); }
});

test("removes a legacy enabled provider using its original internal ID", async () => {
  const f = fixture();
  try {
    const config = { npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://old.test", apiKey: "old" } };
    const row = f.repository.create({ appId: "opencode", name: "Legacy",
      metadata: { providerKey: "new-name" }, settingsConfig: config });
    const adapter = createCoexistingAdapter("opencode", { fs, home: f.home });
    const change = adapter.planAdd({ providerId: row.id, config, currentBytes: null })[0];
    fs.mkdirSync(path.dirname(change.path), { recursive: true });
    fs.writeFileSync(change.path, change.nextBytes);
    f.repository.setEnabled("opencode", [row.id]);
    await f.activation.removeFromLive(row.id);
    assert.equal(JSON.parse(fs.readFileSync(change.path)).provider[row.id], undefined);
    assert.deepEqual(f.repository.getEnabled("opencode"), []);
  } finally { f.close(); }
});

test("removing an inactive provider leaves an unrelated native entry intact", async () => {
  const f = fixture();
  try {
    const config = { npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://other.test", apiKey: "other" } };
    const row = f.repository.create({ appId: "opencode", name: "Saved",
      metadata: { providerKey: "other-tool" }, settingsConfig: config });
    const adapter = createCoexistingAdapter("opencode", { fs, home: f.home });
    const change = adapter.planAdd({ providerId: "other-tool", config, currentBytes: null })[0];
    fs.mkdirSync(path.dirname(change.path), { recursive: true });
    fs.writeFileSync(change.path, change.nextBytes);
    await f.activation.removeFromLive(row.id);
    assert.equal(JSON.parse(fs.readFileSync(change.path)).provider["other-tool"].options.apiKey, "other");
  } finally { f.close(); }
});

test("joining a matching external provider does not claim ownership", async () => {
  const f = fixture();
  try {
    const config = { npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://other.test", apiKey: "other" } };
    const row = f.repository.create({ appId: "opencode", name: "Saved",
      metadata: { providerKey: "external" }, settingsConfig: config });
    const adapter = createCoexistingAdapter("opencode", { fs, home: f.home });
    const change = adapter.planAdd({ providerId: "external", config, currentBytes: null })[0];
    fs.mkdirSync(path.dirname(change.path), { recursive: true });
    fs.writeFileSync(change.path, change.nextBytes);
    await assert.rejects(() => f.activation.addToLive(row.id), /already exists|conflict/i);
    assert.deepEqual(f.repository.getEnabled("opencode"), []);
    await f.activation.removeFromLive(row.id);
    assert.deepEqual(JSON.parse(fs.readFileSync(change.path)).provider.external, config);
  } finally { f.close(); }
});

test("Grok Build activation converts a saved preset and restores original config", async () => {
  const f = fixture();
  try {
    const file = path.join(f.home, ".grok", "config.toml");
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, '[mcp_servers.keep]\ncommand = "hook"\n');
    const row = f.repository.create({ appId: "grokbuild", name: "Relay", settingsConfig: {
      auth: { OPENAI_API_KEY: "secret" },
      config: 'model_provider = "custom"\nmodel = "grok-4.5"\n[model_providers.custom]\nname = "Relay"\nbase_url = "https://relay.test/v1"\nwire_api = "responses"',
    } });
    await f.activation.activate(row.id);
    assert.match(fs.readFileSync(file, "utf8"), /api_key = "secret"/);
    await f.activation.restoreOriginal("grokbuild");
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /api_key = "secret"/);
    assert.match(fs.readFileSync(file, "utf8"), /mcp_servers\.keep/);
  } finally { f.close(); }
});

test("Claude Desktop activation publishes four files and restore recovers previous library", async () => {
  const f = fixture();
  try {
    const meta = path.join(f.home, ".config", "Claude-3p", "configLibrary", "_meta.json");
    fs.mkdirSync(path.dirname(meta), { recursive: true });
    fs.writeFileSync(meta, '{"entries":[{"id":"other","name":"Other"}],"appliedId":"other"}');
    const row = f.repository.create({ appId: "claude-desktop", name: "Relay", settingsConfig: {
      mode: "direct", baseUrl: "https://relay.test", apiKey: "secret", apiFormat: "anthropic",
    } });
    await f.activation.activate(row.id);
    assert.equal(JSON.parse(fs.readFileSync(meta)).entries.length, 2);
    await f.activation.restoreOriginal("claude-desktop");
    assert.equal(JSON.parse(fs.readFileSync(meta)).entries.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(meta)).appliedId, "other");
  } finally { f.close(); }
});
