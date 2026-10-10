import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type {
  AgentLogApi,
  DiagnosticsHealth,
  OverviewSnapshot,
  ProjectPath,
  ProjectSummary,
  SessionSummary,
  UsageReport,
} from "../types";

const emptyOverview: OverviewSnapshot = {
  pendingProjectCount: 0,
  activeAgentSessions: [],
  humanTimer: null,
  today: { agentSessionMs: 0, agentActiveMs: 0, humanMs: 0 },
  recentActivity: [],
};

const emptyUsageReport: UsageReport = {
  period: "day", start: 0, end: 3_000, previousMs: 0, totalMs: 0, sessionCount: 0,
  buckets: [], projects: [],
};

const worktreePath = {
  id: "path-worktree",
  projectId: "project-worktree",
  path: "/worktrees/agentlog-pet",
  canonicalPath: "/worktrees/agentlog-pet",
  kind: "worktree",
  isAvailable: true,
  gitRoot: "/worktrees/agentlog-pet",
  gitRemoteIdentity: "github.com/openai/agentlog-pet",
  gitBranch: "feature/manager-shell",
  createdAt: 1,
  updatedAt: 2,
} satisfies ProjectPath;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createApi(options: {
  diagnostics?: (DiagnosticsHealth & Record<string, unknown>) | Promise<DiagnosticsHealth & Record<string, unknown>>;
  language?: string;
  overview?: OverviewSnapshot | Promise<OverviewSnapshot>;
  projects?: ProjectSummary[] | Promise<ProjectSummary[]>;
  sessions?: SessionSummary[] | Promise<SessionSummary[]>;
  usageReport?: UsageReport | Promise<UsageReport>;
} = {}) {
  const listeners = new Set<(scope: string) => void>();
  let language = options.language ?? "en";
  const diagnostics = options.diagnostics ?? {
    storage: "ready",
    databaseName: "agentlog.db",
    errorMessage: null,
    tray: { status: "starting", code: null },
  };
  const overview = options.overview ?? emptyOverview;
  const projects = options.projects ?? [];
  const sessions = options.sessions ?? [];
  const usageReport = options.usageReport ?? emptyUsageReport;
  const api = {
    providers: {
      list: vi.fn(async () => []),
      getEditDraft: vi.fn(async () => null),
      create: vi.fn(async (_input) => { throw new Error("not implemented in fixture"); }),
      update: vi.fn(async () => null),
      remove: vi.fn(async () => false),
      move: vi.fn(async () => []),
      exportData: vi.fn(async () => ({ format: "mobi-providers-public-v1" as const, providers: [] })),
      importData: vi.fn(async () => ({ added: 0, skipped: 0 })),
      getEditorView: vi.fn(async (appId) => ({ appId, exists: false, config: null })),
      fetchModels: vi.fn(async () => []),
      checkEndpoint: vi.fn(async () => ({ reachable: false, status: 0 })),
      status: vi.fn(async () => ({ mode: "switch" as const, activeId: null, conflict: false, supported: true, restartHint: "none" })),
      activate: vi.fn(async (id: string) => ({ mode: "switch" as const, activeId: id, conflict: false, supported: true, restartHint: "none" })),
      addToLive: vi.fn(async (id: string) => ({ mode: "coexist" as const, enabledIds: [id], conflict: false, supported: true, restartHint: "restart-agent" })),
      removeFromLive: vi.fn(async () => ({ mode: "coexist" as const, enabledIds: [], conflict: false, supported: true, restartHint: "restart-agent" })),
      restoreOriginal: vi.fn(async () => ({ mode: "switch" as const, activeId: null, conflict: false, supported: true, restartHint: "none" })),
      balance: vi.fn(async () => null),
      refreshBalance: vi.fn(async () => null),
      getBalanceRule: vi.fn(async () => null),
      setBalanceRule: vi.fn(async (_id, rule) => rule),
    } satisfies AgentLogApi["providers"],
    analytics: { get: vi.fn(() => Promise.resolve(usageReport)) },
    overview: { get: vi.fn(() => Promise.resolve(overview)) },
    projects: {
      list: vi.fn(() => Promise.resolve(projects)),
      get: vi.fn(async () => null),
      pickFolder: vi.fn(async () => ({ cancelled: true, path: null })),
      addFromFolder: vi.fn(async () => null),
      update: vi.fn(async () => null),
      confirm: vi.fn(async () => null),
      archive: vi.fn(async () => null),
      addPath: vi.fn(async (_input: Parameters<AgentLogApi["projects"]["addPath"]>[0]) => worktreePath),
      removePath: vi.fn(async () => null),
      rebind: vi.fn(async () => null),
      merge: vi.fn(async () => null),
    },
    sessions: {
      list: vi.fn(() => Promise.resolve(sessions)),
      usage: vi.fn(async () => null),
      assignProject: vi.fn(async (input: { sessionId: string; projectId: string | null }) => input),
      timeline: vi.fn(async () => []),
    },
    humanTimer: {
      get: vi.fn(async () => null),
      start: vi.fn(async () => null),
      pause: vi.fn(async () => null),
      resume: vi.fn(async () => null),
      stop: vi.fn(async () => null),
    },
    settings: { open: vi.fn(async () => undefined) },
    diagnostics: { get: vi.fn(() => Promise.resolve(diagnostics)) },
    localization: { getLanguage: vi.fn(async () => language) },
    managerWindow: { hide: vi.fn(async () => undefined) },
    events: {
      onChanged: vi.fn((listener: (scope: string) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
    },
  };
  api satisfies AgentLogApi;
  return {
    api,
    emit(scope: string) {
      for (const listener of listeners) listener(scope);
    },
    listenerCount: () => listeners.size,
    setLanguage(nextLanguage: string) {
      language = nextLanguage;
    },
  };
}

function recordedSession(id: string, title: string): SessionSummary {
  return {
    id, source: "agent", agentId: "codex", sourceSessionId: id, parentSourceSessionId: null,
    projectId: null, projectName: null, cwd: "/work", title, startedAt: 1_000,
    endedAt: 2_000, lastEventAt: 2_000, latestState: "completed", disposition: "completed",
    transcriptPath: null, createdAt: 1_000, updatedAt: 2_000, activeMs: 1_000,
  };
}

describe("App", () => {
  it("shows two statistics panels and the conversation records on the same page", async () => {
    const { api } = createApi({ sessions: [recordedSession("session-1", "Write docs")] });
    render(<App api={api} />);

    expect(await screen.findByRole("heading", { name: "Agent work time" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Token usage" })).toBeVisible();
    const history = screen.getByText("Complete sessions").closest("details");
    expect(history).not.toBeNull();
    expect(history).toHaveAttribute("open");
    expect(api.projects.list).not.toHaveBeenCalled();
    expect(screen.queryByText("Estimated cost")).not.toBeInTheDocument();
  });

  it("opens to usage with provider navigation and no project or diagnostics pages", async () => {
    const { api } = createApi({ language: "zh" });
    render(<App api={api} />);

    expect(await screen.findByRole("region", { name: "Agent 使用情况" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "记录" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "管理界面导航" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "供应商" })).toBeInTheDocument();
    expect(screen.queryByText("诊断")).not.toBeInTheDocument();
    expect(api.sessions.list).toHaveBeenCalledWith({ includeArchived: true, source: "agent", limit: 500 });
    expect(api.projects.list).not.toHaveBeenCalled();
    expect(api.overview.get).not.toHaveBeenCalled();
    expect(api.settings.open).not.toHaveBeenCalled();
    expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
  });

  it("updates the records language when the host language changes", async () => {
    const harness = createApi();
    render(<App api={harness.api} />);
    expect(await screen.findByRole("region", { name: "Agent activity" })).toBeVisible();

    harness.setLanguage("zh");
    await act(async () => harness.emit("language"));

    expect(await screen.findByRole("region", { name: "Agent 使用情况" })).toBeVisible();
    expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
  });

  it("does not let an older language response overwrite a live switch", async () => {
    const initialLanguage = deferred<string>();
    const liveLanguage = deferred<string>();
    const harness = createApi();
    harness.api.localization.getLanguage.mockReset()
      .mockReturnValueOnce(initialLanguage.promise)
      .mockReturnValueOnce(liveLanguage.promise);
    render(<App api={harness.api} />);
    await screen.findByRole("region", { name: "Agent activity" });

    act(() => harness.emit("language"));
    await act(async () => { liveLanguage.resolve("zh"); await liveLanguage.promise; });
    expect(await screen.findByRole("region", { name: "Agent 使用情况" })).toBeVisible();

    await act(async () => { initialLanguage.resolve("en"); await initialLanguage.promise; });
    expect(screen.getByRole("region", { name: "Agent 使用情况" })).toBeVisible();
  });

  it("shows recorded sessions in the history section", async () => {
    const user = userEvent.setup();
    const { api } = createApi({
      projects: [{
        id: "project-1", name: "Docs", description: null, lifecycle: "active", confirmation: "confirmed",
        createdSource: "manual", createdAt: 1, updatedAt: 2, paths: [],
      }],
      sessions: [{ ...recordedSession("session-1", "Write docs"), projectId: "project-1", projectName: "Docs" }],
    });
    render(<App api={api} />);

    await screen.findByRole("heading", { name: "Agent work time" });
    expect(screen.getByText("Write docs")).toBeVisible();
    await user.click(screen.getByText("Complete sessions"));
    expect(screen.getByText("Complete sessions").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByRole("combobox", { name: "Project" })).not.toBeInTheDocument();
  });

  it("keeps time, Token usage, and on-demand conversations on one page", async () => {
    const user = userEvent.setup();
    const { api } = createApi({
      projects: [{ id: "docs", name: "Docs", description: null, lifecycle: "active", confirmation: "confirmed", createdSource: "manual", createdAt: 1, updatedAt: 2, paths: [] }],
      sessions: [{ ...recordedSession("session-1", "Write docs"), projectId: "docs", projectName: "Docs" }],
      usageReport: { ...emptyUsageReport, totalMs: 3_600_000, sessionCount: 1, projects: [{ projectId: "docs", name: "Docs", activeMs: 3_600_000 }] },
    });
    render(<App api={api} />);

    expect(await screen.findByRole("heading", { name: "Agent work time" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Token usage" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "This week" }));
    expect(api.analytics.get).toHaveBeenCalledWith(expect.objectContaining({ period: "week" }));
    expect(screen.getByText("Write docs")).toBeVisible();
  });

  it("shows loading and storage failures without exposing diagnostic details", async () => {
    const pending = deferred<DiagnosticsHealth>();
    const { api } = createApi({ diagnostics: pending.promise });
    const first = render(<App api={api} />);
    expect(screen.getByText("Loading Mobi Agent Pet")).toBeVisible();
    await act(async () => {
      pending.resolve({ storage: "starting", databaseName: "agentlog.db", errorMessage: null,
        tray: { status: "starting", code: null } });
    });
    expect(await screen.findByText("Storage is starting")).toBeVisible();
    expect(api.sessions.list).not.toHaveBeenCalled();
    first.unmount();

    const { api: errorApi } = createApi({ diagnostics: {
      storage: "error", databaseName: "agentlog.db", errorMessage: "/private/storage/path",
      tray: { status: "failed", code: null },
    } });
    render(<App api={errorApi} />);
    expect(await screen.findByText("Mobi Agent Pet storage unavailable")).toBeVisible();
    expect(screen.queryByText(/private\/storage/)).not.toBeInTheDocument();
  });

  it("refreshes records for Agent changes and unsubscribes on unmount", async () => {
    const harness = createApi();
    const view = render(<App api={harness.api} />);
    await screen.findByRole("region", { name: "Agent activity" });
    const initialCalls = harness.api.sessions.list.mock.calls.length;

    await act(async () => harness.emit("projects"));
    expect(harness.api.sessions.list).toHaveBeenCalledTimes(initialCalls);
    await act(async () => harness.emit("agent-events"));
    await waitFor(() => expect(harness.api.sessions.list).toHaveBeenCalledTimes(initialCalls + 1));
    expect(harness.listenerCount()).toBe(1);
    view.unmount();
    expect(harness.listenerCount()).toBe(0);
  });

  it("recalculates on visible refresh without hiding the current report", async () => {
    const user = userEvent.setup();
    const harness = createApi({ usageReport: { ...emptyUsageReport, totalMs: 3_600_000 } });
    render(<App api={harness.api} />);
    expect(await screen.findByText("1h 0m")).toBeVisible();

    const pending = deferred<UsageReport>();
    harness.api.analytics.get.mockReturnValueOnce(pending.promise);
    await user.click(screen.getByRole("button", { name: "Refresh statistics" }));
    expect(harness.api.analytics.get).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }));
    expect(screen.getByText("1h 0m")).toBeVisible();
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();

    await act(async () => { pending.resolve({ ...emptyUsageReport, totalMs: 7_200_000 }); await pending.promise; });
    expect(await screen.findByText("2h 0m")).toBeVisible();
    harness.api.analytics.get.mockRejectedValueOnce(new Error("private path"));
    await user.click(screen.getByRole("button", { name: "Refresh statistics" }));
    expect(await screen.findByText("Refresh failed. Try again.")).toBeVisible();
    expect(screen.getByText("2h 0m")).toBeVisible();
    expect(screen.queryByText("private path")).not.toBeInTheDocument();
  });

  it("keeps the newest records when refresh responses arrive out of order", async () => {
    const older = deferred<SessionSummary[]>();
    const newer = deferred<SessionSummary[]>();
    const harness = createApi();
    render(<App api={harness.api} />);
    await screen.findByRole("region", { name: "Agent activity" });
    harness.api.sessions.list.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    act(() => harness.emit("sessions"));
    act(() => harness.emit("sessions"));
    await act(async () => { newer.resolve([recordedSession("new", "Newest record")]); await newer.promise; });
    expect(await screen.findByText("Newest record")).toBeVisible();
    await act(async () => { older.resolve([recordedSession("old", "Older record")]); await older.promise; });
    expect(screen.getByText("Newest record")).toBeVisible();
    expect(screen.queryByText("Older record")).not.toBeInTheDocument();
  });

  it("allows retry after a records load error", async () => {
    const user = userEvent.setup();
    const harness = createApi();
    harness.api.sessions.list.mockRejectedValueOnce(new Error("private database path"));
    render(<App api={harness.api} />);

    expect(await screen.findByText("Unable to load Records")).toBeVisible();
    expect(screen.queryByText(/private database path/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("region", { name: "Agent activity" })).toBeVisible();
  });
});
