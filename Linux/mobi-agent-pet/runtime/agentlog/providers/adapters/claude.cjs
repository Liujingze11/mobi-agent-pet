"use strict";

// Adapted from CC Switch live/project/claude.rs and live/floor.rs.
// Copyright (c) 2025 Jason Young; MIT license in THIRD_PARTY_NOTICES.md.
const path = require("node:path");
const { parse, modify, applyEdits } = require("jsonc-parser");
const { sha256 } = require("../file-transaction.cjs");

const TOP_FIELDS = new Set([
  "apiKeyHelper", "apiBaseUrl", "primaryModel", "smallFastModel", "apiKey", "model",
  "fallbackModel", "modelOverrides", "advisorModel", "awsAuthRefresh", "awsCredentialExport", "gcpAuthRefresh",
]);
const PROTOCOL_FIELDS = new Set([
  "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_USE_GATEWAY", "CLAUDE_CODE_USE_MANTLE", "CLAUDE_CODE_USE_ANTHROPIC_AWS",
  "CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD",
]);
const ENV_FIELDS = new Set([
  "CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL_FORCE", "CLOUD_ML_REGION",
  "GOOGLE_APPLICATION_CREDENTIALS", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_REFRESH_TOKEN",
  "CLAUDE_CODE_OAUTH_SCOPES", "CLAUDE_CODE_API_KEY_HELPER_TTL_MS",
]);
const EXCLUSIVE_FIELDS = new Set([
  "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS", "CLAUDE_CODE_DISABLE_ARTIFACT", "ENABLE_TOOL_SEARCH",
  "CLAUDE_CODE_DISABLE_THINKING", "DISABLE_INTERLEAVED_THINKING", "CLAUDE_CODE_ALWAYS_ENABLE_EFFORT",
  "CLAUDE_CODE_EXTRA_BODY", "CLAUDE_CODE_ENABLE_FINE_GRAINED_TOOL_STREAMING",
  "CLAUDE_CODE_MAX_CONTEXT_TOKENS", "CLAUDE_CODE_AUTO_COMPACT_WINDOW", "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
  "CLAUDE_CODE_DISABLE_1M_CONTEXT", "CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT",
]);

function isFloorEnv(key) {
  return key.startsWith("ANTHROPIC_") || key.startsWith("AWS_") ||
    key.startsWith("VERTEX_REGION_") || PROTOCOL_FIELDS.has(key) || ENV_FIELDS.has(key) ||
    (key.startsWith("CLAUDE_CODE_SKIP_") && key.endsWith("_AUTH"));
}

function parseSettings(bytes) {
  const text = bytes === null ? "{}" : bytes.toString("utf8");
  const errors = [];
  const parsed = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid Claude settings.json");
  }
  if (parsed.env !== undefined && (!parsed.env || typeof parsed.env !== "object" || Array.isArray(parsed.env))) {
    throw new Error("Invalid Claude settings.json env");
  }
  return { text, parsed };
}

function projection(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new TypeError("invalid Claude provider config");
  const top = Object.fromEntries(Object.entries(config).filter(([key]) => TOP_FIELDS.has(key)));
  const env = config.env && typeof config.env === "object" && !Array.isArray(config.env) ? config.env : {};
  const floor = Object.fromEntries(Object.entries(env).filter(([key]) => isFloorEnv(key)));
  const exclusive = Object.fromEntries(Object.entries(env).filter(([key]) => EXCLUSIVE_FIELDS.has(key)));
  if (floor.CLAUDE_CODE_USE_BEDROCK && top.apiKey && !floor.AWS_BEARER_TOKEN_BEDROCK) {
    floor.AWS_BEARER_TOKEN_BEDROCK = top.apiKey;
    delete top.apiKey;
  }
  return { top, env: floor, exclusive };
}

function createClaudeAdapter({ fs, home } = {}) {
  if (!fs || !home) throw new TypeError("fs and home are required");
  const file = path.join(home, ".claude", "settings.json");

  function read() {
    let bytes = null;
    try { bytes = fs.readFileSync(file); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const { parsed } = parseSettings(bytes);
    return { path: file, bytes, hash: bytes === null ? null : sha256(bytes), config: parsed };
  }

  function plan({ currentBytes, previousConfig, targetConfig }) {
    const bytes = currentBytes === undefined ? read().bytes : currentBytes;
    const { text: originalText, parsed: live } = parseSettings(bytes);
    const previous = previousConfig ? projection(previousConfig) : null;
    const target = projection(targetConfig);
    let text = originalText;
    const edit = (segments, value) => {
      text = applyEdits(text, modify(text, segments, value, {
        formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
      }));
    };
    for (const key of Object.keys(live)) if (TOP_FIELDS.has(key) && !Object.hasOwn(target.top, key)) edit([key], undefined);
    const liveEnv = live.env || {};
    for (const key of Object.keys(liveEnv)) {
      if (isFloorEnv(key) && !Object.hasOwn(target.env, key)) edit(["env", key], undefined);
      else if (previous && EXCLUSIVE_FIELDS.has(key) && Object.hasOwn(previous.exclusive, key)
        && !Object.hasOwn(target.exclusive, key) && liveEnv[key] === previous.exclusive[key]) {
        edit(["env", key], undefined);
      }
    }
    for (const [key, value] of Object.entries(target.top)) edit([key], value);
    for (const [key, value] of Object.entries({ ...target.env, ...target.exclusive })) edit(["env", key], value);
    const nextBytes = Buffer.from(text);
    if (bytes !== null && bytes.equals(nextBytes)) return [];
    return [{ path: file, originalHash: bytes === null ? null : sha256(bytes), nextBytes, mode: 0o600 }];
  }

  function verify({ targetConfig }) {
    const live = projection(read().config);
    const target = projection(targetConfig);
    return Object.entries(target.top).every(([key, value]) => live.top[key] === value)
      && Object.entries(target.env).every(([key, value]) => live.env[key] === value);
  }

  function importCurrent() {
    const live = read();
    if (live.bytes === null) return null;
    const picked = projection(live.config);
    return { appId: "claude", name: "原有配置", settingsConfig: { ...picked.top, env: { ...picked.env, ...picked.exclusive } } };
  }

  return { read, plan, verify, importCurrent, restartHint: () => "none" };
}

module.exports = { createClaudeAdapter, projection, isFloorEnv };
