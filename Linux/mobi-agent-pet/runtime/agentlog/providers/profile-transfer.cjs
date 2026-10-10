"use strict";

const { parse: parseToml, stringify: stringifyToml } = require("smol-toml");

const APP_IDS = new Set([
  "claude", "codex", "gemini", "grokbuild", "claude-desktop",
  "opencode", "openclaw", "hermes", "pi", "mcode", "universal",
]);
const OBJECT_KEYS = new Set(["env", "options", "apps", "models", "modelRoutes", "limit", "modalities", "cost"]);
const VALUE_KEYS = new Set([
  "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "GOOGLE_GEMINI_BASE_URL", "GEMINI_MODEL", "baseUrl", "baseURL", "base_url",
  "model", "modelName", "name", "npm", "kind", "mode", "api", "apiFormat",
  "providerType", "enabled", "routeId", "upstreamModel", "labelOverride",
  "contextWindow", "maxTokens", "reasoning", "input", "output", "setCacheKey",
  "claude", "codex", "gemini", "haikuModel", "sonnetModel", "opusModel",
  "reasoningEffort", "id", "context", "cacheRead", "cacheWrite",
  "api_mode", "context_length", "rate_limit_delay",
]);
const FORMAT = "mobi-providers-public-v1";
const NATIVE_KEY_APPS = new Set(["opencode", "openclaw", "hermes", "pi", "mcode"]);
const NATIVE_KEY = /^[A-Za-z0-9_-]{1,128}$/;
const PRIVATE_KEY = /^(?:__proto__|prototype|constructor|api[_-]?key|authorization|password|secret|token|access[_-]?token|auth[_-]?token)$/i;
const TOML_ROOT_FIELDS = ["model_provider", "model", "model_reasoning_effort", "disable_response_storage",
  "model_context_window", "model_max_output_tokens"];
const TOML_ROUTE_FIELDS = ["name", "model", "base_url", "wire_api", "requires_openai_auth", "api_backend", "context_window"];

function publicToml(text) {
  if (typeof text !== "string" || text.length > 64000) return undefined;
  let doc;
  try { doc = parseToml(text); } catch { return undefined; }
  const result = {};
  const copyScalar = (source, target, key) => {
    if (!["string", "number", "boolean"].includes(typeof source?.[key])) return;
    const value = publicConfig(source[key], key);
    if (value !== undefined) target[key] = value;
  };
  for (const key of TOML_ROOT_FIELDS) copyScalar(doc, result, key);
  for (const section of ["model_providers", "model"]) {
    const tables = doc[section];
    if (!tables || typeof tables !== "object" || Array.isArray(tables)) continue;
    const next = {};
    for (const [key, table] of Object.entries(tables)) {
      if (PRIVATE_KEY.test(key) || !/^[a-zA-Z0-9_.:/-]{1,128}$/.test(key) || !table ||
          typeof table !== "object" || Array.isArray(table)) continue;
      const route = {};
      for (const field of TOML_ROUTE_FIELDS) copyScalar(table, route, field);
      next[key] = route;
    }
    result[section] = next;
  }
  if (typeof doc.models?.default === "string") {
    const selected = publicConfig(doc.models.default, "default");
    if (selected !== undefined) result.models = { default: selected };
  }
  return stringifyToml(result);
}

function safeUrl(value) {
  if (value === "") return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return undefined;
    return url.toString();
  } catch { return undefined; }
}

function publicConfig(value, parentKey = "", depth = 0) {
  if (depth > 10) return undefined;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => publicConfig(item, parentKey, depth + 1))
    .filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_KEY.test(key)) continue;
      if (key === "config" && depth === 0) {
        const safe = publicToml(item);
        if (safe !== undefined) result.config = safe;
        continue;
      }
      const modelEntry = parentKey === "models" && /^[a-zA-Z0-9_.:/-]{1,128}$/.test(key)
        && item && typeof item === "object" && !Array.isArray(item);
      if (!OBJECT_KEYS.has(key) && !VALUE_KEYS.has(key) && !modelEntry) continue;
      const safe = publicConfig(item, key, depth + 1);
      if (safe !== undefined) result[key] = safe;
    }
    return result;
  }
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== "string" || value.length > 512 || /[\r\n]/.test(value)) return undefined;
  if (/url|endpoint/i.test(parentKey)) return safeUrl(value);
  if (/bearer\s|\bsk-[a-zA-Z0-9]{8,}/i.test(value)) return undefined;
  return value;
}

