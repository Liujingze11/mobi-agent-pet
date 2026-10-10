"use strict";

// Adapted from CC Switch's native OpenCode, OpenClaw, Hermes, Pi and MCode
// config modules. Copyright (c) 2025 Jason Young; MIT notice in repo root.
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const JSON5 = require("json5");
const yaml = require("js-yaml");
const { sha256 } = require("../file-transaction.cjs");

const FILES = Object.freeze({
  opencode: ".config/opencode/opencode.json",
  openclaw: ".openclaw/openclaw.json",
  hermes: ".hermes/config.yaml",
  pi: ".pi/agent/models.json",
  mcode: ".minimax/config.yaml",
});
const YAML_APPS = new Set(["hermes", "mcode"]);
const MAX_BYTES = 1_000_000;

function readDocument(appId, bytes) {
  if (bytes && bytes.length > MAX_BYTES) throw new Error(`Invalid ${appId} config: file too large`);
  const text = bytes?.toString("utf8") || "";
  if (!text.trim()) return {};
  let value;
  try { value = YAML_APPS.has(appId) ? yaml.load(text, { json: false }) : JSON5.parse(text); }
  catch { throw new Error(`Invalid ${appId} config`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${appId} config root`);
  return value;
}

function providersFor(appId, doc, create) {
  const objectAt = (parent, key) => {
    if (parent[key] === undefined || parent[key] === null) {
      if (!create) return null;
      parent[key] = {};
    }
    if (typeof parent[key] !== "object" || Array.isArray(parent[key])) throw new Error(`Invalid ${appId} provider section`);
    return parent[key];
  };
  if (appId === "opencode") return objectAt(doc, "provider");
  if (appId === "openclaw") {
    const models = objectAt(doc, "models");
    if (!models) return null;
    if (create && models.mode === undefined) models.mode = "merge";
    return objectAt(models, "providers");
  }
  if (appId === "pi") return objectAt(doc, "providers");
  if (appId === "mcode") return objectAt(doc, "custom_provider");
  if (appId === "hermes") {
    if (doc.custom_providers === undefined || doc.custom_providers === null) {
      if (!create) return null;
      doc.custom_providers = [];
    }
    if (!Array.isArray(doc.custom_providers)) throw new Error("Invalid Hermes custom_providers");
    return doc.custom_providers;
  }
  throw new TypeError("invalid coexisting appId");
}

function getNode(appId, doc, providerId) {
  const providers = providersFor(appId, doc, false);
  if (!providers) return undefined;
  return appId === "hermes" ? providers.find((item) => item && item.name === providerId) : providers[providerId];
}

function normalizeHermes(providerId, config) {
  const next = structuredClone(config);
  const models = next.models;
  if (Array.isArray(models)) {
    next.models = Object.fromEntries(models.filter((item) => item && typeof item.id === "string")
      .map(({ id, ...rest }) => [id, rest]));
  }
  next.name = providerId;
  const firstModel = Object.keys(next.models || {})[0];
  if (firstModel) next.model = firstModel;
  return next;
}

function createCoexistingAdapter(appId, { fs, home } = {}) {
  if (!Object.hasOwn(FILES, appId) || !fs || !home) throw new TypeError("invalid coexisting adapter dependencies");
  const file = path.join(home, FILES[appId]);
  function bytesOnDisk() {
    try { return fs.readFileSync(file); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }
  function read() {
    const bytes = bytesOnDisk();
    const config = readDocument(appId, bytes);
    return { path: file, bytes, hash: bytes ? sha256(bytes) : null, config };
  }
  function encode(doc) {
    return Buffer.from(YAML_APPS.has(appId) ? yaml.dump(doc, { noRefs: true, lineWidth: 120 })
      : `${JSON.stringify(doc, null, 2)}\n`);
  }
  function change(bytes, doc) {
    const nextBytes = encode(doc);
    if (bytes && bytes.equals(nextBytes)) return [];
    return [{ path: file, originalHash: bytes ? sha256(bytes) : null, nextBytes, mode: 0o600 }];
  }
  function planAdd({ providerId, config, currentBytes, allowExisting = false }) {
    if (typeof providerId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(providerId) ||
      !config || typeof config !== "object" || Array.isArray(config)) throw new TypeError("invalid provider");
    const bytes = currentBytes === undefined ? bytesOnDisk() : currentBytes;
    const doc = readDocument(appId, bytes);
    const node = appId === "hermes" ? normalizeHermes(providerId, config) : structuredClone(config);
    const existing = getNode(appId, doc, providerId);
    if (existing !== undefined) {
      if (allowExisting && isDeepStrictEqual(existing, node)) return [];
      throw new Error("Provider config conflict: native provider key already exists");
    }
    if (appId === "hermes" && doc.providers && Object.hasOwn(doc.providers, providerId)) {
      throw new Error("Provider config conflict: Hermes owns this provider key");
    }
    const providers = providersFor(appId, doc, true);
    if (appId === "hermes") providers.push(node);
    else providers[providerId] = node;
    return change(bytes, doc);
  }
  function planRemove({ providerId, currentBytes }) {
    const bytes = currentBytes === undefined ? bytesOnDisk() : currentBytes;
    const doc = readDocument(appId, bytes);
    const providers = providersFor(appId, doc, false);
    if (!providers || getNode(appId, doc, providerId) === undefined) return [];
    if (appId === "mcode" && [doc.defaultModel, doc.defaultSmallModel, doc.defaultFastModel]
      .some((value) => typeof value === "string" && value.startsWith(`custom_provider:${providerId}/`))) {
      throw new Error("Select another MCode default model before removing this provider");
    }
    if (appId === "hermes") doc.custom_providers = providers.filter((item) => item?.name !== providerId);
    else delete providers[providerId];
    return change(bytes, doc);
  }
  function verify({ providerId, enabled }) {
    return (getNode(appId, read().config, providerId) !== undefined) === Boolean(enabled);
  }
  return { read, planAdd, planRemove, verify, restartHint: () => "restart-agent" };
}

module.exports = { createCoexistingAdapter, readDocument, FILES };
