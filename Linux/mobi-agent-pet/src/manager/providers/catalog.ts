// Preset data is copied from CC Switch at the commit recorded in docs/third-party.
// Copyright (c) 2025 Jason Young; MIT license in THIRD_PARTY_NOTICES.md.
import presetData from "./catalog/presets.json";
import { PROVIDER_APP_IDS } from "./types";
import type { ProviderAppId, ProviderDraft, ProviderPreset, ProviderScope } from "./types";

export { PROVIDER_APP_IDS };
export type { ProviderAppId, ProviderDraft, ProviderPreset, ProviderScope };

type RawPreset = Record<string, unknown> & { id: string; appId: ProviderScope; name: string };
const catalog = presetData as Record<ProviderScope, RawPreset[]>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function configFor(raw: RawPreset): Record<string, unknown> {
  if (raw.settingsConfig && typeof raw.settingsConfig === "object" && !Array.isArray(raw.settingsConfig)) {
    return clone(raw.settingsConfig as Record<string, unknown>);
  }
  // CC Switch stores these tools' connection fields at the preset root.
  if (raw.appId === "grokbuild") return clone({ auth: raw.auth || {}, config: raw.config || "" });
  if (raw.appId === "claude-desktop") return clone({
    baseUrl: raw.baseUrl || "", mode: raw.mode || "", apiFormat: raw.apiFormat || "",
    apiKey: "", modelRoutes: raw.modelRoutes || [],
  });
  return {};
}

function customConfig(appId: ProviderScope): Record<string, unknown> {
  const toml = 'model_provider = "custom"\nmodel = ""\n\n[model_providers.custom]\nname = "Custom"\nbase_url = ""\nwire_api = "responses"\nrequires_openai_auth = true\n';
  switch (appId) {
    case "claude": return { env: { ANTHROPIC_BASE_URL: "", ANTHROPIC_AUTH_TOKEN: "", ANTHROPIC_MODEL: "" } };
    case "codex":
    case "grokbuild": return { auth: { OPENAI_API_KEY: "" }, config: toml };
    case "gemini": return { env: { GOOGLE_GEMINI_BASE_URL: "", GEMINI_API_KEY: "", GEMINI_MODEL: "" } };
    case "claude-desktop": return { baseUrl: "", apiKey: "", mode: "direct", apiFormat: "anthropic", modelRoutes: [] };
    case "opencode": return { npm: "@ai-sdk/openai-compatible", name: "", options: { baseURL: "", apiKey: "" }, models: {} };
    case "openclaw": return { baseUrl: "", apiKey: "", api: "openai-completions", models: [] };
    case "hermes": return { name: "", base_url: "", api_key: "", api_mode: "chat_completions", models: [] };
    case "pi": return { name: "", baseUrl: "", api: "openai-completions", apiKey: "", models: [] };
    case "mcode": return { name: "", kind: "custom", enabled: true, api: "openai-completions",
      options: { baseURL: "", apiKey: "" }, models: {} };
    case "universal": return { baseUrl: "", apiKey: "", apps: { claude: true, codex: true, gemini: true },
      models: { claude: { model: "", haikuModel: "", sonnetModel: "", opusModel: "" },
        codex: { model: "", reasoningEffort: "high" }, gemini: { model: "" } } };
  }
}

function needsProxy(raw: RawPreset): boolean {
  if (raw.appId === "claude-desktop") return raw.mode === "proxy";
  const format = raw.apiFormat;
  if (raw.appId === "claude") return Boolean(format && format !== "anthropic");
  if (raw.appId === "codex" || raw.appId === "grokbuild") {
    return Boolean(format && format !== "responses" && format !== "openai_responses");
  }
  return false;
}

function normalize(raw: RawPreset): ProviderPreset {
  return {
    ...clone(raw),
    settingsConfig: configFor(raw),
    requiresProxy: needsProxy(raw),
    requiresManagedAuth: raw.requiresOAuth === true,
  } as ProviderPreset;
}

export function listProviderPresets(appId: ProviderScope): ProviderPreset[] {
  return (catalog[appId] || []).map(normalize);
}

export function getProviderPreset(appId: ProviderScope, id: string): ProviderPreset | null {
  const raw = (catalog[appId] || []).find((preset) => preset.id === id);
  return raw ? normalize(raw) : null;
}

export function createProviderDraft(appId: ProviderScope, presetId?: string | null): ProviderDraft {
  const preset = presetId ? getProviderPreset(appId, presetId) : null;
  if (presetId && !preset) throw new Error(`Unknown ${appId} preset`);
  const unavailableReason = preset?.requiresManagedAuth
    ? "Requires CC Switch managed sign-in"
    : preset?.requiresProxy ? "Requires a local protocol proxy" : null;
  const { id: _id, appId: _appId, name: _name, settingsConfig: _settingsConfig,
    requiresProxy: _requiresProxy, requiresManagedAuth: _requiresManagedAuth, ...metadata } = preset ||
    { id: "", appId, name: "", settingsConfig: {}, requiresProxy: false, requiresManagedAuth: false };
  return {
    appId,
    presetId: preset?.id || null,
    name: preset?.name || "",
    websiteUrl: typeof preset?.websiteUrl === "string" ? preset.websiteUrl : "",
    settingsConfig: preset ? clone(preset.settingsConfig) : customConfig(appId),
    activation: unavailableReason ? "unavailable" : "available",
    unavailableReason,
    metadata: clone(metadata),
  };
}
