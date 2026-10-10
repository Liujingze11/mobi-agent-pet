import type { ProviderScope } from "../types";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

type Config = Record<string, unknown>;
type Path = string[];
const KEY_NAMES = ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "apiKey", "api_key", "key", "token"];
const ENDPOINT_NAMES = ["ANTHROPIC_BASE_URL", "GOOGLE_GEMINI_BASE_URL", "baseUrl", "baseURL", "base_url", "endpoint", "apiUrl"];
const MODEL_NAMES = ["ANTHROPIC_MODEL", "GEMINI_MODEL", "model", "modelName"];

function isTomlTool(appId: ProviderScope) { return appId === "codex" || appId === "grokbuild"; }

function tomlDocument(config: Config): Config | null {
  try { return parseToml(typeof config.config === "string" ? config.config : "") as unknown as Config; }
  catch { return null; }
}

function nativeGrokRoute(doc: Config): Config | null {
  if (!doc.model || typeof doc.model !== "object" || Array.isArray(doc.model)) return null;
  const tables = doc.model as Config;
  const selected = (doc.models as Config)?.default;
  const key = typeof selected === "string" ? selected : Object.keys(tables).length === 1 ? Object.keys(tables)[0] : null;
  const route = key ? tables[key] : null;
  return route && typeof route === "object" && !Array.isArray(route) ? route as Config : null;
}

function readTomlField(config: Config, appId: ProviderScope, kind: "key" | "endpoint" | "model") {
  const doc = tomlDocument(config);
  if (!doc) return "";
  const native = appId === "grokbuild" ? nativeGrokRoute(doc) : null;
  const provider = typeof doc.model_provider === "string" ? (doc.model_providers as Config)?.[doc.model_provider] as Config : null;
  const value = native ? native[kind === "endpoint" ? "base_url" : kind === "key" ? "api_key" : "model"]
    : kind === "endpoint" ? provider?.base_url || doc.openai_base_url : kind === "model" ? doc.model : undefined;
  return typeof value === "string" ? value : "";
}

function writeTomlField(config: Config, appId: ProviderScope, kind: "key" | "endpoint" | "model", value: string): Config {
  const doc = tomlDocument(config);
  if (!doc) return config;
  const native = appId === "grokbuild" ? nativeGrokRoute(doc) : null;
  if (native) native[kind === "endpoint" ? "base_url" : kind === "key" ? "api_key" : "model"] = value;
  else {
    if (appId === "grokbuild" && typeof doc.model === "object") return config;
    if (kind === "model") doc.model = value;
    else if (kind === "endpoint") {
      const selected = typeof doc.model_provider === "string" ? doc.model_provider : "custom";
      doc.model_provider = selected;
      if (!doc.model_providers || typeof doc.model_providers !== "object" || Array.isArray(doc.model_providers)) doc.model_providers = {};
      const tables = doc.model_providers as Config;
      if (!tables[selected] || typeof tables[selected] !== "object" || Array.isArray(tables[selected])) tables[selected] = {};
      (tables[selected] as Config).base_url = value;
    }
  }
  return { ...config, config: stringifyToml(doc as Parameters<typeof stringifyToml>[0]) };
}

function findPath(value: unknown, names: string[], prefix: string[] = []): Path | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Config;
  for (const name of names) if (typeof object[name] === "string") return [...prefix, name];
  for (const [key, item] of Object.entries(object)) {
    const found = findPath(item, names, [...prefix, key]);
    if (found) return found;
  }
  return null;
}

function defaultPath(appId: ProviderScope, kind: "key" | "endpoint" | "model"): Path {
  if (appId === "claude") return kind === "key" ? ["env", "ANTHROPIC_AUTH_TOKEN"]
    : kind === "endpoint" ? ["env", "ANTHROPIC_BASE_URL"] : ["env", "ANTHROPIC_MODEL"];
  if (appId === "codex" || appId === "grokbuild") return kind === "key" ? ["auth", "OPENAI_API_KEY"]
    : kind === "endpoint" ? ["baseUrl"] : ["model"];
  if (appId === "opencode" || appId === "mcode") return kind === "key" ? ["options", "apiKey"]
    : kind === "endpoint" ? ["options", "baseURL"] : ["model"];
  if (appId === "hermes") return kind === "key" ? ["api_key"]
    : kind === "endpoint" ? ["base_url"] : ["model"];
  return kind === "key" ? ["apiKey"] : kind === "endpoint" ? ["baseUrl"] : ["model"];
}

export function fieldPath(config: Config, appId: ProviderScope, kind: "key" | "endpoint" | "model"): Path {
  if ((appId === "opencode" || appId === "mcode" || appId === "hermes") && kind !== "model") {
    return defaultPath(appId, kind);
  }
  return findPath(config, kind === "key" ? KEY_NAMES : kind === "endpoint" ? ENDPOINT_NAMES : MODEL_NAMES)
    || defaultPath(appId, kind);
}

export function readField(config: Config, appId: ProviderScope, kind: "key" | "endpoint" | "model"): string {
  if ((kind !== "key" && isTomlTool(appId)) || (appId === "grokbuild" && nativeGrokRoute(tomlDocument(config) || {}))) {
    return readTomlField(config, appId, kind);
  }
  const path = fieldPath(config, appId, kind);
  let value: unknown = config;
  for (const segment of path) value = (value as Config)?.[segment];
  return typeof value === "string" ? value : "";
}

export function writeField(config: Config, appId: ProviderScope, kind: "key" | "endpoint" | "model", value: string): Config {
  if ((kind !== "key" && isTomlTool(appId)) || (appId === "grokbuild" && nativeGrokRoute(tomlDocument(config) || {}))) {
    return writeTomlField(config, appId, kind, value);
  }
  const next = structuredClone(config);
  const path = fieldPath(next, appId, kind);
  let parent = next;
  for (const segment of path.slice(0, -1)) {
    if (!parent[segment] || typeof parent[segment] !== "object" || Array.isArray(parent[segment])) parent[segment] = {};
    parent = parent[segment] as Config;
  }
  parent[path.at(-1)!] = value;
  return next;
}

export function ProviderFields({ appId, config, onChange }: {
  appId: ProviderScope;
  config: Config;
  onChange(config: Config): void;
}) {
  return <div className="provider-fields-grid">
    <label className="provider-field">API Key
      <input type="password" autoComplete="off" value={readField(config, appId, "key")}
        onChange={(event) => onChange(writeField(config, appId, "key", event.target.value))} />
    </label>
    <label className="provider-field">接口地址
      <input type="url" value={readField(config, appId, "endpoint")}
        onChange={(event) => onChange(writeField(config, appId, "endpoint", event.target.value))} />
    </label>
    {["claude", "codex", "gemini", "grokbuild"].includes(appId) ? <label className="provider-field">模型
      <input value={readField(config, appId, "model")}
        onChange={(event) => onChange(writeField(config, appId, "model", event.target.value))} />
    </label> : null}
  </div>;
}
