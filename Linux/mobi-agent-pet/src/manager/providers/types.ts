export const PROVIDER_APP_IDS = [
  "claude", "codex", "gemini", "grokbuild", "claude-desktop",
  "opencode", "openclaw", "hermes", "pi", "mcode",
] as const;

export type ProviderAppId = typeof PROVIDER_APP_IDS[number];
export type ProviderScope = ProviderAppId | "universal";

export type ProviderPreset = {
  id: string;
  appId: ProviderScope;
  name: string;
  websiteUrl?: string;
  settingsConfig: Record<string, unknown>;
  requiresProxy: boolean;
  requiresManagedAuth: boolean;
  [field: string]: unknown;
};

export type ProviderDraft = {
  appId: ProviderScope;
  presetId: string | null;
  name: string;
  websiteUrl: string;
  settingsConfig: Record<string, unknown>;
  activation: "available" | "unavailable";
  unavailableReason: string | null;
  metadata: Record<string, unknown>;
};
