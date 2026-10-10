"use strict";

// Adapted from CC Switch live/project/grok.rs and utils/grokBuildConfig.ts.
// Copyright (c) 2025 Jason Young; MIT license in THIRD_PARTY_NOTICES.md.
const path = require("node:path");
const { parse, stringify } = require("smol-toml");
const { isDeepStrictEqual } = require("node:util");
const { sha256 } = require("../file-transaction.cjs");

function parseConfig(text) {
  try { return text.trim() ? parse(text) : {}; }
  catch { throw new Error("Invalid Grok Build config.toml"); }
}

function project(config) {
  if (!config || typeof config !== "object" || typeof config.config !== "string") throw new TypeError("Invalid Grok Build provider");
  const doc = parseConfig(config.config);
  if (doc.model_provider && doc.model_providers) {
    const source = doc.model_providers[doc.model_provider];
    if (!source || typeof source.base_url !== "string") throw new Error("Invalid Grok Build route");
    const key = config.auth?.OPENAI_API_KEY;
    if (typeof key !== "string" || !key.trim()) throw new Error("Grok Build API key is required");
    const model = doc.model || "grok-4.5";
    return { name: "mobi-grok", table: {
      model, base_url: source.base_url, name: source.name || "Mobi",
      api_key: key, api_backend: source.wire_api || "responses", context_window: 500000,
    } };
  }
  const tables = doc.model || {};
  const names = Object.keys(tables);
  const selected = doc.models?.default && tables[doc.models.default] ? doc.models.default : names.length === 1 ? names[0] : null;
  if (!selected) {
    if (names.length > 1) throw new Error("Grok Build default model is ambiguous");
    return null;
  }
  return { name: selected, table: tables[selected] };
}

function modelHeader(line) {
  const match = line.match(/^\s*\[model\.(?:"([^"]+)"|'([^']+)'|([^\]]+))\]\s*(?:#.*)?$/);
  return match ? (match[1] || match[2] || match[3]).trim() : null;
}

function patchGrokToml(currentText, target, previous) {
  const live = parseConfig(currentText);
  if (target?.name === "mobi-grok" && !previous && live.model?.["mobi-grok"]) {
    throw new Error("Provider config conflict: mobi-grok table already exists");
  }
  const retired = new Set([previous?.name, target?.name].filter(Boolean));
  const retained = [];
  let section = "";
  let skip = false;
  let hasModelsSection = false;
  let addedDefault = false;
  for (const line of currentText.split("\n")) {
    if (/^\s*\[/.test(line)) {
      const name = modelHeader(line);
      skip = name ? retired.has(name) : false;
      section = /^\s*\[models\]\s*(?:#.*)?$/.test(line) ? "models" : "other";
      if (section === "models") {
        hasModelsSection = true;
        retained.push(line);
        if (target) { retained.push(`default = ${JSON.stringify(target.name)}`); addedDefault = true; }
        continue;
      }
    }
    if (skip) continue;
    if (section === "models" && /^\s*default\s*=/.test(line)) continue;
    retained.push(line);
  }
  let next = retained.join("\n").trimEnd();
  if (target && !hasModelsSection) next += `${next ? "\n\n" : ""}[models]\ndefault = ${JSON.stringify(target.name)}`;
  if (target) {
    const modelToml = stringify({ model: { [target.name]: target.table } }).replace(/^\[model\]\n/, "").trimEnd();
    next += `${next ? "\n\n" : ""}${modelToml}`;
  }
  if (!target && hasModelsSection && !addedDefault) {
    // An empty [models] table is valid and keeps user comments in that section.
  }
  next += next ? "\n" : "";
  parseConfig(next);
  return next;
}

function createGrokAdapter({ fs, home } = {}) {
  if (!fs || !home) throw new TypeError("fs and home are required");
  const file = path.join(home, ".grok", "config.toml");
  function read() {
    let bytes = null;
    try { bytes = fs.readFileSync(file); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const config = bytes?.toString("utf8") || "";
    parseConfig(config);
    return { path: file, bytes, hash: bytes ? sha256(bytes) : null,
      config: { auth: {}, config } };
  }
  function plan({ currentBytes, previousConfig, targetConfig }) {
    const bytes = currentBytes === undefined ? read().bytes : currentBytes;
    const target = project(targetConfig);
    const previous = previousConfig ? project(previousConfig) : null;
    const live = parseConfig(bytes?.toString("utf8") || "");
    if (target && live.models?.default === target.name && isDeepStrictEqual(live.model?.[target.name], target.table)) return [];
    if (!target && !live.models?.default && !previous) return [];
    const nextBytes = Buffer.from(patchGrokToml(bytes?.toString("utf8") || "", target, previous));
    if (bytes?.equals(nextBytes)) return [];
    return [{ path: file, originalHash: bytes ? sha256(bytes) : null, nextBytes, mode: 0o600 }];
  }
  function verify({ targetConfig }) {
    const live = parseConfig(read().config.config);
    const target = project(targetConfig);
    return target ? live.models?.default === target.name && isDeepStrictEqual(live.model?.[target.name], target.table)
      : !live.models?.default;
  }
  function importCurrent() {
    const live = read();
    return live.bytes ? { appId: "grokbuild", name: "原有配置", settingsConfig: live.config } : null;
  }
  return { read, plan, verify, importCurrent, restartHint: () => "restart-agent" };
}

module.exports = { createGrokAdapter, project, patchGrokToml };
