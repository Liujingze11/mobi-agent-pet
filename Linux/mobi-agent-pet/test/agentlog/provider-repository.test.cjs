"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { openAgentLogDatabase } = require("../../runtime/agentlog/storage/database.cjs");
const { createProviderVault } = require("../../runtime/agentlog/providers/vault.cjs");
const { createProviderRepository } = require("../../runtime/agentlog/providers/repository.cjs");

function fixture(backend = "gnome_libsecret") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-providers-"));
  const db = openAgentLogDatabase({ databasePath: path.join(directory, "data.db") });
  const safeStorage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => backend,
    encryptString: (value) => Buffer.from(Buffer.from(value, "utf8").toString("base64"), "utf8"),
    decryptString: (buffer) => Buffer.from(buffer.toString("utf8"), "base64").toString("utf8"),
  };
  let nextId = 0;
  const vault = createProviderVault({ safeStorage });
  const repo = createProviderRepository(db, { createId: () => `provider-${++nextId}`, vault, now: () => 1000 });
  return { db, directory, repo, vault, close() { db.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}

test("stores arbitrary nested credentials as ciphertext and returns redacted summaries", () => {
  const f = fixture();
  try {
    const added = f.repo.create({
      appId: "claude", name: "Example", presetId: "claude:002",
      settingsConfig: { env: { ANTHROPIC_AUTH_TOKEN: "key-secret" }, extra: { Authorization: "Bearer nested-secret" } },
    });
    assert.equal(added.appId, "claude");
    assert.equal(JSON.stringify(f.repo.list("claude")).includes("secret"), false);
    assert.equal(JSON.stringify(f.repo.list("claude")).includes("settingsConfig"), false);
    assert.equal(JSON.stringify(f.repo.getDraft(added.id)).includes("key-secret"), true);
    assert.equal(fs.readFileSync(path.join(f.directory, "data.db")).includes("nested-secret"), false);
    assert.equal(fs.readFileSync(path.join(f.directory, "data.db")).includes("key-secret"), false);
    const updated = f.repo.update(added.id, { name: "Renamed" });
    assert.equal(updated.name, "Renamed");
    assert.equal(f.repo.getDraft(added.id).settingsConfig.env.ANTHROPIC_AUTH_TOKEN, "key-secret");
    assert.equal(f.repo.remove(added.id), true);
    assert.equal(f.repo.getDraft(added.id), null);
  } finally { f.close(); }
});

test("basic_text refuses credentialed records atomically", () => {
  const f = fixture("basic_text");
  try {
    assert.equal(f.vault.canStoreSecrets(), false);
    assert.throws(() => f.repo.create({ appId: "codex", name: "Keyed", settingsConfig: { auth: { OPENAI_API_KEY: "secret" } } }), /secure storage/i);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM providers").get().count, 0);
  } finally { f.close(); }
});

test("basic_text permits only exact known keyless official profiles", () => {
  const f = fixture("basic_text");
  try {
    const row = f.repo.create({ appId: "claude", name: "Claude Official", presetId: "claude:001", settingsConfig: { env: {} } });
    assert.deepEqual(f.repo.getDraft(row.id).settingsConfig, { env: {} });
    assert.throws(() => f.repo.create({ appId: "claude", name: "Unsafe", presetId: "claude:001", settingsConfig: { env: { ANTHROPIC_AUTH_TOKEN: "secret" } } }), /secure storage/i);
    assert.equal(f.repo.list("claude").length, 1);
  } finally { f.close(); }
});

test("supports every CC Switch tool ID and rejects other IDs", () => {
  const f = fixture();
  try {
    for (const appId of ["claude", "codex", "gemini", "grokbuild", "claude-desktop", "opencode", "openclaw", "hermes", "pi", "mcode"]) {
      f.repo.create({ appId, name: appId, settingsConfig: {} });
      assert.equal(f.repo.list(appId).length, 1);
    }
    assert.throws(() => f.repo.create({ appId: "unknown", name: "oops", settingsConfig: {} }), /appId/i);
  } finally { f.close(); }
});

test("universal gateway derives only Claude, Codex and Gemini and keeps them in sync", () => {
  const f = fixture();
  try {
    const source = f.repo.create({ appId: "universal", name: "Gateway", presetId: "universal:001", settingsConfig: {
      baseUrl: "https://example.com/v1", apiKey: "secret-key",
      apps: { claude: true, codex: true, gemini: true },
      models: { claude: { model: "c-model" }, codex: { model: "o-model" }, gemini: { model: "g-model" } },
    } });
    for (const appId of ["claude", "codex", "gemini"]) {
      const rows = f.repo.list(appId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].universalSourceId, source.id);
    }
    assert.equal(f.repo.list("opencode").length, 0);
    assert.equal(f.repo.getDraft(f.repo.list("claude")[0].id).settingsConfig.env.ANTHROPIC_MODEL, "c-model");
    const codex = f.repo.list("codex")[0];
    f.repo.update(source.id, { name: "Gateway 2", settingsConfig: {
      ...f.repo.getDraft(source.id).settingsConfig,
      baseUrl: "https://new.example.com/v1",
    } });
    assert.equal(f.repo.list("codex")[0].id, codex.id);
    assert.match(f.repo.getDraft(codex.id).settingsConfig.config, /new\.example\.com/);
    f.repo.remove(source.id);
    assert.equal(f.repo.list("claude").length, 0);
    assert.equal(f.repo.list("codex").length, 0);
  } finally { f.close(); }
});

