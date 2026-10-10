import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProviderEditor } from "../providers/forms/ProviderEditor";
import type { ProviderDraft, ProviderAppId } from "../providers/types";
import type { AgentLogApi } from "../types";

describe("coexisting provider forms", () => {
  it.each(["opencode", "openclaw"] as const)("adds fetched %s models to its native model list once", async (appId) => {
    const user = userEvent.setup();
    const save = vi.fn(async (_draft: ProviderDraft) => {});
    const api: Pick<AgentLogApi["providers"], "fetchModels" | "checkEndpoint"> = {
      fetchModels: async () => ["fetched-model"], checkEndpoint: async () => ({ reachable: true, status: 200 }),
    };
    render(<ProviderEditor appId={appId} editorView={{ appId, exists: false, config: null }} api={api} onSave={save} />);
    await user.selectOptions(screen.getByLabelText("预设"), `${appId}:002`);
    await user.click(screen.getByRole("button", { name: "获取模型" }));
    const fetched = await screen.findByRole("button", { name: "fetched-model" });
    await user.click(fetched);
    await user.click(fetched);
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const config = save.mock.calls[0][0].settingsConfig;
    if (appId === "opencode") expect((config.models as Record<string, unknown>)["fetched-model"]).toEqual({ name: "fetched-model" });
    else expect((config.models as Array<{ id: string }>).filter((item) => item.id === "fetched-model")).toHaveLength(1);
    expect(config).not.toHaveProperty("model");
    cleanup();
  });
  it("edits OpenCode package and a model limit through structured fields", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_draft: ProviderDraft) => {});
    render(<ProviderEditor appId="opencode" editorView={{ appId: "opencode", exists: false, config: null }}
      onSave={save} />);
    await user.selectOptions(screen.getByLabelText("预设"), "opencode:002");
    await user.click(screen.getByText("各工具配置字段"));
    await user.clear(screen.getByLabelText("npm"));
    await user.type(screen.getByLabelText("npm"), "@ai-sdk/anthropic");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].settingsConfig.npm).toBe("@ai-sdk/anthropic");
    cleanup();
  });
  it("keeps long API keys masked in structured fields", async () => {
    const user = userEvent.setup();
    render(<ProviderEditor appId="opencode" editorView={{ appId: "opencode", exists: false, config: null }}
      initialDraft={{ appId: "opencode", presetId: null, name: "Private", websiteUrl: "",
        settingsConfig: { options: { apiKey: "s".repeat(200) } }, activation: "available",
        unavailableReason: null, metadata: {} }} onSave={vi.fn()} />);
    await user.click(screen.getByText("各工具配置字段"));
    expect(screen.getByLabelText("options.apiKey")).toHaveAttribute("type", "password");
    cleanup();
  });
  it("adds and removes native model entries in OpenCode and Pi forms", async () => {
    const user = userEvent.setup();
    const opencodeSave = vi.fn(async (_draft: ProviderDraft) => {});
    const opencode = render(<ProviderEditor appId="opencode"
      editorView={{ appId: "opencode", exists: false, config: null }} onSave={opencodeSave} />);
    await user.selectOptions(screen.getByLabelText("预设"), "opencode:002");
    await user.click(screen.getByText("模型列表"));
    await user.type(screen.getByLabelText("新增模型 ID"), "my-model");
    await user.type(screen.getByLabelText("新增模型名称"), "My Model");
    await user.click(screen.getByRole("button", { name: "添加模型" }));
    await user.click(screen.getByRole("button", { name: "移除模型 kimi-k3" }));
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(opencodeSave).toHaveBeenCalledTimes(1));
    const openModels = opencodeSave.mock.calls[0][0].settingsConfig.models as Record<string, unknown>;
    expect(openModels["my-model"]).toEqual({ name: "My Model" });
    expect(openModels).not.toHaveProperty("kimi-k3");
    opencode.unmount();

    const piSave = vi.fn(async (_draft: ProviderDraft) => {});
    render(<ProviderEditor appId="pi" editorView={{ appId: "pi", exists: false, config: null }}
      onSave={piSave} />);
    await user.selectOptions(screen.getByLabelText("预设"), "pi:001");
    await user.click(screen.getByText("模型列表"));
    await user.type(screen.getByLabelText("新增模型 ID"), "pi-new");
    await user.click(screen.getByRole("button", { name: "添加模型" }));
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(piSave).toHaveBeenCalledTimes(1));
    expect((piSave.mock.calls[0][0].settingsConfig.models as Array<{ id: string }>).at(-1)?.id).toBe("pi-new");
    cleanup();
  });
  it("renames an OpenCode model ID while retaining its options", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_draft: ProviderDraft) => {});
    render(<ProviderEditor appId="opencode" editorView={{ appId: "opencode", exists: false, config: null }}
      onSave={save} />);
    await user.selectOptions(screen.getByLabelText("预设"), "opencode:002");
    await user.click(screen.getByText("模型列表"));
    const idField = screen.getByLabelText("模型 kimi-k3 ID");
    await user.clear(idField);
    await user.type(idField, "kimi-k3-new");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const models = save.mock.calls[0][0].settingsConfig.models as Record<string, unknown>;
    expect(models["kimi-k3-new"]).toBeDefined();
    expect(models).not.toHaveProperty("kimi-k3");
    cleanup();
  });
  it.each([
    ["opencode", "options", "apiKey", "baseURL"],
    ["mcode", "options", "apiKey", "baseURL"],
    ["hermes", "", "api_key", "base_url"],
  ] as const)("stores custom %s credentials in native fields", async (appId, parent, key, endpoint) => {
    const user = userEvent.setup();
    const save = vi.fn(async (_draft: ProviderDraft) => {});
    render(<ProviderEditor appId={appId} editorView={{ appId, exists: false, config: null }} onSave={save} />);
    await user.type(screen.getByLabelText("名称"), "Custom");
    await user.type(screen.getByLabelText("API Key"), "private-token");
    await user.type(screen.getByLabelText("接口地址"), "https://api.example.com/v1");
    expect(screen.queryByLabelText("模型")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const config = save.mock.calls[0][0].settingsConfig;
    const native = parent ? config[parent] as Record<string, unknown> : config;
    expect(native[key]).toBe("private-token");
    expect(native[endpoint]).toBe("https://api.example.com/v1");
    cleanup();
  });
  it("edits the native package and API protocol without JSON", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_draft: ProviderDraft) => {});
    const opencode = render(<ProviderEditor appId="opencode"
      editorView={{ appId: "opencode", exists: false, config: null }} onSave={save} />);
    await user.clear(screen.getByLabelText("SDK 包"));
    await user.type(screen.getByLabelText("SDK 包"), "@ai-sdk/anthropic");
    await user.type(screen.getByLabelText("名称"), "My Provider");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].settingsConfig.npm).toBe("@ai-sdk/anthropic");
    opencode.unmount();

    const hermesSave = vi.fn(async (_draft: ProviderDraft) => {});
    render(<ProviderEditor appId="hermes" editorView={{ appId: "hermes", exists: false, config: null }}
      onSave={hermesSave} />);
    await user.selectOptions(screen.getByLabelText("API 协议"), "anthropic_messages");
    await user.type(screen.getByLabelText("名称"), "My Provider");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(hermesSave).toHaveBeenCalledTimes(1));
    expect(hermesSave.mock.calls[0][0].settingsConfig.api_mode).toBe("anthropic_messages");
    cleanup();
  });
  it.each(["opencode", "hermes", "pi", "mcode"] as const)(
    "uses the entered custom %s name in the native config", async (appId) => {
      const user = userEvent.setup();
      const save = vi.fn(async (_draft: ProviderDraft) => {});
      render(<ProviderEditor appId={appId} editorView={{ appId, exists: false, config: null }} onSave={save} />);
      await user.type(screen.getByLabelText("名称"), "My Provider");
      await user.click(screen.getByRole("button", { name: "保存供应商" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(save.mock.calls[0][0].settingsConfig.name).toBe("My Provider");
      cleanup();
    },
  );
  it("saves an editable native provider key and rejects invalid keys", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_draft: ProviderDraft) => {});
    const opencode = render(<ProviderEditor appId="opencode"
      editorView={{ appId: "opencode", exists: false, config: null }} onSave={save} />);
    await user.type(screen.getByLabelText("名称"), "Alpha Gateway");
    expect(screen.getByLabelText("配置标识")).toHaveValue("alpha-gateway");
    await user.clear(screen.getByLabelText("配置标识"));
    await user.type(screen.getByLabelText("配置标识"), "bad key");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    expect(save).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("配置标识"));
    await user.type(screen.getByLabelText("配置标识"), "alpha-one");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].metadata.providerKey).toBe("alpha-one");
    opencode.unmount();

    render(<ProviderEditor appId="pi" editorView={{ appId: "pi", exists: false, config: null }}
      onSave={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText("预设"), "pi:001");
    expect(screen.getByLabelText("配置标识")).toHaveValue("cc-switch-kimi");
    cleanup();
  });
  it.each([
    ["opencode", "opencode:001", "models"],
    ["openclaw", "openclaw:001", "models"],
    ["hermes", "hermes:001", "models"],
    ["pi", "pi:001", "models"],
    ["mcode", "mcode:001", "models"],
  ] as const)("keeps %s's model catalog and tool-specific options", async (appId, presetId, field) => {
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
