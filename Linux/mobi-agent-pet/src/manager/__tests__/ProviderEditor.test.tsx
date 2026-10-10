import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProviderEditor } from "../providers/forms/ProviderEditor";
import { getProviderPreset } from "../providers/catalog";
import type { ProviderDraft } from "../providers/types";

describe("ProviderEditor", () => {
  it("keeps an imported provider disabled until the user confirms its configuration", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_draft: ProviderDraft) => {});
    const initialDraft = { appId: "claude" as const, presetId: "claude:002", name: "Imported",
      websiteUrl: "", settingsConfig: { env: { ANTHROPIC_BASE_URL: "https://example.com" } },
      activation: "unavailable" as const, unavailableReason: "导入后请检查配置并补齐凭据",
      metadata: { importSourceId: "source" } };
    render(<ProviderEditor appId="claude" initialDraft={initialDraft}
      editorView={{ appId: "claude", exists: false, config: null }} onSave={save} />);
    await user.click(screen.getByLabelText("我已检查配置，可以启用"));
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].activation).toBe("available");
    expect(save.mock.calls[0][0].unavailableReason).toBeNull();
  });
  it("selects a CC Switch preset, preserves structured config, and saves only once", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async (_draft: ProviderDraft) => {});
    render(<ProviderEditor appId="claude" editorView={{ appId: "claude", exists: false, config: null }} onSave={onSave} />);
    await user.selectOptions(screen.getByLabelText("预设"), "claude:002");
    expect(screen.getByLabelText("名称")).toHaveValue("Kimi");
    expect(screen.getByLabelText("API Key")).toHaveAttribute("type", "password");
    await user.type(screen.getByLabelText("API Key"), "test-key");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.appId).toBe("claude");
    expect((saved.settingsConfig.env as Record<string, unknown>).ANTHROPIC_AUTH_TOKEN).toBe("test-key");
    expect((saved.settingsConfig.env as Record<string, unknown>).ANTHROPIC_BASE_URL)
      .toBe((getProviderPreset("claude", "claude:002")?.settingsConfig.env as Record<string, unknown>).ANTHROPIC_BASE_URL);
  });

  it("rejects malformed JSON without submitting", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async (_draft: ProviderDraft) => {});
    render(<ProviderEditor appId="pi" editorView={{ appId: "pi", exists: false, config: null }} onSave={onSave} />);
    await user.type(screen.getByLabelText("名称"), "Custom");
    await user.clear(screen.getByLabelText("完整配置 JSON"));
    await user.type(screen.getByLabelText("完整配置 JSON"), "not json");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    expect(screen.getByRole("alert")).toHaveTextContent("JSON");
    expect(onSave).not.toHaveBeenCalled();
  });
});
