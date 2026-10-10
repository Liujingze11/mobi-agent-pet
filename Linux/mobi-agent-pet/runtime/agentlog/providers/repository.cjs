"use strict";

const { isDeepStrictEqual } = require("node:util");
const { publicConnectionSummary } = require("./public-summary.cjs");

const APP_IDS = new Set([
  "claude", "codex", "gemini", "grokbuild", "claude-desktop",
  "opencode", "openclaw", "hermes", "pi", "mcode", "universal",
]);
const PUBLIC_OFFICIAL_CONFIGS = new Map([
  ["claude:claude:001", { env: {} }],
  ["codex:codex:001", { auth: {}, config: "" }],
  ["gemini:gemini:001", { env: {} }],
  ["claude-desktop:claude-desktop:001", {
    baseUrl: "", mode: "direct", apiFormat: "anthropic", apiKey: "", modelRoutes: [],
  }],
]);

function universalChildren(source, sourceId) {
  const config = source.settingsConfig;
  const apps = config.apps && typeof config.apps === "object" ? config.apps : {};
  const models = config.models && typeof config.models === "object" ? config.models : {};
  const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl : "";
  const apiKey = typeof config.apiKey === "string" ? config.apiKey : "";
  const children = [];
  if (apps.claude === true) {
    const model = models.claude || {};
    children.push({ appId: "claude", settingsConfig: { env: {
      ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_MODEL: model.model || "",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: model.haikuModel || "",
      ANTHROPIC_DEFAULT_SONNET_MODEL: model.sonnetModel || "",
      ANTHROPIC_DEFAULT_OPUS_MODEL: model.opusModel || "",
    } } });
  }
  if (apps.codex === true) {
    const model = models.codex || {};
    const toml = `model_provider = "mobi_gateway"\nmodel = ${JSON.stringify(model.model || "")}\nmodel_reasoning_effort = ${JSON.stringify(model.reasoningEffort || "high")}\n\n[model_providers.mobi_gateway]\nname = ${JSON.stringify(source.name)}\nbase_url = ${JSON.stringify(baseUrl)}\nwire_api = "responses"\nrequires_openai_auth = true`;
    children.push({ appId: "codex", settingsConfig: { auth: { OPENAI_API_KEY: apiKey }, config: toml } });
  }
  if (apps.gemini === true) {
    const model = models.gemini || {};
    children.push({ appId: "gemini", settingsConfig: { env: {
      GOOGLE_GEMINI_BASE_URL: baseUrl, GEMINI_API_KEY: apiKey, GEMINI_MODEL: model.model || "",
    } } });
  }
  return children.map((child) => ({
    ...child, name: source.name, presetId: null, websiteUrl: source.websiteUrl || "",
    metadata: { universalSourceId: sourceId }, activation: source.activation || "available",
    unavailableReason: source.unavailableReason || null, universalSourceId: sourceId,
  }));
}

function prepareForStorage(input, vault) {
  if (vault.canStoreSecrets()) return { payload: input, allowPlain: false };
  const approved = PUBLIC_OFFICIAL_CONFIGS.get(`${input.appId}:${input.presetId}`);
  if (!approved || !isDeepStrictEqual(input.settingsConfig, approved)) {
    throw new Error("Secure storage is unavailable");
  }
  return {
    payload: {
      appId: input.appId, name: input.name, presetId: input.presetId,
      settingsConfig: approved, websiteUrl: "", metadata: {},
      activation: "available", unavailableReason: null,
    },
    allowPlain: true,
  };
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("provider input is required");
  if (!APP_IDS.has(input.appId)) throw new TypeError("invalid appId");
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 200) throw new TypeError("invalid provider name");
  if (!input.settingsConfig || typeof input.settingsConfig !== "object" || Array.isArray(input.settingsConfig)) {
    throw new TypeError("settingsConfig must be an object");
  }
  if (input.presetId !== undefined && input.presetId !== null &&
    (typeof input.presetId !== "string" || input.presetId.length > 100)) throw new TypeError("invalid presetId");
  if (input.activation !== undefined && !["available", "unavailable"].includes(input.activation)) {
    throw new TypeError("invalid activation");
  }
  return input;
}

