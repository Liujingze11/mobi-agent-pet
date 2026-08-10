export type RouteId = "overview" | "projects" | "sessions" | "agents" | "pet" | "settings";

export type InternalRouteId = Exclude<RouteId, "agents" | "pet">;
export type StorageStatus = "starting" | "ready" | "error";

export type DiagnosticsHealth = {
  storage: StorageStatus;
  databaseName: string;
  errorMessage: string | null;
};

export type ProjectPath = {
  id: string;
  projectId: string;
  path: string;
  canonicalPath: string;
  kind: "primary" | "alias" | "worktree";
  isAvailable: boolean;
  gitRoot: string | null;
  gitRemoteIdentity: string | null;
  gitBranch: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  lifecycle: "active" | "archived";
  confirmation: "pending" | "confirmed";
  createdSource: "manual" | "agent";
  createdAt: number;
  updatedAt: number;
  paths: ProjectPath[];
};

export type AgentSession = {
  id: string;
  source: "agent";
  agentId: string;
  sourceSessionId: string;
  parentSourceSessionId: string | null;
  projectId: string | null;
  projectName: string | null;
  cwd: string | null;
  title: string | null;
  startedAt: number;
  endedAt: number | null;
  lastEventAt: number;
  latestState: string | null;
  disposition: "active" | "completed" | "errored" | "interrupted";
  transcriptPath: string | null;
  createdAt: number;
  updatedAt: number;
  activeMs: number;
};

export type HumanSession = {
  id: string;
  source: "human";
  projectId: string;
  projectName: string | null;
  status: "running" | "paused" | "completed";
  startedAt: number;
  endedAt: number | null;
  pausedAt: number | null;
  accumulatedPauseMs: number;
  notes: string;
  createdAt: number;
  updatedAt: number;
  effectiveMs: number;
};

export type SessionSummary = AgentSession | HumanSession;

export type ActivityEvent = {
  id: string;
  schemaVersion: number;
  agentId: string;
  sourceEventId: string | null;
  sourceSequence: number | null;
  sessionId: string;
  rawSessionId: string;
  parentSessionId: string | null;
  projectId: string | null;
  projectName: string | null;
  agentSessionRowId: string | null;
  occurredAt: number;
  receivedAt: number;
  cwd: string | null;
  type: string;
  category: string | null;
  state: string | null;
  toolName: string | null;
  transcriptPath: string | null;
  permission: unknown;
  payload: Record<string, unknown>;
};

export type OverviewSnapshot = {
  pendingProjectCount: number;
  activeAgentSessions: AgentSession[];
  humanTimer: HumanSession | null;
  today: {
    agentSessionMs: number;
    agentActiveMs: number;
    humanMs: number;
  };
  recentActivity: ActivityEvent[];
};

export type AgentLogApi = {
  overview: {
    get(): Promise<OverviewSnapshot>;
  };
  projects: {
    list(filters?: Record<string, unknown>): Promise<ProjectSummary[]>;
    get(id: string): Promise<(ProjectSummary & { today?: OverviewSnapshot["today"] }) | null>;
    pickFolder(): Promise<{ cancelled: boolean; path: string | null }>;
    addFromFolder(input: { path: string; name: string; description?: string }): Promise<ProjectSummary | null>;
    update(input: { id: string; name?: string; description?: string }): Promise<ProjectSummary | null>;
    confirm(input: { id: string; name?: string; description?: string }): Promise<ProjectSummary | null>;
    archive(id: string): Promise<ProjectSummary | null>;
    addPath(input: { projectId: string; path: string; kind?: "alias" }): Promise<ProjectPath>;
    removePath(input: { projectId: string; pathId: string }): Promise<ProjectSummary | null>;
    rebind(input: { projectId: string; pathId: string }): Promise<ProjectSummary | null>;
    merge(input: { sourceProjectId: string; targetProjectId: string }): Promise<ProjectSummary | null>;
  };
  sessions: {
    list(filters?: Record<string, unknown>): Promise<SessionSummary[]>;
    timeline(input: { projectId: string } & Record<string, unknown>): Promise<ActivityEvent[]>;
  };
  humanTimer: {
    get(): Promise<HumanSession | null>;
    start(projectId: string): Promise<HumanSession | null>;
    pause(): Promise<HumanSession | null>;
    resume(): Promise<HumanSession | null>;
    stop(notes?: string): Promise<HumanSession | null>;
  };
  settings: {
    open(tab: "agents" | "theme" | "general"): Promise<unknown>;
  };
  diagnostics: {
    get(): Promise<DiagnosticsHealth>;
  };
  managerWindow: {
    hide(): Promise<unknown>;
  };
  events: {
    onChanged(callback: (scope: string) => void): () => void;
  };
};

declare global {
  interface Window {
    agentLog: AgentLogApi;
  }
}
