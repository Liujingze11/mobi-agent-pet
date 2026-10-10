"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { openAgentLogDatabase } = require("../../runtime/agentlog/storage/database.cjs");
const { createProviderVault } = require("../../runtime/agentlog/providers/vault.cjs");
const { createProviderRepository } = require("../../runtime/agentlog/providers/repository.cjs");

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-provider-transfer-"));
  const db = openAgentLogDatabase({ databasePath: path.join(home, "store.db") });
  const vault = createProviderVault({ safeStorage: {
    isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: (value) => Buffer.from(Buffer.from(value).toString("base64")),
    decryptString: (value) => Buffer.from(value.toString(), "base64").toString(),
  } });
  let sequence = 0;
  const repository = createProviderRepository(db, { createId: () => `p${++sequence}`, vault });
  return { home, db, repository, close() { db.close(); fs.rmSync(home, { recursive: true, force: true }); } };
}

test("default provider export excludes nested credentials and imports only reviewed drafts", () => {
  const { createProviderProfileTransfer } = (() => {
    try { return require("../../runtime/agentlog/providers/profile-transfer.cjs"); } catch { return {}; }
  })();
  assert.equal(typeof createProviderProfileTransfer, "function");
  const source = fixture();
  const destination = fixture();
  try {
    source.repository.create({ appId: "claude", name: "Relay", presetId: "claude:002",
      settingsConfig: { env: { ANTHROPIC_BASE_URL: "https://relay.example/v1",
        ANTHROPIC_AUTH_TOKEN: "top-secret" }, nested: { unknown: "nested-secret" } } });
    const exported = createProviderProfileTransfer({ repository: source.repository, db: source.db }).exportData();
    assert.equal(JSON.stringify(exported).includes("top-secret"), false);
    assert.equal(JSON.stringify(exported).includes("nested-secret"), false);
    assert.equal(exported.providers.length, 1);
    const transfer = createProviderProfileTransfer({ repository: destination.repository, db: destination.db });
    assert.deepEqual(transfer.importData(exported), { added: 1, skipped: 0 });
    const imported = destination.repository.list("claude")[0];
    assert.equal(imported.activation, "unavailable");
    assert.match(imported.unavailableReason, /检查|review/i);
    assert.equal(destination.repository.getDraft(imported.id).settingsConfig.env.ANTHROPIC_BASE_URL,
      "https://relay.example/v1");
    assert.deepEqual(transfer.importData(exported), { added: 0, skipped: 1 });
    assert.throws(() => transfer.importData({ ...exported, providers: [{ ...exported.providers[0],
      appId: "unknown", sourceId: "new" }] }), /appId|tool/i);
    assert.equal(destination.repository.list("claude").length, 1);
  } finally { source.close(); destination.close(); }
});

test("an unrelated local provider with the same generated ID does not suppress an import", () => {
  const { createProviderProfileTransfer } = require("../../runtime/agentlog/providers/profile-transfer.cjs");
  const f = fixture();
  try {
    f.repository.create({ appId: "claude", name: "Local", settingsConfig: {} });
    const document = { format: "mobi-providers-public-v1", providers: [{
      sourceId: "p1", appId: "claude", name: "From another machine", presetId: null,
      settingsConfig: { env: {} },
    }] };
    const result = createProviderProfileTransfer({ repository: f.repository, db: f.db }).importData(document);
    assert.deepEqual(result, { added: 1, skipped: 0 });
    assert.equal(f.repository.list("claude").length, 2);
  } finally { f.close(); }
});

test("import strips credential fields from a forged public backup", () => {
  const { createProviderProfileTransfer } = require("../../runtime/agentlog/providers/profile-transfer.cjs");
  const f = fixture();
  try {
    const transfer = createProviderProfileTransfer({ repository: f.repository, db: f.db });
    transfer.importData({ format: "mobi-providers-public-v1", providers: [{ sourceId: "outside",
      appId: "claude", name: "Relay", presetId: null, settingsConfig: { env: {
        ANTHROPIC_BASE_URL: "https://relay.example", ANTHROPIC_AUTH_TOKEN: "secret-in-file",
      }, custom: { deeplyNested: "another-secret" } },
    }] });
    const imported = f.repository.getDraft(f.repository.list("claude")[0].id);
    assert.equal(JSON.stringify(imported).includes("secret-in-file"), false);
    assert.equal(JSON.stringify(imported).includes("another-secret"), false);
    assert.equal(imported.settingsConfig.env.ANTHROPIC_BASE_URL, "https://relay.example/");
  } finally { f.close(); }
});

test("public backup preserves a coexisting provider's native key", () => {
  const { createProviderProfileTransfer } = require("../../runtime/agentlog/providers/profile-transfer.cjs");
  const source = fixture();
  const destination = fixture();
  try {
    source.repository.create({ appId: "opencode", name: "Relay", metadata: { providerKey: "relay-one" },
      settingsConfig: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://relay.example/v1",
        apiKey: "private" }, models: {} } });
    const exported = createProviderProfileTransfer({ repository: source.repository, db: source.db }).exportData();
    assert.equal(exported.providers[0].providerKey, "relay-one");
    createProviderProfileTransfer({ repository: destination.repository, db: destination.db }).importData(exported);
    const imported = destination.repository.getDraft(destination.repository.list("opencode")[0].id);
    assert.equal(imported.metadata.providerKey, "relay-one");
    assert.equal(JSON.stringify(exported).includes("private"), false);
  } finally { source.close(); destination.close(); }
});

test("public projection rejects credential fields disguised as model IDs", () => {
  const { publicConfig } = require("../../runtime/agentlog/providers/profile-transfer.cjs");
  const exported = publicConfig({ models: { apiKey: "dummy-credential-value",
    Authorization: "Basic dummy-credential-value", "normal-model": { name: "Normal" } } });
  assert.equal(JSON.stringify(exported).includes("dummy-credential-value"), false);
  assert.deepEqual(exported.models["normal-model"], { name: "Normal" });
});

test("public projection retains Hermes protocol", () => {
  const { publicConfig } = require("../../runtime/agentlog/providers/profile-transfer.cjs");
  assert.equal(publicConfig({ api_mode: "anthropic_messages" }).api_mode, "anthropic_messages");
});

test("public projection retains sanitized Codex and Grok TOML", () => {
  const { publicConfig } = require("../../runtime/agentlog/providers/profile-transfer.cjs");
  const { parse } = require("smol-toml");
  const config = publicConfig({ auth: { OPENAI_API_KEY: "auth-secret" }, config:
    'model_provider = "custom"\nmodel = "selected-model"\nmodel_reasoning_effort = "high"\n' +
    '[model_providers.custom]\nname = "Custom"\nbase_url = "https://relay.test/v1"\nwire_api = "responses"\n' +
    'experimental_bearer_token = "toml-secret"\nhttp_headers = { Authorization = "header-secret" }\n' });
  const doc = parse(config.config);
  assert.equal(doc.model_provider, "custom");
  assert.equal(doc.model, "selected-model");
  assert.equal(doc.model_providers.custom.base_url, "https://relay.test/v1");
  assert.equal(JSON.stringify(config).includes("secret"), false);
  const grok = publicConfig({ config: '[models]\ndefault = "route"\n[model.route]\nmodel = "grok-model"\n' +
    'base_url = "https://grok.test/v1"\napi_backend = "responses"\napi_key = "grok-secret"\n' });
  const grokDoc = parse(grok.config);
  assert.equal(grokDoc.models.default, "route");
  assert.equal(grokDoc.model.route.model, "grok-model");
  assert.equal(JSON.stringify(grok).includes("grok-secret"), false);
});
