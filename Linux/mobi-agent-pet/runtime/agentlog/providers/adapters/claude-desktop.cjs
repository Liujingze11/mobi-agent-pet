"use strict";

// Adapted from CC Switch claude_desktop_config.rs. Copyright (c) 2025 Jason Young.
// MIT license in THIRD_PARTY_NOTICES.md. Mobi uses its own profile ID.
const path = require("node:path");
const { parse, modify, applyEdits } = require("jsonc-parser");
const { sha256 } = require("../file-transaction.cjs");

const PROFILE_ID = "00000000-0000-4000-8000-000000160001";
const PROFILE_NAME = "Mobi Agent Pet";
const FLOOR = ["inferenceProvider", "inferenceGatewayBaseUrl", "inferenceGatewayApiKey", "inferenceGatewayAuthScheme", "inferenceModels"];

function parseDoc(bytes, label) {
  const text = bytes?.toString("utf8") || "{}";
  const errors = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid Claude Desktop ${label}`);
  return { text, value };
}

function editJson(text, segments, value) {
  return applyEdits(text, modify(text, segments, value,
    { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } }));
}

function directProfile(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new TypeError("Invalid Claude Desktop provider");
  if (config.mode === "proxy") throw new Error("Claude Desktop proxy mode requires a local proxy");
  if (config.mode === "original-snapshot") return null;
  if (config.apiFormat && config.apiFormat !== "anthropic") throw new Error("Claude Desktop direct mode requires Anthropic format");
  const baseUrl = config.baseUrl || config.env?.ANTHROPIC_BASE_URL || "";
  const apiKey = config.apiKey || config.env?.ANTHROPIC_AUTH_TOKEN || "";
  if (!baseUrl && !apiKey) return null;
  if (typeof baseUrl !== "string" || !/^https?:\/\//.test(baseUrl) || typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("Claude Desktop direct endpoint and API key are required");
  }
  const profile = { inferenceProvider: "gateway", inferenceGatewayBaseUrl: baseUrl,
    inferenceGatewayApiKey: apiKey, inferenceGatewayAuthScheme: "bearer",
    coworkEgressAllowedHosts: ["*"], disableDeploymentModeChooser: true };
  if (Array.isArray(config.modelRoutes) && config.modelRoutes.length) {
    profile.inferenceModels = config.modelRoutes.map((route) => {
      const id = route.routeId;
      if (typeof id !== "string" || !/^(?:anthropic\/)?claude-[a-z0-9-]+$/i.test(id) ||
        (route.upstreamModel && route.upstreamModel !== id)) {
        throw new Error("Claude Desktop direct mode supports only matching Claude model routes");
      }
      return route.supports1m || route.labelOverride ? { name: id, ...(route.labelOverride ? { labelOverride: route.labelOverride } : {}),
        ...(route.supports1m ? { supports1m: true } : {}) } : id;
    });
  }
  return profile;
}

function createDesktopAdapter({ fs, home, configDir } = {}) {
  if (!fs || !home) throw new TypeError("fs and home are required");
  const root = configDir || path.join(home, ".config");
  const library = path.join(root, "Claude-3p", "configLibrary");
  const files = {
    normal: path.join(root, "Claude", "claude_desktop_config.json"),
    threep: path.join(root, "Claude-3p", "claude_desktop_config.json"),
    profile: path.join(library, `${PROFILE_ID}.json`),
    meta: path.join(library, "_meta.json"),
  };
  const readBytes = (file) => {
    try { return fs.readFileSync(file); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  function read() {
    const bytes = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, readBytes(file)]));
    for (const [key, value] of Object.entries(bytes)) parseDoc(value, key);
    return { bytes, hashes: Object.fromEntries(Object.entries(bytes)
      .map(([key, value]) => [files[key], value ? sha256(value) : null])),
      config: { mode: "original-snapshot", files: Object.fromEntries(Object.entries(bytes)
        .map(([key, value]) => [key, value?.toString("base64") || null])) } };
  }
  function plan({ currentBytes, targetConfig }) {
    const bytes = currentBytes === undefined ? read().bytes : currentBytes;
    const changes = [];
    const add = (key, nextText, create = true) => {
      if (!create && bytes[key] === null) return;
      const nextBytes = Buffer.isBuffer(nextText) ? nextText : Buffer.from(nextText);
      if (bytes[key]?.equals(nextBytes)) return;
      changes.push({ path: files[key], originalHash: bytes[key] ? sha256(bytes[key]) : null,
        nextBytes, mode: key === "profile" ? 0o600 : 0o600 });
    };
    if (targetConfig?.mode === "original-snapshot") {
      for (const key of Object.keys(files)) {
        const encoded = targetConfig.files?.[key];
        const original = encoded === null ? Buffer.from("{}\n") : Buffer.from(encoded || "", "base64");
        parseDoc(original, key);
        add(key, original);
      }
      return changes;
    }
    const profile = directProfile(targetConfig);
    const official = !profile;
    const live = Object.fromEntries(Object.entries(bytes).map(([key, value]) => [key, parseDoc(value, key)]));
    for (const key of ["normal", "threep"]) {
      const next = editJson(live[key].text, ["deploymentMode"], official ? "1p" : "3p");
      add(key, next);
    }
    let profileText = live.profile.text;
    for (const key of FLOOR) {
      if (Object.hasOwn(live.profile.value, key) && !Object.hasOwn(profile || {}, key)) {
        profileText = editJson(profileText, [key], undefined);
      }
    }
    if (profile) {
      for (const [key, value] of Object.entries(profile)) {
        if ((key === "coworkEgressAllowedHosts" || key === "disableDeploymentModeChooser") &&
          Object.hasOwn(live.profile.value, key)) continue;
        profileText = editJson(profileText, [key], value);
      }
      add("profile", profileText);
    } else add("profile", profileText, false);
    const entries = live.meta.value.entries;
    if (entries !== undefined && !Array.isArray(entries)) throw new Error("Invalid Claude Desktop profile library");
    let nextEntries = (entries || []).filter((item) => item?.id !== PROFILE_ID);
    let metaText = live.meta.text;
    if (profile) {
      nextEntries = [...nextEntries, { id: PROFILE_ID, name: PROFILE_NAME }];
      metaText = editJson(metaText, ["entries"], nextEntries);
      metaText = editJson(metaText, ["appliedId"], PROFILE_ID);
    } else {
      if (entries) metaText = editJson(metaText, ["entries"], nextEntries);
      if (live.meta.value.appliedId === PROFILE_ID) {
        metaText = editJson(metaText, ["appliedId"], nextEntries[0]?.id);
      }
    }
    add("meta", metaText);
    return changes;
  }
  function verify({ targetConfig }) { return plan({ currentBytes: read().bytes, targetConfig }).length === 0; }
  function importCurrent() {
    const live = read();
    return Object.values(live.bytes).some(Boolean) ? { appId: "claude-desktop", name: "原有配置", settingsConfig: live.config } : null;
  }
  return { read, plan, verify, importCurrent, restartHint: () => "restart-agent" };
}

module.exports = { createDesktopAdapter, PROFILE_ID, directProfile };
