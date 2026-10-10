"use strict";

const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const APP_IDS = new Set([
  "claude", "codex", "gemini", "grokbuild", "claude-desktop",
  "opencode", "openclaw", "hermes", "pi", "mcode", "universal",
]);

function invalid(message) {
  const error = new Error(message);
  error.agentLogValidation = true;
  error.code = "INVALID_ARGUMENT";
  return error;
}

function appId(value) {
  if (!APP_IDS.has(value)) throw invalid("appId is invalid");
  return value;
}

function id(value) {
  if (typeof value !== "string" || !value || value.length > 128) throw invalid("id is invalid");
  return value;
}

function boundedConfig(value, depth = 0, seen = new Set()) {
  if (depth > 12) throw invalid("config depth exceeds the limit");
  if (value === null || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))) return;
  if (typeof value === "string") {
    if (value.length > 64_000) throw invalid("config string is too long");
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) throw invalid("config contains an unsupported value");
  seen.add(value);
  const entries = Object.entries(value);
  if (entries.length > 1000) throw invalid("config contains too many fields");
  for (const [key, item] of entries) {
    if (key.length > 256 || ["__proto__", "prototype", "constructor"].includes(key)) throw invalid("config field is invalid");
    boundedConfig(item, depth + 1, seen);
  }
  seen.delete(value);
}

function draft(value, { partial = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("provider input is invalid");
  if (!partial || value.appId !== undefined) appId(value.appId);
  if (!partial || value.name !== undefined) {
    if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 200) throw invalid("name is invalid");
  }
  if (!partial || value.settingsConfig !== undefined) {
    if (!value.settingsConfig || typeof value.settingsConfig !== "object" || Array.isArray(value.settingsConfig)) throw invalid("settingsConfig is invalid");
    boundedConfig(value.settingsConfig);
  }
  if (JSON.stringify(value).length > 1_000_000) throw invalid("provider input is too large");
  return value;
}

function isPrivateIp(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") ||
      normalized.startsWith("fd") || normalized.startsWith("fe80") || normalized.startsWith("::ffff:");
  }
  return true;
}

async function safeRequest(endpoint, { apiKey, allowLocal = false, timeoutMs = 8000, method = "GET" } = {}) {
  if (method !== "GET" && method !== "POST") throw invalid("request method is invalid");
  let url;
  try { url = new URL(endpoint); } catch { throw invalid("endpoint is invalid"); }
  if (url.username || url.password || url.hash || !["https:", "http:"].includes(url.protocol)) throw invalid("endpoint is invalid");
  if (url.protocol === "http:" && !allowLocal) throw invalid("HTTPS is required");
  const addresses = net.isIP(url.hostname)
    ? [{ address: url.hostname, family: net.isIP(url.hostname) }]
    : await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || (!allowLocal && addresses.some(({ address }) => isPrivateIp(address)))) {
    throw invalid("private endpoint requires explicit local access");
  }
  const address = addresses[0];
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method, timeout: timeoutMs,
      ...(url.protocol === "https:" ? { rejectUnauthorized: true } : {}),
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      lookup: (_host, _options, callback) => callback(null, address.address, address.family),
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        reject(invalid("endpoint redirect is not allowed"));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > 1_000_000) { request.destroy(invalid("response is too large")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("endpoint timed out")));
    request.on("error", reject);
    request.end();
  });
}

function createProviderService({ repository, fs, paths = {}, request = safeRequest } = {}) {
  if (!repository) throw new TypeError("repository is required");
  const ensureInactive = (providerId) => {
    const row = repository.getDraft(providerId);
    if (!row) return;
    if (repository.getActive(row.appId)?.providerId === providerId || repository.getEnabled(row.appId).includes(providerId)) {
      throw invalid("Remove this provider from the Agent before editing or deleting it");
    }
  };
  return {
    list(scope) { return repository.list(appId(scope)); },
    getEditDraft(providerId) { return repository.getDraft(id(providerId)); },
    create(input) { return repository.create(draft(input)); },
    update(providerId, input) { ensureInactive(id(providerId)); return repository.update(id(providerId), draft(input, { partial: true })); },
    remove(providerId) { ensureInactive(id(providerId)); return repository.remove(id(providerId)); },
    move(providerId, beforeId = null) {
      return repository.move(id(providerId), beforeId === null ? null : id(beforeId));
    },
    getEditorView(value) {
      const target = paths[appId(value)];
      if (!target || !fs.existsSync(target)) return { appId: value, exists: false, config: null };
      return { appId: value, exists: true, config: null };
    },
    async fetchModels(input) {
      appId(input?.appId);
      let endpoint;
      try { endpoint = new URL(input.endpoint); } catch { throw invalid("endpoint is invalid"); }
      if (!endpoint.pathname.endsWith("/models")) {
        endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/models`;
      }
      const result = await request(endpoint.toString(), { apiKey: input.apiKey, allowLocal: input.allowLocal });
      if (result.status < 200 || result.status >= 300) throw new Error("model query failed");
      const body = JSON.parse(result.body);
      return Array.isArray(body.data) ? body.data.map((item) => item.id).filter((item) => typeof item === "string").slice(0, 500) : [];
    },
    async checkEndpoint(input) {
      appId(input?.appId);
      const result = await request(input.endpoint, { apiKey: input.apiKey, allowLocal: input.allowLocal });
      return { reachable: result.status > 0 && result.status < 500, status: result.status };
    },
  };
}

module.exports = { createProviderService, safeRequest, isPrivateIp, boundedConfig };
