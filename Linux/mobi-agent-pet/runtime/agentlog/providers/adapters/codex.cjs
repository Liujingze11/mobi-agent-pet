"use strict";

// Adapted from CC Switch live/project/codex.rs. Copyright (c) 2025 Jason Young.
// MIT license and source mapping: THIRD_PARTY_NOTICES.md and docs/third-party/.
const path = require("node:path");
const { sha256 } = require("../file-transaction.cjs");
const { patchCodexToml, parseToml } = require("./codex-toml-patch.cjs");

function parseAuth(bytes) {
  if (bytes === null) return {};
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("Invalid Codex auth.json"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Codex auth.json");
  return value;
}

function normalizeTarget(config) {
  if (!config || typeof config !== "object" || Array.isArray(config) ||
    typeof config.config !== "string" || !config.auth || typeof config.auth !== "object") {
    throw new TypeError("Invalid Codex provider config");
  }
  const parsed = parseToml(config.config);
  const selected = parsed.model_provider;
  const tables = parsed.model_providers || {};
  const route = selected && typeof selected === "string" && tables[selected] ? selected : null;
  const key = config.auth.OPENAI_API_KEY;
  if (key !== undefined && typeof key !== "string") throw new TypeError("Invalid Codex API key");
  if (!route) return config.config;
  if (key && !/^https?:\/\//.test(String(tables[route].base_url || ""))) {
    throw new TypeError("Codex third-party provider requires an HTTP endpoint");
  }
  let text = config.config;
  if (route !== "custom") {
    text = text.replace(/^\s*model_provider\s*=\s*["']?[^\n"']+["']?.*$/m, 'model_provider = "custom"');
    text = text.replace(new RegExp(`\\[model_providers\\.${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`, "g"), "[model_providers.custom]");
  }
  if (key) {
    const lines = text.split("\n");
    const start = lines.findIndex((line) => /^\s*\[model_providers\.custom\]\s*(?:#.*)?$/.test(line));
    if (start < 0) throw new Error("Invalid Codex provider route");
    let end = start + 1;
    while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
    const tokenLine = `experimental_bearer_token = ${JSON.stringify(key)}`;
    const previous = lines.findIndex((line, index) => index > start && index < end && /^\s*experimental_bearer_token\s*=/.test(line));
    if (previous >= 0) lines[previous] = tokenLine;
    else lines.splice(end, 0, tokenLine);
    text = lines.join("\n");
  }
  parseToml(text);
  return text;
}

function createCodexAdapter({ fs, home } = {}) {
  if (!fs || !home) throw new TypeError("fs and home are required");
  const configFile = path.join(home, ".codex", "config.toml");
  const authFile = path.join(home, ".codex", "auth.json");
  const readBytes = (file) => {
    try { return fs.readFileSync(file); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  function read() {
    const configBytes = readBytes(configFile);
    const authBytes = readBytes(authFile);
    const config = configBytes?.toString("utf8") || "";
    parseToml(config);
    const auth = parseAuth(authBytes);
    return {
      bytes: { config: configBytes, auth: authBytes },
      hashes: { [configFile]: configBytes ? sha256(configBytes) : null, [authFile]: authBytes ? sha256(authBytes) : null },
      config: { config, auth },
    };
  }
  function plan({ currentBytes, targetConfig }) {
    const bytes = currentBytes === undefined ? read().bytes : currentBytes;
    const currentConfig = bytes.config?.toString("utf8") || "";
    const nextConfig = patchCodexToml(currentConfig, normalizeTarget(targetConfig));
    const currentAuth = parseAuth(bytes.auth);
    // Third-party credentials belong in config.toml on modern Codex. Keep OAuth
    // refresh material in auth.json and remove only an old third-party API key.
    const nextAuth = { ...currentAuth };
    delete nextAuth.OPENAI_API_KEY;
    const changes = [];
    const configBytes = Buffer.from(nextConfig);
    if (!bytes.config || !bytes.config.equals(configBytes)) changes.push({
      path: configFile, originalHash: bytes.config ? sha256(bytes.config) : null, nextBytes: configBytes, mode: 0o600,
    });
    if (bytes.auth && JSON.stringify(nextAuth) !== JSON.stringify(currentAuth)) changes.push({
      path: authFile, originalHash: sha256(bytes.auth), nextBytes: Buffer.from(`${JSON.stringify(nextAuth, null, 2)}\n`), mode: 0o600,
    });
    return changes;
  }
  function verify({ targetConfig }) {
    const live = read();
    return plan({ currentBytes: live.bytes, targetConfig }).length === 0;
  }
  function importCurrent() {
    const live = read();
    if (!live.bytes.config && !live.bytes.auth) return null;
    return { appId: "codex", name: "原有配置", settingsConfig: live.config };
  }
  return { read, plan, verify, importCurrent, restartHint: () => "restart-agent" };
}

module.exports = { createCodexAdapter, normalizeTarget, parseAuth };