function validEntry(item) {
  if (!item || typeof item !== "object" || Array.isArray(item) || !APP_IDS.has(item.appId)) {
    throw new TypeError("invalid provider appId");
  }
  if (typeof item.sourceId !== "string" || !item.sourceId || item.sourceId.length > 128 ||
      typeof item.name !== "string" || !item.name.trim() || item.name.length > 200 ||
      (item.presetId !== null && (typeof item.presetId !== "string" || item.presetId.length > 100)) ||
      !item.settingsConfig || typeof item.settingsConfig !== "object" || Array.isArray(item.settingsConfig)) {
    throw new TypeError("invalid provider import entry");
  }
  if (item.providerKey !== undefined && (!NATIVE_KEY_APPS.has(item.appId) ||
      typeof item.providerKey !== "string" || !NATIVE_KEY.test(item.providerKey))) {
    throw new TypeError("invalid provider config key");
  }
  return { sourceId: item.sourceId, appId: item.appId, name: item.name.trim(),
    presetId: item.presetId, settingsConfig: publicConfig(item.settingsConfig),
    providerKey: item.providerKey };
}

function createProviderProfileTransfer({ repository, db } = {}) {
  if (!repository || !db) throw new TypeError("repository and db are required");
  function exportData() {
    return { format: FORMAT, providers: repository.list().filter((row) => !row.universalSourceId)
      .map((row) => {
        const draft = repository.getDraft(row.id);
        const providerKey = draft.metadata?.providerKey;
        return { sourceId: row.id, appId: row.appId, name: row.name,
          presetId: row.presetId, settingsConfig: publicConfig(draft.settingsConfig),
          ...(NATIVE_KEY_APPS.has(row.appId) && typeof providerKey === "string" && NATIVE_KEY.test(providerKey)
            ? { providerKey } : {}) };
      }) };
  }
  function importData(document) {
    if (!document || document.format !== FORMAT || !Array.isArray(document.providers) ||
        document.providers.length > 500 || JSON.stringify(document).length > 2_000_000) {
      throw new TypeError("invalid provider import document");
    }
    const entries = document.providers.map(validEntry);
    const keys = new Set();
    for (const entry of entries) {
      const key = `${entry.appId}:${entry.sourceId}`;
      if (keys.has(key)) throw new TypeError("duplicate provider import entry");
      keys.add(key);
    }
    const existing = new Set();
    const local = new Map();
    for (const row of repository.list()) {
      const draft = repository.getDraft(row.id);
      if (draft.metadata?.importSourceId) existing.add(`${row.appId}:${draft.metadata.importSourceId}`);
      else local.set(`${row.appId}:${row.id}`, row);
    }
    return db.transaction(() => {
      let added = 0;
      let skipped = 0;
      for (const entry of entries) {
        const key = `${entry.appId}:${entry.sourceId}`;
        const sameLocal = local.get(key);
        if (existing.has(key) || (sameLocal && sameLocal.name === entry.name &&
          sameLocal.presetId === entry.presetId)) { skipped += 1; continue; }
        repository.create({ appId: entry.appId, name: entry.name,
          presetId: entry.presetId, settingsConfig: entry.settingsConfig,
          activation: "unavailable", unavailableReason: "导入后请检查配置并补齐凭据",
          metadata: { importSourceId: entry.sourceId,
            ...(entry.providerKey ? { providerKey: entry.providerKey } : {}) } });
        existing.add(key);
        added += 1;
      }
      return { added, skipped };
    })();
  }
  return { exportData, importData };
}

module.exports = { createProviderProfileTransfer, publicConfig, FORMAT };
