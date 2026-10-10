"use strict";

const { parse } = require("smol-toml");

function hostOnly(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.host : null;
  } catch { return null; }
}

function publicConnectionSummary(appId, config = {}) {
  let endpoint;
  let models = [];
  if (appId === "claude") {
    const env = config.env || {};
    endpoint = env.ANTHROPIC_BASE_URL;
    models = [env.ANTHROPIC_MODEL, env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
      env.ANTHROPIC_DEFAULT_SONNET_MODEL, env.ANTHROPIC_DEFAULT_OPUS_MODEL];
  } else if (appId === "claude-desktop") {
    endpoint = config.baseUrl || config.env?.ANTHROPIC_BASE_URL;
    models = Array.isArray(config.modelRoutes) ? config.modelRoutes.map((route) => route?.upstreamModel || route?.routeId) : [];
  } else if (appId === "codex" || appId === "grokbuild") {
    let doc = {};
    try { doc = parse(config.config || ""); } catch { /* Invalid TOML remains editable without a guessed summary. */ }
    const selected = doc.model_provider;
    const route = typeof selected === "string" ? doc.model_providers?.[selected] : null;
    const native = doc.models?.default ? doc.model?.[doc.models.default] : null;
    endpoint = route?.base_url || native?.base_url || doc.openai_base_url;
    models = [typeof doc.model === "string" ? doc.model : native?.model];
  } else if (appId === "gemini") {
    endpoint = config.env?.GOOGLE_GEMINI_BASE_URL;
    models = [config.env?.GEMINI_MODEL];
  } else {
    endpoint = config.options?.baseURL || config.baseUrl || config.base_url;
    models = Array.isArray(config.models) ? config.models.map((model) => model?.id)
      : config.models && typeof config.models === "object" ? Object.keys(config.models) : [];
  }
  const modelNames = [...new Set(models.filter((value) => typeof value === "string" && value.length <= 128 &&
    /^[a-zA-Z0-9._:/@+-]+$/.test(value) && !/^(?:sk[-_]|bearer|https?:)/i.test(value)))].slice(0, 12);
  return { apiHost: hostOnly(endpoint), modelNames };
}

module.exports = { publicConnectionSummary };