function createProviderRepository(db, { createId, vault, now = Date.now } = {}) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("database is required");
  if (typeof createId !== "function" || !vault) throw new TypeError("createId and vault are required");
  const summaryColumns = "id, app_id, name, preset_id, activation, unavailable_reason, universal_source_id, created_at, updated_at, config_cipher";
  const select = db.prepare("SELECT * FROM providers WHERE id = ?");
  const listRows = db.prepare(`SELECT ${summaryColumns} FROM providers WHERE app_id = ? ORDER BY sort_index, updated_at DESC, id`);
  const allRows = db.prepare(`SELECT ${summaryColumns} FROM providers ORDER BY app_id, sort_index, updated_at DESC, id`);
  const setSortIndex = db.prepare("UPDATE providers SET sort_index=? WHERE id=?");
  const insert = db.prepare("INSERT INTO providers(id,app_id,name,preset_id,activation,unavailable_reason,config_cipher,universal_source_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)");
  const change = db.prepare("UPDATE providers SET name=?,preset_id=?,activation=?,unavailable_reason=?,config_cipher=?,updated_at=? WHERE id=?");
  const drop = db.prepare("DELETE FROM providers WHERE id=?");
  const childRows = db.prepare("SELECT id, app_id FROM providers WHERE universal_source_id = ?");
  const activeRow = db.prepare("SELECT provider_id,last_hashes_json FROM provider_active WHERE app_id=?");
  const upsertActive = db.prepare("INSERT INTO provider_active(app_id,provider_id,last_hashes_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(app_id) DO UPDATE SET provider_id=excluded.provider_id,last_hashes_json=excluded.last_hashes_json,updated_at=excluded.updated_at");
  const enabledRows = db.prepare("SELECT provider_id,native_key FROM provider_enabled WHERE app_id=? ORDER BY rowid");
  const clearEnabled = db.prepare("DELETE FROM provider_enabled WHERE app_id=?");
  const insertEnabled = db.prepare("INSERT INTO provider_enabled(app_id,provider_id,native_key) VALUES(?,?,?)");
  const originalRow = db.prepare("SELECT config_cipher FROM provider_originals WHERE app_id=?");
  const insertOriginal = db.prepare("INSERT OR IGNORE INTO provider_originals(app_id,config_cipher,created_at) VALUES(?,?,?)");

  function mapSummary(row, draft) {
    if (!row) return null;
    let payload = draft;
    if (!payload) {
      try { payload = vault.open(row.config_cipher); }
      catch { payload = { settingsConfig: {} }; }
    }
    return {
      id: row.id, appId: row.app_id, name: row.name,
      presetId: row.preset_id, activation: row.activation,
      unavailableReason: row.unavailable_reason,
      universalSourceId: row.universal_source_id,
      createdAt: row.created_at, updatedAt: row.updated_at,
      ...publicConnectionSummary(row.app_id, payload.settingsConfig),
    };
  }

  function list(scope) {
    if (scope !== undefined && !APP_IDS.has(scope)) throw new TypeError("invalid appId");
    return (scope ? listRows.all(scope) : allRows.all()).map((row) => mapSummary(row));
  }

  function getDraft(id) {
    const row = select.get(id);
    if (!row) return null;
    const draft = vault.open(row.config_cipher);
    return { ...draft, ...mapSummary(row, draft) };
  }

  function create(input) {
    validateInput(input);
    const id = createId();
    const timestamp = Math.trunc(now());
    db.transaction(() => {
      insertOne(id, input, timestamp);
      if (input.appId === "universal") synchronizeUniversal(id, input, timestamp);
    })();
    return mapSummary(select.get(id));
  }

  function insertOne(id, input, timestamp) {
    const storage = prepareForStorage(input, vault);
    const cipher = vault.seal(storage.payload, { allowPlain: storage.allowPlain });
    insert.run(id, input.appId, input.name.trim(), input.presetId || null,
      input.activation || "available", input.unavailableReason || null, cipher,
      input.universalSourceId || null, timestamp, timestamp);
  }

  function synchronizeUniversal(sourceId, source, timestamp) {
    const existing = new Map(childRows.all(sourceId).map((row) => [row.app_id, row.id]));
    for (const child of universalChildren(source, sourceId)) {
      const childId = existing.get(child.appId);
      if (childId) {
        const storage = prepareForStorage(child, vault);
        const cipher = vault.seal(storage.payload, { allowPlain: storage.allowPlain });
        change.run(child.name.trim(), child.presetId, child.activation,
          child.unavailableReason, cipher, timestamp, childId);
        existing.delete(child.appId);
      } else insertOne(createId(), child, timestamp);
    }
    for (const staleId of existing.values()) drop.run(staleId);
  }

  function update(id, input) {
    const old = getDraft(id);
    if (!old) return null;
    const next = { ...old, ...input, appId: old.appId,
      settingsConfig: input.settingsConfig === undefined ? old.settingsConfig : input.settingsConfig };
    validateInput(next);
    db.transaction(() => {
      const storage = prepareForStorage(next, vault);
      const cipher = vault.seal(storage.payload, { allowPlain: storage.allowPlain });
      const timestamp = Math.trunc(now());
      change.run(next.name.trim(), next.presetId || null,
        next.activation || "available", next.unavailableReason || null,
        cipher, timestamp, id);
      if (next.appId === "universal") synchronizeUniversal(id, next, timestamp);
    })();
    return mapSummary(select.get(id));
  }

  function remove(id) {
    return db.transaction(() => drop.run(id).changes > 0)();
  }

  function move(id, beforeId = null) {
    const row = select.get(id);
    if (!row) throw new TypeError("provider not found");
    if (beforeId === id) return list(row.app_id);
    if (beforeId !== null) {
      const target = select.get(beforeId);
      if (!target || target.app_id !== row.app_id) throw new TypeError("target provider is invalid");
    }
    const ids = list(row.app_id).map((item) => item.id).filter((item) => item !== id);
    const index = beforeId === null ? ids.length : ids.indexOf(beforeId);
    ids.splice(index, 0, id);
    db.transaction(() => ids.forEach((item, position) => setSortIndex.run(position, item)))();
    return list(row.app_id);
  }

  function getConfigInternal(providerId) {
    return getDraft(providerId)?.settingsConfig || null;
  }

  function getActive(targetAppId) {
    if (!APP_IDS.has(targetAppId)) throw new TypeError("invalid appId");
    const row = activeRow.get(targetAppId);
    return row ? { providerId: row.provider_id, hashes: JSON.parse(row.last_hashes_json) } : null;
  }

  function setActive(targetAppId, providerId, hashes = {}) {
    if (!APP_IDS.has(targetAppId)) throw new TypeError("invalid appId");
    if (providerId !== null) {
      const row = select.get(providerId);
      if (!row || row.app_id !== targetAppId) throw new TypeError("provider does not belong to appId");
    }
    upsertActive.run(targetAppId, providerId, JSON.stringify(hashes), Math.trunc(now()));
    return getActive(targetAppId);
  }

  function getEnabled(targetAppId) {
    if (!APP_IDS.has(targetAppId)) throw new TypeError("invalid appId");
    return enabledRows.all(targetAppId).map((row) => row.provider_id);
  }

  function getEnabledKeys(targetAppId) {
    if (!APP_IDS.has(targetAppId)) throw new TypeError("invalid appId");
    return Object.fromEntries(enabledRows.all(targetAppId).map((row) => [row.provider_id, row.native_key || row.provider_id]));
  }

  function setEnabled(targetAppId, providerIds, nativeKeys = {}) {
    if (!APP_IDS.has(targetAppId) || !Array.isArray(providerIds)) throw new TypeError("invalid enabled profiles");
    db.transaction(() => {
      const previous = getEnabledKeys(targetAppId);
      clearEnabled.run(targetAppId);
      for (const providerId of new Set(providerIds)) {
        const row = select.get(providerId);
        if (!row || row.app_id !== targetAppId) throw new TypeError("provider does not belong to appId");
        const key = nativeKeys[providerId] || previous[providerId] || providerId;
        if (typeof key !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new TypeError("invalid provider config key");
        insertEnabled.run(targetAppId, providerId, key);
      }
    })();
    return getEnabled(targetAppId);
  }

  function getOriginal(targetAppId) {
    const row = originalRow.get(targetAppId);
    return row ? vault.open(row.config_cipher) : null;
  }

  function setOriginal(targetAppId, config) {
    if (!APP_IDS.has(targetAppId)) throw new TypeError("invalid appId");
    const cipher = vault.seal(config);
    insertOriginal.run(targetAppId, cipher, Math.trunc(now()));
    return getOriginal(targetAppId);
  }

  return { list, getDraft, create, update, remove, move,
    getConfigInternal, getActive, setActive, getEnabled, getEnabledKeys, setEnabled, getOriginal, setOriginal };
}

module.exports = { createProviderRepository };