test("tracks one active switching profile and independent coexisting profiles", () => {
  const f = fixture();
  try {
    const a = f.repo.create({ appId: "claude", name: "A", settingsConfig: { env: { ANTHROPIC_AUTH_TOKEN: "a" } } });
    const b = f.repo.create({ appId: "claude", name: "B", settingsConfig: { env: { ANTHROPIC_AUTH_TOKEN: "b" } } });
    assert.equal(f.repo.getConfigInternal(a.id).env.ANTHROPIC_AUTH_TOKEN, "a");
    f.repo.setActive("claude", a.id, { "/tmp/settings.json": "hash-a" });
    f.repo.setActive("claude", b.id, { "/tmp/settings.json": "hash-b" });
    assert.equal(f.repo.getActive("claude").providerId, b.id);
    assert.equal(f.repo.getActive("claude").hashes["/tmp/settings.json"], "hash-b");
    const first = f.repo.create({ appId: "opencode", name: "One", settingsConfig: {} });
    const second = f.repo.create({ appId: "opencode", name: "Two", settingsConfig: {} });
    f.repo.setEnabled("opencode", [first.id, second.id]);
    assert.deepEqual(f.repo.getEnabled("opencode"), [first.id, second.id]);
    f.repo.setOriginal("claude", { files: { settings: "original" } });
    assert.deepEqual(f.repo.getOriginal("claude"), { files: { settings: "original" } });
  } finally { f.close(); }
});

test("reorders providers within one Agent and preserves their order after reopening", () => {
  const f = fixture();
  try {
    const a = f.repo.create({ appId: "claude", name: "A", settingsConfig: {} });
    const b = f.repo.create({ appId: "claude", name: "B", settingsConfig: {} });
    f.repo.create({ appId: "codex", name: "Other", settingsConfig: {} });
    f.repo.move(b.id, a.id);
    assert.deepEqual(f.repo.list("claude").map((row) => row.id), [b.id, a.id]);
    const vault = f.vault;
    const reopened = createProviderRepository(f.db, { createId: () => "unused", vault });
    assert.deepEqual(reopened.list("claude").map((row) => row.id), [b.id, a.id]);
    assert.deepEqual(reopened.list("codex").map((row) => row.name), ["Other"]);
    const c = f.repo.create({ appId: "claude", name: "C", settingsConfig: {} });
    const beforeSelf = f.repo.list("claude").map((row) => row.id);
    f.repo.move(b.id, b.id);
    assert.deepEqual(f.repo.list("claude").map((row) => row.id), beforeSelf);
    assert.ok(c.id);
    assert.throws(() => f.repo.move(a.id, "missing"), /provider|target/i);
  } finally { f.close(); }
});

test("retains native config keys when updating the enabled provider list", () => {
  const f = fixture();
  try {
    const a = f.repo.create({ appId: "opencode", name: "A", settingsConfig: {} });
    const b = f.repo.create({ appId: "opencode", name: "B", settingsConfig: {} });
    f.repo.setEnabled("opencode", [a.id], { [a.id]: "gateway-a" });
    f.repo.setEnabled("opencode", [a.id, b.id], { [b.id]: "gateway-b" });
    const reopened = createProviderRepository(f.db, { createId: () => "unused", vault: f.vault });
    assert.deepEqual(reopened.getEnabledKeys("opencode"), { [a.id]: "gateway-a", [b.id]: "gateway-b" });
  } finally { f.close(); }
});

test("supplier card summaries reveal only API hosts and known model fields", () => {
  const f = fixture();
  try {
    f.repo.create({ appId: "claude", name: "Claude Gateway", settingsConfig: { env: {
      ANTHROPIC_BASE_URL: "https://secret-user:secret-pass@relay.test/path-secret?key=query-secret",
      ANTHROPIC_AUTH_TOKEN: "key-secret", ANTHROPIC_MODEL: "claude-sonnet-5",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-5" } } });
    f.repo.create({ appId: "codex", name: "OpenAI Gateway", settingsConfig: { auth: { OPENAI_API_KEY: "key-secret" },
      config: 'model_provider = "selected"\nmodel = "gpt-model"\n[model_providers.other]\nbase_url = "https://other.test"\n' +
        '[model_providers.selected]\nbase_url = "https://selected.test/v1"\nexperimental_bearer_token = "toml-secret"\n' } });
    f.repo.create({ appId: "claude-desktop", name: "Desktop Gateway", settingsConfig: {
      baseUrl: "https://desktop.test", apiKey: "key-secret", modelRoutes: [
        { routeId: "claude-sonnet-5", upstreamModel: "actual-model" },
      ] } });
    const claude = f.repo.list("claude")[0];
    assert.equal(claude.apiHost, "relay.test");
    assert.deepEqual(claude.modelNames, ["claude-sonnet-5", "claude-opus-5"]);
    assert.equal(f.repo.list("codex")[0].apiHost, "selected.test");
    assert.deepEqual(f.repo.list("codex")[0].modelNames, ["gpt-model"]);
    assert.deepEqual(f.repo.list("claude-desktop")[0].modelNames, ["actual-model"]);
    assert.equal(JSON.stringify(f.repo.list()).includes("secret"), false);
    assert.equal(JSON.stringify(f.repo.list()).includes("settingsConfig"), false);
  } finally { f.close(); }
});

test("supplier names remain readable when the credential store cannot decrypt details", () => {
  const f = fixture();
  try {
    const row = f.repo.create({ appId: "claude", name: "Saved Gateway", settingsConfig: {
      env: { ANTHROPIC_AUTH_TOKEN: "private", ANTHROPIC_BASE_URL: "https://relay.test" } } });
    f.vault.open = () => { throw new Error("Credential store locked"); };
    assert.equal(f.repo.list("claude")[0].name, "Saved Gateway");
    assert.equal(f.repo.list("claude")[0].apiHost, null);
    assert.throws(() => f.repo.getDraft(row.id), /locked/);
  } finally { f.close(); }
});
