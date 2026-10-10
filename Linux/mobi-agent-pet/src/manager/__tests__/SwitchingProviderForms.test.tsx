import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProviderEditor } from "../providers/forms/ProviderEditor";
import type { ProviderDraft, ProviderAppId } from "../providers/types";
import type { AgentLogApi } from "../types";
import { parse } from "smol-toml";

describe("switching provider forms", () => {
  it("edits the selected Codex route while preserving other endpoints", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_draft: ProviderDraft) => {});
    render(<ProviderEditor appId="codex" editorView={{ appId: "codex", exists: false, config: null }} onSave={save}
      initialDraft={{ appId: "codex", presetId: null, name: "Two routes", websiteUrl: "", activation: "available",
        unavailableReason: null, metadata: {}, settingsConfig: { auth: { OPENAI_API_KEY: "key" }, config:
          'model_provider = "chosen"\nmodel = "current"\n[model_providers.other]\nbase_url = "https://other.test/v1"\n' +
          '[model_providers.chosen]\nbase_url = "https://chosen.test/v1"\nwire_api = "responses"\n' } }} />);
    expect(screen.getByLabelText("接口地址")).toHaveValue("https://chosen.test/v1");
    await user.clear(screen.getByLabelText("接口地址"));
    await user.type(screen.getByLabelText("接口地址"), "https://new.test/v1");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const doc = parse(save.mock.calls[0][0].settingsConfig.config as string);
    expect((doc.model_providers as Record<string, { base_url: string }>).other.base_url).toBe("https://other.test/v1");
    expect((doc.model_providers as Record<string, { base_url: string }>).chosen.base_url).toBe("https://new.test/v1");
    cleanup();
  });

  it("edits imported native Grok model credentials and endpoint", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_draft: ProviderDraft) => {});
    render(<ProviderEditor appId="grokbuild" editorView={{ appId: "grokbuild", exists: false, config: null }} onSave={save}
      initialDraft={{ appId: "grokbuild", presetId: null, name: "Native", websiteUrl: "", activation: "available",
        unavailableReason: null, metadata: {}, settingsConfig: { config:
          '[models]\ndefault = "route"\n[model.route]\nmodel = "grok-model"\nbase_url = "https://grok.test/v1"\napi_backend = "responses"\n' } }} />);
    expect(screen.getByLabelText("模型")).toHaveValue("grok-model");
    await user.type(screen.getByLabelText("API Key"), "new-key");
    await user.clear(screen.getByLabelText("接口地址"));
    await user.type(screen.getByLabelText("接口地址"), "https://new.test/v1");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const doc = parse(save.mock.calls[0][0].settingsConfig.config as string);
    expect((doc.model as Record<string, { api_key: string; base_url: string }>).route)
      .toMatchObject({ api_key: "new-key", base_url: "https://new.test/v1" });
    cleanup();
  });
  it("adds fetched Claude Desktop models as routes instead of an unused model field", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_draft: ProviderDraft) => {});
    const api: Pick<AgentLogApi["providers"], "fetchModels" | "checkEndpoint"> = {
      fetchModels: async () => ["claude-sonnet-5"], checkEndpoint: async () => ({ reachable: true, status: 200 }),
    };
    render(<ProviderEditor appId="claude-desktop" editorView={{ appId: "claude-desktop", exists: false, config: null }}
      api={api} onSave={save} />);
    await user.type(screen.getByLabelText("名称"), "Direct");
    await user.type(screen.getByLabelText("接口地址"), "https://gateway.example");
    await user.click(screen.getByRole("button", { name: "获取模型" }));
    const fetched = await screen.findByRole("button", { name: "claude-sonnet-5" });
    await user.click(fetched);
    await user.click(fetched);
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].settingsConfig.modelRoutes).toEqual([
      { routeId: "claude-sonnet-5", upstreamModel: "claude-sonnet-5" },
    ]);
    expect(save.mock.calls[0][0].settingsConfig).not.toHaveProperty("model");
    cleanup();
  });
  it("edits Claude model roles and Desktop route fields without raw JSON", async () => {
    const user = userEvent.setup();
    const claudeSave = vi.fn(async (_draft: ProviderDraft) => {});
    const claude = render(<ProviderEditor appId="claude"
      editorView={{ appId: "claude", exists: false, config: null }} onSave={claudeSave} />);
    await user.selectOptions(screen.getByLabelText("预设"), "claude:002");
    await user.click(screen.getByText("各工具配置字段"));
    await user.clear(screen.getByLabelText("env.ANTHROPIC_DEFAULT_SONNET_MODEL"));
    await user.type(screen.getByLabelText("env.ANTHROPIC_DEFAULT_SONNET_MODEL"), "sonnet-custom");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(claudeSave).toHaveBeenCalledTimes(1));
    expect((claudeSave.mock.calls[0][0].settingsConfig.env as Record<string, unknown>).ANTHROPIC_DEFAULT_SONNET_MODEL)
      .toBe("sonnet-custom");
    claude.unmount();

    const desktopSave = vi.fn(async (_draft: ProviderDraft) => {});
    render(<ProviderEditor appId="claude-desktop"
      editorView={{ appId: "claude-desktop", exists: false, config: null }} onSave={desktopSave} />);
    await user.selectOptions(screen.getByLabelText("预设"), "claude-desktop:002");
    await user.click(screen.getByText("各工具配置字段"));
    await user.clear(screen.getByLabelText("modelRoutes.0.upstreamModel"));
    await user.type(screen.getByLabelText("modelRoutes.0.upstreamModel"), "custom-model");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(desktopSave).toHaveBeenCalledTimes(1));
    expect((desktopSave.mock.calls[0][0].settingsConfig.modelRoutes as Array<{upstreamModel:string}>)[0].upstreamModel)
      .toBe("custom-model");
    cleanup();
  });
  it("updates Codex endpoint inside TOML while preserving other settings", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_draft: ProviderDraft) => {});
    render(<ProviderEditor appId="codex" editorView={{ appId: "codex", exists: false, config: null }} onSave={save} />);
    await user.selectOptions(screen.getByLabelText("预设"), "codex:002");
    await user.clear(screen.getByLabelText("接口地址"));
    await user.type(screen.getByLabelText("接口地址"), "https://example.com/v1");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].settingsConfig.config).toContain('base_url = "https://example.com/v1"');
    expect(save.mock.calls[0][0].settingsConfig.config).toContain("wire_api");
    cleanup();
  });

  it.each([
    ["claude", "claude:002", "env"],
    ["codex", "codex:002", "config"],
    ["gemini", "gemini:002", "env"],
    ["grokbuild", "grokbuild:002", "config"],
    ["claude-desktop", "claude-desktop:002", "modelRoutes"],
  ] as const)("retains %s preset-specific config on save", async (appId, presetId, field) => {
    const user = userEvent.setup();
    const save = vi.fn(async (_draft: ProviderDraft) => {});
    render(<ProviderEditor appId={appId as ProviderAppId} editorView={{ appId, exists: false, config: null }} onSave={save} />);
    await user.selectOptions(screen.getByLabelText("预设"), presetId);
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].settingsConfig).toHaveProperty(field);
    cleanup();
  });
});
