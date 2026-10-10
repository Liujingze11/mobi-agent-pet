"use strict";

// Adapted from CC Switch live/project/gemini.rs and live/floor.rs.
// Copyright (c) 2025 Jason Young; MIT license in THIRD_PARTY_NOTICES.md.
const path = require("node:path");
const { parse, modify, applyEdits } = require("jsonc-parser");
const { sha256 } = require("../file-transaction.cjs");

const ENV_FIELDS = new Set([
  "GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_API_KEY_AUTH_MECHANISM", "GEMINI_CLI_CUSTOM_HEADERS",
  "GEMINI_DEFAULT_AUTH_TYPE", "GEMINI_CLI_USE_COMPUTE_ADC", "CODE_ASSIST_ENDPOINT", "CODE_ASSIST_API_VERSION",
]);
const isFloorEnv = (key) => key.startsWith("GOOGLE_") || ENV_FIELDS.has(key);

function parseSettings(bytes) {
  const text = bytes?.toString("utf8") || "{}";
  const errors = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Gemini settings.json");
  }
  return { text, value };
}

function envProjection(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new TypeError("Invalid Gemini provider config");
  const env = config.env || {};
  if (typeof env !== "object" || Array.isArray(env)) throw new TypeError("Invalid Gemini env");
  return Object.fromEntries(Object.entries(env).filter(([key]) => isFloorEnv(key)).map(([key, value]) => {
    if (typeof value !== "string" || /[\r\n\0]/.test(value)) throw new TypeError("Invalid Gemini env value");
    return [key, value];
  }));
}

function createGeminiAdapter({ fs, home } = {}) {
  if (!fs || !home) throw new TypeError("fs and home are required");
  const dir = path.join(home, ".gemini");
  const envFile = path.join(dir, ".env");
  const settingsFile = path.join(dir, "settings.json");
  const readBytes = (file) => {
    try { return fs.readFileSync(file); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  function read() {
    const env = readBytes(envFile);
    const settings = readBytes(settingsFile);
    const { value } = parseSettings(settings);
    return { bytes: { env, settings },
      hashes: { [envFile]: env ? sha256(env) : null, [settingsFile]: settings ? sha256(settings) : null },
      config: { env: Object.fromEntries((env?.toString("utf8") || "").split(/\r?\n/)
        .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)).filter(Boolean)
        .map((match) => [match[1], match[2]])), config: value } };
  }
  function plan({ currentBytes, targetConfig }) {
    const bytes = currentBytes === undefined ? read().bytes : currentBytes;
    const targetEnv = envProjection(targetConfig);
    const currentEnv = bytes.env?.toString("utf8") || "";
    const retained = currentEnv.split("\n").filter((line) => {
      const key = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
      return !key || !isFloorEnv(key);
    });
    while (retained.length && retained.at(-1) === "") retained.pop();
    const envLines = [...retained, ...Object.entries(targetEnv).map(([key, value]) => `${key}=${value}`)];
    const nextEnv = envLines.length ? `${envLines.join("\n")}\n` : "";
    const { text: currentSettings, value: liveSettings } = parseSettings(bytes.settings);
    let nextSettings = currentSettings;
    const edit = (segments, value) => {
      nextSettings = applyEdits(nextSettings, modify(nextSettings, segments, value,
        { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } }));
    };
    const official = Object.keys(targetEnv).length === 0;
    edit(["security", "auth", "selectedType"], official ? "oauth-personal" : "gemini-api-key");
    const model = targetConfig.config?.model?.name;
    if (model !== undefined && model !== null) edit(["model", "name"], model);
    else if (liveSettings.model && Object.hasOwn(liveSettings.model, "name")) edit(["model", "name"], undefined);
    const changes = [];
    const envBytes = Buffer.from(nextEnv);
    const settingsBytes = Buffer.from(nextSettings);
    if (bytes.env ? !bytes.env.equals(envBytes) : envBytes.length > 0) changes.push({
      path: envFile, originalHash: bytes.env ? sha256(bytes.env) : null, nextBytes: envBytes, mode: 0o600,
    });
    if (bytes.settings ? !bytes.settings.equals(settingsBytes) : settingsBytes.length > 0) changes.push({
      path: settingsFile, originalHash: bytes.settings ? sha256(bytes.settings) : null, nextBytes: settingsBytes, mode: 0o600,
    });
    return changes;
  }
  function verify({ targetConfig }) { return plan({ currentBytes: read().bytes, targetConfig }).length === 0; }
  function importCurrent() {
    const live = read();
    if (!live.bytes.env && !live.bytes.settings) return null;
    return { appId: "gemini", name: "原有配置", settingsConfig: live.config };
  }
  return { read, plan, verify, importCurrent, restartHint: () => "restart-agent" };
}

module.exports = { createGeminiAdapter, isFloorEnv };
