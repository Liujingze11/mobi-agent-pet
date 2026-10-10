import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProviderPage } from "../providers/ProviderPage";
import type { AgentLogApi, ProviderSummary, ProviderStatus, ProviderBalanceRule } from "../types";

function apiFixture() {
  const rows: ProviderSummary[] = [];
  let onChanged: ((scope: string) => void) | null = null;
  const api = {
    list: vi.fn(async (appId) => rows.filter((row) => row.appId === appId)),
    getEditDraft: vi.fn(async () => null),
    create: vi.fn(async (draft) => {
      const row: ProviderSummary = { id: "saved", appId: draft.appId, name: draft.name, presetId: draft.presetId,
        activation: draft.activation, unavailableReason: draft.unavailableReason, createdAt: 1, updatedAt: 1 };
      rows.push(row);
      onChanged?.("providers");
      return row;
    }),
    update: vi.fn(async () => null),
    remove: vi.fn(async () => false),
    move: vi.fn(async (id: string, beforeId: string | null) => {
      const index = rows.findIndex((row) => row.id === id);
      const [item] = rows.splice(index, 1);
      rows.splice(beforeId === null ? rows.length : rows.findIndex((row) => row.id === beforeId), 0, item);
      onChanged?.("providers");
      return rows;
    }),
    exportData: vi.fn(async () => ({ format: "mobi-providers-public-v1" as const, providers: [] })),
    importData: vi.fn(async () => ({ added: 1, skipped: 0 })),
    getEditorView: vi.fn(async (appId) => ({ appId, exists: false, config: null })),
    fetchModels: vi.fn(async () => []),
    checkEndpoint: vi.fn(async () => ({ reachable: false, status: 0 })),
    status: vi.fn(async (): Promise<ProviderStatus> => ({ mode: "switch", activeId: null, conflict: false, supported: true, restartHint: "none" })),
    activate: vi.fn(async (id: string): Promise<ProviderStatus> => ({ mode: "switch", activeId: id, conflict: false, supported: true, restartHint: "none" })),
    addToLive: vi.fn(async (id: string) => ({ mode: "coexist" as const, enabledIds: [id], conflict: false, supported: true, restartHint: "restart-agent" })),
    removeFromLive: vi.fn(async () => ({ mode: "coexist" as const, enabledIds: [], conflict: false, supported: true, restartHint: "restart-agent" })),
    restoreOriginal: vi.fn(async () => ({ mode: "switch" as const, activeId: null, conflict: false, supported: true, restartHint: "none" })),
    balance: vi.fn(async () => null),
    refreshBalance: vi.fn(async () => ({ providerId: "saved", kind: "money" as const,
      amount: 12.5, currency: "USD", stale: false, checkedAt: 1000, error: null })),
    getBalanceRule: vi.fn(async () => null),
    setBalanceRule: vi.fn(async (_id, rule) => rule),
  } satisfies AgentLogApi["providers"];
  return { api, rows, onChanged: (callback: (scope: string) => void) => { onChanged = callback; return () => { onChanged = null; }; } };
}

