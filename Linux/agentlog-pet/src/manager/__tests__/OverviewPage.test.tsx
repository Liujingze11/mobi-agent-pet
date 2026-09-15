import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HumanTimerBar } from "../components/HumanTimerBar";
import { I18nProvider } from "../i18n";
import { OverviewPage } from "../pages/OverviewPage";
import type {
  AgentLogApi,
  HumanSession,
  HumanTimerCommandResult,
  OverviewSnapshot,
  ProjectSummary,
} from "../types";

const project: ProjectSummary = {
  id: "project-1",
  name: "AgentLog Pet",
  description: "Manager work",
  lifecycle: "active",
  confirmation: "confirmed",
  createdSource: "manual",
  createdAt: 1,
  updatedAt: 2,
  paths: [],
};

const runningTimer: HumanSession = {
  id: "human-1",
  source: "human",
  projectId: project.id,
  projectName: project.name,
  status: "running",
  startedAt: 1_000,
  endedAt: null,
  pausedAt: null,
  accumulatedPauseMs: 0,
  notes: "",
  createdAt: 1_000,
  updatedAt: 1_000,
  effectiveMs: 4_000,
};

const pausedTimer: HumanSession = {
  ...runningTimer,
  status: "paused",
  pausedAt: 5_000,
  updatedAt: 5_000,
  effectiveMs: 4_000,
};

const completedTimer: HumanSession = {
  ...runningTimer,
  status: "completed",
  endedAt: 6_000,
};

const snapshot: OverviewSnapshot = {
  pendingProjectCount: 2,
  activeAgentSessions: [{
    id: "agent-session-1",
    source: "agent",
    agentId: "codex",
    sourceSessionId: "source-1",
    parentSourceSessionId: null,
    projectId: project.id,
    projectName: project.name,
    cwd: "/work/agentlog-pet",
    title: null,
    startedAt: 1_000,
    endedAt: null,
    lastEventAt: 5_000,
    latestState: "working",
    disposition: "active",
    transcriptPath: null,
    createdAt: 1_000,
    updatedAt: 5_000,
    activeMs: 120_000,
  }],
  humanTimer: runningTimer,
  today: {
    agentSessionMs: 3_900_000,
    agentActiveMs: 3_000_000,
    humanMs: 1_800_000,
  },
  recentActivity: [{
    id: "event-1",
    schemaVersion: 1,
    agentId: "codex",
    sourceEventId: "source-event-1",
    sourceSequence: 1,
    sessionId: "session-1",
    rawSessionId: "session-1",
    parentSessionId: null,
    projectId: project.id,
    projectName: project.name,
    agentSessionRowId: "agent-session-1",
    occurredAt: 5_000,
    receivedAt: 5_100,
    cwd: "/work/agentlog-pet",
    type: "PreToolUse",
    category: "tool_activity",
    state: "working",
    toolName: "apply_patch",
    transcriptPath: null,
    permission: null,
    payload: {},
  }],
};

function timerApi(overrides: Partial<AgentLogApi["humanTimer"]> = {}): AgentLogApi["humanTimer"] {
  return {
    get: vi.fn(async () => null),
    start: vi.fn(async () => runningTimer),
    pause: vi.fn(async () => pausedTimer),
    resume: vi.fn(async () => runningTimer),
    stop: vi.fn(async () => completedTimer),
    ...overrides,
  };
}

function TimerHarness({ initial, api }: { initial: HumanSession | null; api: AgentLogApi["humanTimer"] }) {
  const [timer, setTimer] = useState<HumanSession | null>(initial);
  return (
    <HumanTimerBar
      now={() => 10_000}
      onOpenProjects={() => {}}
      onTimerChange={setTimer}
      projects={[project]}
      timer={timer}
      timerApi={api}
    />
  );
}

afterEach(() => vi.useRealTimers());

describe("OverviewPage", () => {
  it("renders overview and timer controls in Simplified Chinese", () => {
    render(
      <I18nProvider locale="zh">
        <OverviewPage
          now={() => 10_000}
          onOpenProjects={() => {}}
          projects={[project]}
          snapshot={snapshot}
          timerApi={timerApi()}
        />
      </I18nProvider>
    );

    expect(screen.getByRole("heading", { name: "当前工作" })).toBeVisible();
    expect(screen.getByText("Agent 会话时间")).toBeVisible();
    expect(screen.getByText("人工计时")).toBeVisible();
    expect(screen.getByRole("button", { name: "暂停计时" })).toBeVisible();
  });

  it("shows separate time totals, pending work, live agents, and recent activity", () => {
    render(
      <OverviewPage
        now={() => 10_000}
        onOpenProjects={() => {}}
        projects={[project]}
        snapshot={snapshot}
        timerApi={timerApi()}
      />
    );

    for (const label of ["Agent session time", "Agent active time", "Human time", "Pending projects", "Recent activity"]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.getByText("1h 5m")).toBeVisible();
    expect(screen.getAllByText("AgentLog Pet").length).toBeGreaterThan(0);
    expect(screen.getByText("apply_patch")).toBeVisible();
  });

  it("waits for pause and resume results before changing visible controls", async () => {
    const user = userEvent.setup();
    let releasePause!: (value: HumanTimerCommandResult) => void;
    const pauseResult = new Promise<HumanTimerCommandResult>((resolve) => { releasePause = resolve; });
    const api = timerApi({ pause: vi.fn(() => pauseResult) });
    render(<TimerHarness initial={runningTimer} api={api} />);

    await user.click(screen.getByRole("button", { name: "Pause timer" }));
    expect(screen.getByRole("button", { name: "Pause timer" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Resume timer" })).not.toBeInTheDocument();
    await act(async () => releasePause(pausedTimer));
    expect(await screen.findByRole("button", { name: "Resume timer" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Resume timer" }));
    expect(await screen.findByRole("button", { name: "Pause timer" })).toBeVisible();
  });

  it("starts the selected project and clears controls after stop", async () => {
    const user = userEvent.setup();
    const api = timerApi();
    render(<TimerHarness initial={null} api={api} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Timer project" }), project.id);
    await user.click(screen.getByRole("button", { name: "Start timer" }));
    expect(await screen.findByRole("button", { name: "Stop timer" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stop timer" }));
    expect(await screen.findByRole("button", { name: "Start timer" })).toBeVisible();
  });

  it("adopts the authoritative timer state and announces a command error", async () => {
    const user = userEvent.setup();
    const api = timerApi({ pause: vi.fn(async () => ({ code: "TIMER_NOT_RUNNING", state: null })) });
    render(
      <HumanTimerBar
        now={() => 10_000}
        onOpenProjects={() => {}}
        onTimerChange={() => {}}
        projects={[project]}
        timer={runningTimer}
        timerApi={api}
      />
    );

    await user.click(screen.getByRole("button", { name: "Pause timer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Timer state changed");
    expect(screen.getByRole("button", { name: "Start timer" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Pause timer" })).not.toBeInTheDocument();
  });

  it("ticks a running timer from persisted timestamps", () => {
    vi.useFakeTimers();
    let current = 10_000;
    render(
      <HumanTimerBar
        now={() => current}
        onOpenProjects={() => {}}
        onTimerChange={() => {}}
        projects={[project]}
        timer={runningTimer}
        timerApi={timerApi()}
      />
    );
    expect(screen.getByText("00:00:09")).toBeVisible();
    current = 11_000;
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText("00:00:10")).toBeVisible();
  });
});
