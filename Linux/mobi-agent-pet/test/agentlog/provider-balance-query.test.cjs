"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createProviderBalanceQuery, resolveBalanceTemplate } = require("../../runtime/agentlog/providers/balance-query.cjs");

function fixture(config, response) {
  const calls = [];
  let balance = null;
  const repository = { getDraft: () => ({ id: "provider", appId: "claude", settingsConfig: config }),
    getActive: () => ({ providerId: "provider" }), getEnabled: () => [] };
  const store = { get: () => balance, put: (_id, value) => (balance = { providerId: "provider", ...value, checkedAt: 1000, stale: false, error: null }),
    markFailure: (_id, reason) => (balance = { ...(balance || { providerId: "provider", kind: null }), stale: true, error: reason }) };
  const request = async (url, options) => { calls.push({ url, options }); return response(); };
  return { query: createProviderBalanceQuery({ repository, store, request, now: () => 1000 }), calls };
}

test("DeepSeek balance uses fixed host and keeps currency without guessing missing values", async () => {
  const f = fixture({ env: { ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic", ANTHROPIC_AUTH_TOKEN: "secret" } },
    () => ({ status: 200, body: '{"balance_infos":[{"currency":"CNY","total_balance":"12.50"}]}' }));
  const result = await f.query.query("provider", { force: true });
  assert.equal(result.kind, "money");
  assert.equal(result.amount, 12.5);
  assert.equal(result.currency, "CNY");
  assert.equal(f.calls[0].url, "https://api.deepseek.com/user/balance");
  assert.equal(f.calls[0].options.apiKey, "secret");
  assert.deepEqual(resolveBalanceTemplate("https://api.deepseek.com.attacker.test/v1"), null);
});

test("HTTP 401 and invalid JSON retain the last good amount as stale", async () => {
  let response = { status: 200, body: '{"data":{"total_credits":20,"total_usage":4}}' };
  const f = fixture({ env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api/v1", ANTHROPIC_AUTH_TOKEN: "secret" } }, () => response);
  assert.equal((await f.query.query("provider", { force: true })).amount, 16);
  response = { status: 401, body: "" };
  const auth = await f.query.query("provider", { force: true });
  assert.equal(auth.amount, 16);
  assert.equal(auth.stale, true);
  assert.equal(auth.error, "auth");
  response = { status: 200, body: "{" };
  assert.equal((await f.query.query("provider", { force: true })).error, "format");
});

test("unsupported host returns unavailable without sending the API key", async () => {
  const f = fixture({ env: { ANTHROPIC_BASE_URL: "https://unknown.test/v1", ANTHROPIC_AUTH_TOKEN: "secret" } },
    () => { throw new Error("must not request"); });
  const result = await f.query.query("provider", { force: true });
  assert.equal(result.error, "unsupported");
  assert.equal(f.calls.length, 0);
});

test("simultaneous refreshes share one request", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const f = fixture({ env: { ANTHROPIC_BASE_URL: "https://api.deepseek.com", ANTHROPIC_AUTH_TOKEN: "secret" } },
    async () => { await gate; return { status: 200, body: '{"balance_infos":[{"currency":"CNY","total_balance":"2"}]}' }; });
  const a = f.query.query("provider", { force: true });
  const b = f.query.query("provider", { force: true });
  release();
  assert.equal((await a).amount, 2);
  assert.equal((await b).amount, 2);
  assert.equal(f.calls.length, 1);
});

test("custom balance rule reads only a declared JSON number and supports POST", async () => {
  const calls = [];
  let row = { id: "provider", appId: "claude", name: "Custom", settingsConfig: {
    env: { ANTHROPIC_BASE_URL: "https://custom.example/v1", ANTHROPIC_AUTH_TOKEN: "secret" },
  }, metadata: {}, updatedAt: 1 };
  let cached = null;
  const query = createProviderBalanceQuery({
    repository: { getDraft: () => row, update: (_id, patch) => { row = { ...row, ...patch, updatedAt: 2 }; } },
    store: { get: () => cached, put: (_id, value) => (cached = { providerId: "provider", ...value, stale: false }),
      markFailure: (_id, reason) => (cached = { ...(cached || { providerId: "provider", kind: null }),
        stale: true, error: reason }),
      invalidate: () => (cached = cached ? { ...cached, stale: true, error: null } : null) },
    request: async (url, options) => { calls.push({ url, options }); return { status: 200, body: '{"data":{"remaining":7.5}}' }; },
  });
  query.setRule("provider", { url: "https://billing.example/account", method: "POST",
    valuePath: "data.remaining", kind: "quota", unit: "requests" });
  const value = await query.query("provider", { force: true });
  assert.deepEqual({ kind: value.kind, remaining: value.remaining, unit: value.unit },
    { kind: "quota", remaining: 7.5, unit: "requests" });
  assert.equal(calls[0].url, "https://billing.example/account");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.apiKey, "secret");
  assert.throws(() => query.setRule("provider", { url: "http://127.0.0.1/balance", method: "GET",
    valuePath: "data.remaining", kind: "money", unit: "USD" }), /HTTPS|rule/i);
  assert.throws(() => query.setRule("provider", { url: "https://billing.example/?token=secret", method: "GET",
    valuePath: "data.remaining", kind: "money", unit: "USD" }), /URL|rule/i);
  assert.throws(() => query.setRule("provider", { url: "https://billing.example", method: "GET",
    valuePath: "data.constructor", kind: "money", unit: "USD" }), /path|rule/i);
});
