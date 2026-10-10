"use strict";

// Adapted from CC Switch services/balance.rs. Copyright (c) 2025 Jason Young.
// MIT license in THIRD_PARTY_NOTICES.md. Host detection is exact here.
const { parse: parseToml } = require("smol-toml");
const { safeRequest } = require("./service.cjs");

const TEMPLATES = Object.freeze({
  "api.deepseek.com": { url: "https://api.deepseek.com/user/balance", type: "deepseek" },
  "api.stepfun.com": { url: "https://api.stepfun.com/v1/accounts", type: "stepfun" },
  "api.stepfun.ai": { url: "https://api.stepfun.com/v1/accounts", type: "stepfun" },
  "api.siliconflow.cn": { url: "https://api.siliconflow.cn/v1/user/info", type: "siliconflow-cn" },
  "api.siliconflow.com": { url: "https://api.siliconflow.com/v1/user/info", type: "siliconflow-en" },
  "openrouter.ai": { url: "https://openrouter.ai/api/v1/credits", type: "openrouter" },
  "api.novita.ai": { url: "https://api.novita.ai/v3/user/balance", type: "novita" },
});

function resolveBalanceTemplate(endpoint) {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return TEMPLATES[url.hostname.toLowerCase()] || null;
  } catch { return null; }
}

function parseAmount(value) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : null;
}

function money(amount, currency) {
  const parsed = parseAmount(amount);
  if (parsed === null) throw new Error("Invalid balance response");
  return { kind: "money", amount: parsed, currency };
}

function validateBalanceRule(rule) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new TypeError("balance rule is invalid");
  let url;
  try { url = new URL(rule.url); } catch { throw new TypeError("balance rule URL is invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      (url.port && url.port !== "443") || url.href.length > 2048) {
    throw new TypeError("balance rule requires a plain HTTPS URL");
  }
  if (rule.method !== "GET" && rule.method !== "POST") throw new TypeError("balance rule method is invalid");
  if (typeof rule.valuePath !== "string" || rule.valuePath.length > 160 ||
      !rule.valuePath.split(".").every((part) => (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part) || /^(0|[1-9][0-9]{0,3})$/.test(part)) &&
        !["constructor", "prototype", "__proto__"].includes(part))) {
    throw new TypeError("balance rule path is invalid");
  }
  if (rule.kind !== "money" && rule.kind !== "quota") throw new TypeError("balance rule kind is invalid");
  if (typeof rule.unit !== "string" || (rule.kind === "money" ? !/^[A-Z]{3}$/.test(rule.unit)
    : !/^[\p{L}\p{N} _/-]{1,24}$/u.test(rule.unit))) throw new TypeError("balance rule unit is invalid");
  return { url: url.toString(), method: rule.method, valuePath: rule.valuePath,
    kind: rule.kind, unit: rule.unit };
}

function normalizeCustomBalance(rule, body) {
  let value = body;
  for (const key of rule.valuePath.split(".")) value = value && typeof value === "object" ? value[key] : undefined;
  const amount = parseAmount(value);
  if (amount === null) throw new Error("Invalid balance response");
  return rule.kind === "money" ? { kind: "money", amount, currency: rule.unit }
    : { kind: "quota", remaining: amount, unit: rule.unit };
}

function normalizeBalance(type, body) {
  if (!body || typeof body !== "object") throw new Error("Invalid balance response");
  if (type === "deepseek") {
    const infos = body.balance_infos;
    if (!Array.isArray(infos) || !infos.length) throw new Error("Invalid balance response");
    const currencies = new Set(infos.map((item) => item.currency));
    if (currencies.size !== 1 || !/^[A-Z]{3}$/.test(infos[0].currency || "")) throw new Error("Multiple balance currencies");
    return money(infos.reduce((total, item) => {
      const amount = parseAmount(item.total_balance);
      if (amount === null) throw new Error("Invalid balance response");
      return total + amount;
    }, 0), infos[0].currency);
  }
  if (type === "stepfun") return money(body.balance, "CNY");
  if (type === "siliconflow-cn" || type === "siliconflow-en") {
    return money(body.data?.totalBalance, type === "siliconflow-cn" ? "CNY" : "USD");
  }
  if (type === "openrouter") {
    const data = body.data || body;
    const credits = parseAmount(data.total_credits);
    const used = parseAmount(data.total_usage);
    if (credits === null || used === null || credits < used) throw new Error("Invalid balance response");
    return money(credits - used, "USD");
  }
  if (type === "novita") {
    const units = parseAmount(body.availableBalance);
    if (units === null) throw new Error("Invalid balance response");
    return money(units / 10000, "USD");
  }
  throw new Error("Unknown balance template");
}

function parseTomlSafe(text) {
  try { return parseToml(text || ""); } catch { return {}; }
}