describe("ProviderPage", () => {
  it("does not close a new supplier draft when a cancelled editor's save completes", async () => {
    const user = userEvent.setup();
    const fixture = apiFixture();
    let finish!: (row: ProviderSummary) => void;
    fixture.api.create.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<ProviderPage api={fixture.api} onChanged={fixture.onChanged} />);
    await user.click(screen.getByRole("button", { name: "添加供应商" }));
    await user.type(await screen.findByLabelText("名称"), "First");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    await user.click(screen.getByRole("button", { name: "添加供应商" }));
    await user.type(await screen.findByLabelText("名称"), "Second unsaved draft");
    finish({ id: "saved-a", appId: "claude", name: "First", presetId: null, activation: "available",
      unavailableReason: null, createdAt: 1, updatedAt: 1 });
    await waitFor(() => expect(screen.queryByText("供应商已保存")).not.toBeInTheDocument());
    expect(screen.getByLabelText("名称")).toHaveValue("Second unsaved draft");
  });

  it("does not close a second balance editor when the first rule save completes", async () => {
    const user = userEvent.setup();
    const fixture = apiFixture();
    fixture.rows.push(
      { id: "a", appId: "claude", name: "A", presetId: null, activation: "available", unavailableReason: null, createdAt: 1, updatedAt: 1 },
      { id: "b", appId: "claude", name: "B", presetId: null, activation: "available", unavailableReason: null, createdAt: 1, updatedAt: 1 },
    );
    let finish!: (rule: ProviderBalanceRule | null) => void;
    fixture.api.setBalanceRule.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<ProviderPage api={fixture.api} onChanged={fixture.onChanged} />);
    await screen.findByRole("heading", { name: "A" });
    await user.click(screen.getByLabelText("更多操作 A"));
    await user.click(within(screen.getByRole("article", { name: "A 供应商" })).getByRole("button", { name: "余额设置" }));
    await user.type(await screen.findByLabelText("查询地址（HTTPS）"), "https://a.example/balance");
    await user.click(screen.getByRole("button", { name: "保存查询设置" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    await user.click(screen.getByLabelText("更多操作 B"));
    await user.click(within(screen.getByRole("article", { name: "B 供应商" })).getByRole("button", { name: "余额设置" }));
    await user.type(await screen.findByLabelText("查询地址（HTTPS）"), "https://b.example/unsaved");
    finish(null);
    await waitFor(() => expect(screen.queryByText("余额查询设置已保存")).not.toBeInTheDocument());
    expect(screen.getByLabelText("查询地址（HTTPS）")).toHaveValue("https://b.example/unsaved");
  });
  it("keeps the selected Agent's cards when an earlier activation finishes", async () => {
    const user = userEvent.setup();
    const fixture = apiFixture();
    fixture.rows.push(
      { id: "claude-a", appId: "claude", name: "Claude API", presetId: null, activation: "available", unavailableReason: null, createdAt: 1, updatedAt: 1 },
      { id: "codex-b", appId: "codex", name: "OpenAI API", presetId: null, activation: "available", unavailableReason: null, createdAt: 1, updatedAt: 1 },
    );
    let finish!: (status: ProviderStatus) => void;
    fixture.api.activate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<ProviderPage api={fixture.api} onChanged={fixture.onChanged} />);
    await screen.findByRole("heading", { name: "Claude API" });
    await user.click(screen.getByRole("button", { name: "启用 Claude API 供应商" }));
    await user.click(screen.getByRole("tab", { name: "OpenAI" }));
    await screen.findByRole("heading", { name: "OpenAI API" });
    finish({ mode: "switch", activeId: "claude-a", conflict: false, supported: true, restartHint: "none" });
    await waitFor(() => expect(screen.queryByText("切换中…")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "恢复原配置" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "OpenAI API" })).toBeInTheDocument();
  });
  it("shows the three agreed Agent entries and public API details in supplier cards", async () => {
    const fixture = apiFixture();
    fixture.rows.push({ id: "current", appId: "claude", name: "My Gateway", presetId: null,
      activation: "available", unavailableReason: null, createdAt: 1, updatedAt: 1,
      apiHost: "api.gateway.example", modelNames: ["claude-sonnet-5", "claude-opus-5"] });
    fixture.api.status.mockImplementation(async () => ({ mode: "switch", activeId: "current",
      conflict: false, supported: true, restartHint: "none" }));
    render(<ProviderPage api={fixture.api} onChanged={fixture.onChanged} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Claude Code", "Claude Desktop", "OpenAI"]);
    const card = await screen.findByRole("article", { name: "My Gateway 供应商" });
    expect(card).toHaveTextContent("api.gateway.example");
    expect(card).toHaveTextContent("claude-sonnet-5");
    expect(card).toHaveTextContent("当前使用");
    expect(fixture.api.getEditDraft).not.toHaveBeenCalled();
  });
  it("exports a JSON file without asking the renderer for credentials", async () => {
    const user = userEvent.setup();
    const fixture = apiFixture();
    const createUrl = vi.fn(() => "blob:mobi-provider-test");
    Object.defineProperty(URL, "createObjectURL", { value: createUrl, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      render(<ProviderPage api={fixture.api} onChanged={fixture.onChanged} />);
      await user.click(screen.getByRole("button", { name: "导出列表" }));
      await waitFor(() => expect(fixture.api.exportData).toHaveBeenCalledTimes(1));
      expect(createUrl).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/密钥不会包含/)).toBeInTheDocument();
    } finally { click.mockRestore(); }
  });
  it("imports a public provider document through the page", async () => {
    const user = userEvent.setup();
    const fixture = apiFixture();
    render(<ProviderPage api={fixture.api} onChanged={fixture.onChanged} />);
    const document = { format: "mobi-providers-public-v1", providers: [] };
    const file = new File([JSON.stringify(document)], "providers.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("选择供应商导入文件"), file);
    await waitFor(() => expect(fixture.api.importData).toHaveBeenCalledWith(document));
  });
  it("moves a provider up within its Agent list", async () => {
    const user = userEvent.setup();
    const fixture = apiFixture();
    fixture.rows.push(
      { id: "a", appId: "claude", name: "A", presetId: null, activation: "available",
        unavailableReason: null, createdAt: 1, updatedAt: 1 },
      { id: "b", appId: "claude", name: "B", presetId: null, activation: "available",
        unavailableReason: null, createdAt: 2, updatedAt: 2 },
    );
    render(<ProviderPage api={fixture.api} onChanged={fixture.onChanged} />);
    await screen.findByRole("heading", { name: "B" });
    await user.click(screen.getByLabelText("更多操作 B"));
    await user.click(screen.getByRole("button", { name: "上移 B" }));
    await waitFor(() => expect(fixture.api.move).toHaveBeenCalledWith("b", "a"));
  });
  it("routes the OpenAI entry to Codex, saves and activates a preset", async () => {
    const user = userEvent.setup();
    const fixture = apiFixture();
    render(<ProviderPage api={fixture.api} onChanged={fixture.onChanged} />);
    await user.click(screen.getByRole("tab", { name: "OpenAI" }));
    await user.click(screen.getByRole("button", { name: "添加供应商" }));
    await user.selectOptions(await screen.findByLabelText("预设"), "codex:002");
    await user.click(screen.getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(fixture.api.create).toHaveBeenCalledTimes(1));
    expect(fixture.api.create.mock.calls[0][0].appId).toBe("codex");
    await waitFor(() => expect(screen.getByText(fixture.api.create.mock.calls[0][0].name)).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Claude Code" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Claude Desktop" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /启用 .*供应商/ }));
    await waitFor(() => expect(fixture.api.activate).toHaveBeenCalledWith("saved"));
    expect(await screen.findByText("当前使用")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "恢复原配置" }));
    await waitFor(() => expect(fixture.api.restoreOriginal).toHaveBeenCalledWith("codex"));
    await user.click(screen.getByRole("button", { name: /刷新 .* 余额/ }));
    expect(await screen.findByText(/12\.50/)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/更多操作 /));
    await user.click(screen.getByRole("button", { name: "余额设置" }));
    await user.type(screen.getByLabelText("查询地址（HTTPS）"), "https://billing.example/balance");
    await user.clear(screen.getByLabelText("JSON 数值字段"));
    await user.type(screen.getByLabelText("JSON 数值字段"), "data.remaining");
    await user.click(screen.getByRole("button", { name: "保存查询设置" }));
    await waitFor(() => expect(fixture.api.setBalanceRule).toHaveBeenCalledWith("saved", {
      url: "https://billing.example/balance", method: "GET", valuePath: "data.remaining",
      kind: "money", unit: "CNY",
    }));
  });
});
