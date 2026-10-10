export type RouteId = "overview" | "projects" | "sessions" | "settings";
import type { ProviderDraft, ProviderScope } from "./providers/types";

export type ProviderSummary = {
  id: string;
  appId: ProviderScope;
  name: string;
  presetId: string | null;
  activation: "available" | "unavailable";
  unavailableReason: string | null;
  apiHost?: string | null;
  modelNames?: string[];
  universalSourceId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ProviderEditorView = { appId: ProviderScope; exists: boolean; config: string | null };
export type ProviderStatus = { mode: "switch" | "coexist"; activeId?: string | null;
  enabledIds?: string[]; conflict?: boolean; supported: boolean; restartHint: string };
export type ProviderBalance = { providerId: string; kind: "money" | "quota" | null;
  amount?: number | null; currency?: string | null; remaining?: number | null; unit?: string | null;
  resetAt?: number | null; checkedAt?: number | null; stale: boolean;
  error?: "auth" | "network" | "format" | "unsupported" | null };
export type ProviderBalanceRule = { url: string; method: "GET" | "POST";
  valuePath: string; kind: "money" | "quota"; unit: string };
export type ProviderExportDocument = { format: "mobi-providers-public-v1"; providers: Array<{
  sourceId: string; appId: ProviderScope; name: string; presetId: string | null;
  providerKey?: string;
  settingsConfig: Record<string, unknown>;
}> };
export type StorageStatus = "starting" | "ready" | "error";
export type TrayStatus = "starting" | "native" | "electron-fallback" | "no-host" | "failed";
export type TrayDiagnostics = { status: TrayStatus; code: string | null };

export type DiagnosticsHealth = {
  storage: StorageStatus;
  databaseName: string;
  errorMessage: string | null;
  tray: TrayDiagnostics;
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

export type ProjectDetail = ProjectSummary & {
  today?: OverviewSnapshot["today"];
};

export type AgentSession = {
  id: string;
  source: "agent";
  agentId: string;
  sourceSessionId: string;
  parentSourceSessionId: string | null;
  projectId: string | null;
  projectName: string | null;
  projectAssignmentSource?: "automatic" | "manual";
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

export type HumanTimerCommandError = {
  code: string;
  state: HumanSession | null;
};

export type HumanTimerCommandResult = HumanSession | HumanTimerCommandError | null;

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

export type UsageReport = {
  period: "day" | "week";
  start: number;
  end: number;
  previousMs: number;
  totalMs: number;
  sessionCount: number;
  ongoingSessions?: number;
  buckets: Array<{ start: number; end: number; activeMs: number }>;
  tokenBuckets?: Array<{ start: number; end: number; inputTokens: number; outputTokens: number }>;
  projects: Array<{ projectId: string | null; name: string | null; activeMs: number }>;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedInputTokens: number | null;
    estimatedUsd: number | null;
    pricedSessions: number;
    pricedRecords?: number;
    measuredSessions: number;
    eligibleSessions?: number;
    missingLogSessions?: number;
    priceCatalogDate?: string;
  };
  sessionUsage?: Record<string, SessionUsage>;
};

export type SessionUsage = { inputTokens: number; outputTokens: number; cachedInputTokens: number; cacheWriteTokens: number; estimatedUsd: number | null; pricedRecords: number; measuredRecords: number; undatedRecords?: number; models?: string[] };

export type AgentLogApi = {
  providers: {
    list(appId: ProviderScope): Promise<ProviderSummary[]>;
    getEditDraft(id: string): Promise<ProviderDraft | null>;
    create(input: ProviderDraft): Promise<ProviderSummary>;
    update(input: ProviderDraft & { id: string }): Promise<ProviderSummary | null>;
    remove(id: string): Promise<boolean>;
    move(id: string, beforeId: string | null): Promise<ProviderSummary[]>;
    exportData(): Promise<ProviderExportDocument>;
    importData(document: ProviderExportDocument): Promise<{ added: number; skipped: number }>;
    getEditorView(appId: ProviderScope): Promise<ProviderEditorView>;
    fetchModels(input: { appId: ProviderScope; endpoint: string; apiKey?: string; allowLocal?: boolean }): Promise<string[]>;
    checkEndpoint(input: { appId: ProviderScope; endpoint: string; apiKey?: string; allowLocal?: boolean }): Promise<{ reachable: boolean; status: number }>;
    status(appId: ProviderScope): Promise<ProviderStatus>;
    activate(id: string): Promise<ProviderStatus>;
    addToLive(id: string): Promise<ProviderStatus>;
    removeFromLive(id: string): Promise<ProviderStatus>;
    restoreOriginal(appId: ProviderScope): Promise<ProviderStatus>;
    balance(id: string): Promise<ProviderBalance | null>;
    refreshBalance(id: string): Promise<ProviderBalance | null>;
    getBalanceRule(id: string): Promise<ProviderBalanceRule | null>;
    setBalanceRule(id: string, rule: ProviderBalanceRule | null): Promise<ProviderBalanceRule | null>;
  };
  analytics: {
    get(input?: { period?: "day" | "week"; anchor?: number; force?: boolean }): Promise<UsageReport>;
  };
  overview: {
    get(): Promise<OverviewSnapshot>;
  };
  projects: {
    list(filters?: Record<string, unknown>): Promise<ProjectSummary[]>;
    get(id: string): Promise<ProjectDetail | null>;
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
    usage(id: string): Promise<SessionUsage | null>;
    assignProject(input: { sessionId: string; projectId: string | null }): Promise<{ sessionId: string; projectId: string | null } | { code: string }>;
    timeline(input: { projectId: string } & Record<string, unknown>): Promise<ActivityEvent[]>;
  };
  humanTimer: {
    get(): Promise<HumanSession | null>;
    start(projectId: string): Promise<HumanTimerCommandResult>;
    pause(): Promise<HumanTimerCommandResult>;
    resume(): Promise<HumanTimerCommandResult>;
    stop(notes?: string): Promise<HumanTimerCommandResult>;
  };
  settings: {
    open(tab: "agents" | "theme" | "general"): Promise<unknown>;
  };
  diagnostics: {
    get(): Promise<DiagnosticsHealth>;
  };
  localization: {
    getLanguage(): Promise<string>;
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
