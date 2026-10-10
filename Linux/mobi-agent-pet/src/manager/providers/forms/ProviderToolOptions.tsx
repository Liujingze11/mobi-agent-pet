import type { ProviderScope } from "../types";

// Protocol choices adapted from pinned CC Switch provider forms/configs.
// Copyright (c) 2025 Jason Young; MIT license in THIRD_PARTY_NOTICES.md.

type Config = Record<string, unknown>;
const API_PROTOCOLS = [
  ["openai-completions", "OpenAI Completions"],
  ["openai-responses", "OpenAI Responses"],
  ["anthropic-messages", "Anthropic Messages"],
  ["google-generative-ai", "Google Generative AI"],
  ["bedrock-converse-stream", "AWS Bedrock"],
] as const;
const HERMES_MODES = [
  ["chat_completions", "Chat Completions"],
  ["anthropic_messages", "Anthropic Messages"],
  ["codex_responses", "Codex Responses"],
  ["bedrock_converse", "AWS Bedrock"],
] as const;

export function ProviderToolOptions({ appId, config, onChange }: {
  appId: ProviderScope;
  config: Config;
  onChange(config: Config): void;
}) {
  if (appId === "opencode") return <label className="provider-field">SDK 包
    <input value={typeof config.npm === "string" ? config.npm : ""}
      onChange={(event) => onChange({ ...config, npm: event.target.value })} />
  </label>;
  if (appId === "openclaw" || appId === "pi" || appId === "mcode" || appId === "hermes") {
    const field = appId === "hermes" ? "api_mode" : "api";
    const value = typeof config[field] === "string" ? config[field] as string : "";
    const options = appId === "hermes" ? HERMES_MODES : API_PROTOCOLS;
    return <label className="provider-field">API 协议
      <select value={value} onChange={(event) => onChange({ ...config, [field]: event.target.value })}>
        {value && !options.some(([id]) => id === value) ? <option value={value}>{value}</option> : null}
        {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </label>;
  }
  return null;
}