function connectionFor(row) {
  const config = row.settingsConfig || {};
  const env = config.env || {};
  if (row.appId === "claude") return { endpoint: env.ANTHROPIC_BASE_URL, key: env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY };
  if (row.appId === "gemini") return { endpoint: env.GOOGLE_GEMINI_BASE_URL, key: env.GEMINI_API_KEY };
  if (row.appId === "claude-desktop") return { endpoint: config.baseUrl || env.ANTHROPIC_BASE_URL,
    key: config.apiKey || env.ANTHROPIC_AUTH_TOKEN };
  if (row.appId === "codex" || row.appId === "grokbuild") {
    const doc = parseTomlSafe(config.config);
    const route = doc.model_provider ? doc.model_providers?.[doc.model_provider] : null;
    const native = doc.models?.default ? doc.model?.[doc.models.default] : null;
    return { endpoint: route?.base_url || native?.base_url || doc.openai_base_url,
      key: config.auth?.OPENAI_API_KEY || route?.experimental_bearer_token || native?.api_key };
  }
  if (row.appId === "opencode" || row.appId === "mcode") return {
    endpoint: config.options?.baseURL, key: config.options?.apiKey,
  };
  if (row.appId === "openclaw" || row.appId === "pi") return { endpoint: config.baseUrl, key: config.apiKey };
  if (row.appId === "hermes") return { endpoint: config.base_url, key: config.api_key };
  return { endpoint: null, key: null };
}

function createProviderBalanceQuery({ repository, store, request = safeRequest, now = Date.now,
  intervalMs = 15 * 60_000, onChange = () => {} } = {}) {
  if (!repository || !store) throw new TypeError("balance query dependencies are required");
  const inflight = new Map();
  let timer = null;
  const announce = (providerId) => { try { onChange(providerId); } catch { /* A closed window must not fail the query. */ } };
  const failure = (providerId, reason) => {
    if (!repository.getDraft(providerId)) return null;
    const result = store.markFailure(providerId, reason);
    announce(providerId);
    return result;
  };
  async function execute(providerId, { force = false } = {}) {
    const cached = store.get(providerId);
    if (!force && cached && !cached.stale && cached.checkedAt && now() - cached.checkedAt < 10 * 60_000) return cached;
    const row = repository.getDraft(providerId);
    if (!row) return null;
    const { endpoint, key } = connectionFor(row);
    let customRule;
    try { customRule = row.metadata?.balanceRule ? validateBalanceRule(row.metadata.balanceRule) : null; }
    catch { return failure(providerId, "format"); }
    const template = customRule || resolveBalanceTemplate(endpoint);
    if (!template) return { ...(cached || { providerId, kind: null }), stale: true, error: "unsupported" };
    if (typeof key !== "string" || !key.trim()) return failure(providerId, "auth");
    const revision = row.updatedAt;
    const failIfCurrent = (reason) => {
      const current = repository.getDraft(providerId);
      return current && current.updatedAt === revision &&
        JSON.stringify(current.settingsConfig) === JSON.stringify(row.settingsConfig) &&
        JSON.stringify(current.metadata?.balanceRule) === JSON.stringify(row.metadata?.balanceRule)
        ? failure(providerId, reason) : store.get(providerId);
    };
    try {
      const response = await request(template.url, { apiKey: key, timeoutMs: 15_000,
        method: customRule?.method || "GET" });
      if (response.status === 401 || response.status === 403) return failIfCurrent("auth");
      if (response.status < 200 || response.status >= 300) return failIfCurrent("network");
      let body;
      try { body = JSON.parse(response.body); } catch { return failIfCurrent("format"); }
      let value;
      try { value = customRule ? normalizeCustomBalance(customRule, body)
        : normalizeBalance(template.type, body); } catch { return failIfCurrent("format"); }
      const current = repository.getDraft(providerId);
      if (!current || current.updatedAt !== revision ||
          JSON.stringify(current.settingsConfig) !== JSON.stringify(row.settingsConfig) ||
          JSON.stringify(current.metadata?.balanceRule) !== JSON.stringify(row.metadata?.balanceRule)) {
        return store.get(providerId);
      }
      const result = store.put(providerId, value);
      announce(providerId);
      return result;
    } catch { return failIfCurrent("network"); }
  }
  function query(providerId, options) {
    if (inflight.has(providerId)) return inflight.get(providerId);
    const task = execute(providerId, options);
    inflight.set(providerId, task);
    void task.finally(() => { if (inflight.get(providerId) === task) inflight.delete(providerId); }).catch(() => {});
    return task;
  }
  function visibleIds() {
    const switching = ["claude", "codex", "gemini", "grokbuild", "claude-desktop"]
      .map((appId) => repository.getActive(appId)?.providerId).filter(Boolean);
    const coexisting = ["opencode", "openclaw", "hermes", "pi", "mcode"]
      .flatMap((appId) => repository.getEnabled(appId));
    return [...new Set([...switching, ...coexisting])];
  }
  function scheduleVisible() {
    if (timer) return;
    const refresh = () => { for (const id of visibleIds()) void query(id).catch(() => {}); };
    refresh();
    timer = setInterval(refresh, intervalMs);
    timer.unref?.();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  function setRule(providerId, rule) {
    const row = repository.getDraft(providerId);
    if (!row || row.appId === "universal") throw new TypeError("provider is invalid");
    const balanceRule = rule === null ? null : validateBalanceRule(rule);
    const metadata = { ...(row.metadata || {}) };
    if (balanceRule) metadata.balanceRule = balanceRule;
    else delete metadata.balanceRule;
    repository.update(providerId, { metadata });
    inflight.delete(providerId);
    store.invalidate(providerId);
    announce(providerId);
    return balanceRule;
  }
  function getRule(providerId) {
    const row = repository.getDraft(providerId);
    return row?.metadata?.balanceRule ? validateBalanceRule(row.metadata.balanceRule) : null;
  }
  return { query, scheduleVisible, stop, visibleIds, setRule, getRule };
}

module.exports = { createProviderBalanceQuery, resolveBalanceTemplate, normalizeBalance,
  connectionFor, validateBalanceRule, normalizeCustomBalance };
