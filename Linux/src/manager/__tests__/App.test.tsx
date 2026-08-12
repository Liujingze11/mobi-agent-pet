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
} from "../types";

const emptyOverview: OverviewSnapshot = {
  pendingProjectCount: 0,
  activeAgentSessions: [],
  humanTimer: null,
  today: { agentSessionMs: 0, agentActiveMs: 0, humanMs: 0 },
  recentActivity: [],
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
  overview?: OverviewSnapshot | Promise<OverviewSnapshot>;
  projects?: ProjectSummary[] | Promise<ProjectSummary[]>;
  sessions?: SessionSummary[] | Promise<SessionSummary[]>;
} = {}) {
  const listeners = new Set<(scope: string) => void>();
  const diagnostics = options.diagnostics ?? {
    storage: "ready",
    databaseName: "agentlog.db",
    errorMessage: null,
  };
  const overview = options.overview ?? emptyOverview;
  const projects = options.projects ?? [];
  const sessions = options.sessions ?? [];
  const api = {
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
  };
}

describe("App", () => {
  it("renders project data that includes a worktree path", async () => {
    const user = userEvent.setup();
    const { api } = createApi({
      projects: [{
        id: "project-worktree",
        name: "Worktree Project",
        description: null,
        lifecycle: "active",
        confirmation: "confirmed",
        createdSource: "agent",
        createdAt: 1,
        updatedAt: 2,
        paths: [worktreePath],
      }],
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Live work" });

    await user.click(screen.getByRole("button", { name: "Projects" }));

    expect(await screen.findByText("Worktree Project")).toBeVisible();
    await expect(api.projects.addPath({
      projectId: "project-worktree",
      path: "/worktrees/agentlog-pet",
      kind: "alias",
    })).resolves.toEqual(worktreePath);
  });

  it("keeps manager routes internal and opens supported host settings destinations", async () => {
    const user = userEvent.setup();
    const { api } = createApi();
    render(<App api={api} />);
    expect(await screen.findByRole("heading", { name: "Live work" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Projects" }));
    expect(await screen.findByText("No projects recorded")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Sessions" }));
    expect(await screen.findByText("No sessions recorded")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Agents" }));
    await user.click(screen.getByRole("button", { name: "Pet & Themes" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("button", { name: "Open App Settings" }));

    expect(api.settings.open.mock.calls).toEqual([["agents"], ["theme"], ["general"]]);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  it("shows loading and storage-starting states without requesting route data", async () => {
    const health = deferred<DiagnosticsHealth>();
    const { api } = createApi({ diagnostics: health.promise });
    render(<App api={api} />);

    expect(screen.getByText("Loading AgentLog")).toBeVisible();
    await act(async () => {
      health.resolve({ storage: "starting", databaseName: "agentlog.db", errorMessage: null });
    });

    expect(await screen.findByText("Storage is starting")).toBeVisible();
    expect(api.overview.get).not.toHaveBeenCalled();
  });

  it("shows redacted storage and unexpected operation errors", async () => {
    const { api: storageApi } = createApi({
      diagnostics: {
        storage: "error",
        databaseName: "agentlog.db",
        errorMessage: "Unable to open AgentLog storage",
      },
    });
    const storageRender = render(<App api={storageApi} />);
    expect(await screen.findByText("AgentLog storage unavailable")).toBeVisible();
    expect(screen.getByText("Unable to open AgentLog storage")).toBeVisible();
    storageRender.unmount();

    const { api: rejectedApi } = createApi();
    rejectedApi.diagnostics.get.mockRejectedValueOnce(new Error("/home/dev/private.db"));
    render(<App api={rejectedApi} />);
    expect(await screen.findByText("Unable to load AgentLog")).toBeVisible();
    expect(screen.queryByText(/private\.db/)).not.toBeInTheDocument();
  });

  it("shows only redacted diagnostic fields and opens General settings", async () => {
    const user = userEvent.setup();
    const { api } = createApi({
      diagnostics: {
        storage: "ready",
        databaseName: "agentlog.db",
        errorMessage: null,
        databasePath: "/home/dev/.config/agentlog.db",
      },
    });
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Live work" });
    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByText("agentlog.db")).toBeVisible();
    expect(screen.getByText("Ready")).toBeVisible();
    expect(screen.queryByText(/\/home\/dev/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open App Settings" }));
    expect(api.settings.open).toHaveBeenCalledWith("general");
  });

  it("announces an Open App Settings failure", async () => {
    const user = userEvent.setup();
    const { api } = createApi();
    api.settings.open.mockRejectedValueOnce(new Error("settings unavailable"));
    render(<App api={api} />);
    await screen.findByRole("heading", { name: "Live work" });
    await user.click(screen.getByRole("button", { name: "Settings" }));

    await user.click(await screen.findByRole("button", { name: "Open App Settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to open app settings.");
  });

  it("refreshes relevant current data and unsubscribes on unmount", async () => {
    const user = userEvent.setup();
    const harness = createApi();
    const view = render(<App api={harness.api} />);
    await screen.findByRole("heading", { name: "Live work" });
    await user.click(screen.getByRole("button", { name: "Projects" }));
    await screen.findByText("No projects recorded");

    harness.api.projects.list.mockResolvedValueOnce([{
      id: "project-1",
      name: "Indexer",
      description: null,
      lifecycle: "active",
      confirmation: "confirmed",
      createdSource: "manual",
      createdAt: 1,
      updatedAt: 2,
      paths: [],
    }]);
    await act(async () => harness.emit("projects"));

    expect(await screen.findByText("Indexer")).toBeVisible();
    expect(harness.listenerCount()).toBe(1);
    expect(harness.api.events.onChanged).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(harness.listenerCount()).toBe(0);
  });

  it("ignores a deferred route response after unmount and leaves no listener", async () => {
    const user = userEvent.setup();
    const pendingProjects = deferred<ProjectSummary[]>();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const harness = createApi();
    harness.api.projects.list
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(pendingProjects.promise);
    try {
      const view = render(<App api={harness.api} />);
      await screen.findByRole("heading", { name: "Live work" });
      await user.click(screen.getByRole("button", { name: "Projects" }));
      expect(await screen.findByText("Loading Projects")).toBeVisible();
      expect(harness.listenerCount()).toBe(1);

      view.unmount();
      expect(harness.listenerCount()).toBe(0);
      await act(async () => {
        pendingProjects.resolve([]);
        await pendingProjects.promise;
      });
      harness.emit("projects");

      expect(harness.api.projects.list).toHaveBeenCalledTimes(2);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps the newest same-route refresh when requests resolve out of order", async () => {
    const user = userEvent.setup();
    const olderRefresh = deferred<ProjectSummary[]>();
    const newerRefresh = deferred<ProjectSummary[]>();
    const harness = createApi({
      projects: [{
        id: "project-initial",
        name: "Initial Project",
        description: null,
        lifecycle: "active",
        confirmation: "confirmed",
        createdSource: "manual",
        createdAt: 1,
        updatedAt: 2,
        paths: [],
      }],
    });
    render(<App api={harness.api} />);
    await screen.findByRole("heading", { name: "Live work" });
    await user.click(screen.getByRole("button", { name: "Projects" }));
    expect(await screen.findByText("Initial Project")).toBeVisible();
    harness.api.projects.list
      .mockReturnValueOnce(olderRefresh.promise)
      .mockReturnValueOnce(newerRefresh.promise);

    act(() => harness.emit("projects"));
    act(() => harness.emit("projects"));
    await act(async () => {
      newerRefresh.resolve([{
        id: "project-newest",
        name: "Newest Project",
        description: null,
        lifecycle: "active",
        confirmation: "confirmed",
        createdSource: "manual",
        createdAt: 3,
        updatedAt: 4,
        paths: [],
      }]);
      await newerRefresh.promise;
    });
    expect(await screen.findByText("Newest Project")).toBeVisible();

    await act(async () => {
      olderRefresh.resolve([{
        id: "project-older",
        name: "Older Project",
        description: null,
        lifecycle: "active",
        confirmation: "confirmed",
        createdSource: "manual",
        createdAt: 1,
        updatedAt: 2,
        paths: [],
      }]);
      await olderRefresh.promise;
    });

    expect(screen.getByText("Newest Project")).toBeVisible();
    expect(screen.queryByText("Older Project")).not.toBeInTheDocument();
  });

  it("ignores stale route responses after navigation", async () => {
    const user = userEvent.setup();
    const lateOverview = deferred<OverviewSnapshot>();
    const harness = createApi({
      overview: lateOverview.promise,
      projects: [{
        id: "project-2",
        name: "Current Project",
        description: null,
        lifecycle: "active",
        confirmation: "confirmed",
        createdSource: "manual",
        createdAt: 1,
        updatedAt: 2,
        paths: [],
      }],
    });
    render(<App api={harness.api} />);
    await screen.findByText("Loading Overview");
    await user.click(screen.getByRole("button", { name: "Projects" }));
    expect(await screen.findByText("Current Project")).toBeVisible();

    await act(async () => {
      lateOverview.resolve({
        ...emptyOverview,
        pendingProjectCount: 9,
      });
    });

    expect(screen.getByText("Current Project")).toBeVisible();
  });

  it("contains route load failures and allows a retry", async () => {
    const user = userEvent.setup();
    const harness = createApi();
    render(<App api={harness.api} />);
    await screen.findByRole("heading", { name: "Live work" });
    harness.api.projects.list
      .mockRejectedValueOnce(new Error("database exploded"))
      .mockResolvedValueOnce([]);

    await user.click(screen.getByRole("button", { name: "Projects" }));
    expect(await screen.findByText("Unable to load Projects")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("No projects recorded")).toBeVisible());
  });
});
