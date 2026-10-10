import { describe, expect, it } from "vitest";
import { createProviderDraft, getProviderPreset, listProviderPresets, PROVIDER_APP_IDS } from "../providers/catalog";

describe("CC Switch provider catalog", () => {
  it("offers a nonempty ordered catalog for every supported tool", () => {
    expect(PROVIDER_APP_IDS).toEqual([
      "claude", "codex", "gemini", "grokbuild", "claude-desktop",
      "opencode", "openclaw", "hermes", "pi", "mcode",
    ]);
    const expectedCounts = {
      claude: 94, codex: 93, gemini: 26, grokbuild: 39,
      "claude-desktop": 91, opencode: 82, openclaw: 82,
      hermes: 83, pi: 78, mcode: 77,
    };
    for (const appId of PROVIDER_APP_IDS) {
      const presets = listProviderPresets(appId);
      expect(presets.length, appId).toBe(expectedCounts[appId]);
      expect(new Set(presets.map((preset) => preset.id)).size).toBe(presets.length);
      expect(presets.every((preset) => preset.appId === appId)).toBe(true);
    }
  });

  it("includes CC Switch's two universal gateway entries", () => {
    expect(listProviderPresets("universal").map(({ name }) => name)).toEqual(["NewAPI", "自定义网关"]);
  });

  it("retains tool-specific raw configuration and keeps same-named presets scoped", () => {
    const claude = listProviderPresets("claude");
    const codex = listProviderPresets("codex");
    const claudeKimi = claude.find((preset) => preset.name === "Kimi");
    const codexKimi = codex.find((preset) => preset.name === "Kimi");
    expect(claudeKimi?.settingsConfig).toHaveProperty("env");
    expect(codexKimi?.settingsConfig).toHaveProperty("config");
    expect(claudeKimi?.id).not.toBe(codexKimi?.id);
    expect(getProviderPreset("claude", codexKimi!.id)).toBeNull();
    const draft = createProviderDraft("codex", codexKimi!.id);
    expect(draft.appId).toBe("codex");
    expect(draft.settingsConfig).toEqual(codexKimi!.settingsConfig);
    expect(draft.settingsConfig).not.toBe(codexKimi!.settingsConfig);
  });

  it("starts custom providers with each Agent's native config structure", () => {
    expect(createProviderDraft("claude").settingsConfig).toHaveProperty("env");
    expect(createProviderDraft("codex").settingsConfig).toHaveProperty("config");
    expect(createProviderDraft("gemini").settingsConfig).toHaveProperty("env");
    expect(createProviderDraft("grokbuild").settingsConfig).toHaveProperty("config");
    expect(createProviderDraft("claude-desktop").settingsConfig).toHaveProperty("modelRoutes");
    expect(createProviderDraft("opencode").settingsConfig).toHaveProperty("options.baseURL");
    expect(createProviderDraft("openclaw").settingsConfig).toHaveProperty("models");
    expect(createProviderDraft("hermes").settingsConfig).toHaveProperty("api_mode");
    expect(createProviderDraft("pi").settingsConfig).toHaveProperty("models");
    expect(createProviderDraft("mcode").settingsConfig).toHaveProperty("options.baseURL");
    expect(createProviderDraft("universal").settingsConfig).toHaveProperty("apps.claude");
  });
});
