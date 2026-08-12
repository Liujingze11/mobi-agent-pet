import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SessionsPage } from "../pages/SessionsPage";
import type { AgentSession, HumanSession, ProjectSummary } from "../types";

const projects: ProjectSummary[] = [
  { id: "p1", name: "AgentLog Pet", description: null, lifecycle: "active", confirmation: "confirmed", createdSource: "manual", createdAt: 1, updatedAt: 2, paths: [] },
  { id: "p2", name: "Docs", description: null, lifecycle: "active", confirmation: "confirmed", createdSource: "manual", createdAt: 1, updatedAt: 2, paths: [] },
];

const agent: AgentSession = {
  id: "agent-1", source: "agent", agentId: "codex", sourceSessionId: "source-1", parentSourceSessionId: "parent-1",
  projectId: "p1", projectName: "AgentLog Pet", cwd: "/work/agentlog", title: "Implement manager", startedAt: 2_000,
  endedAt: 8_000, lastEventAt: 8_000, latestState: "completed", disposition: "completed", transcriptPath: null,
  createdAt: 2_000, updatedAt: 8_000, activeMs: 5_000,
};

const human: HumanSession = {
  id: "human-1", source: "human", projectId: "p2", projectName: "Docs", status: "completed", startedAt: 3_000,
  endedAt: 10_000, pausedAt: null, accumulatedPauseMs: 2_000, notes: "Write release notes", createdAt: 3_000,
  updatedAt: 10_000, effectiveMs: 5_000,
};

describe("SessionsPage", () => {
  it("filters agent and human sessions with segmented controls", async () => {
    const user = userEvent.setup();
    render(<SessionsPage projects={projects} sessions={[human, agent]} />);

    expect(screen.getByText("Implement manager")).toBeVisible();
    expect(screen.getByText("Write release notes")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Agent sessions" }));
    expect(screen.getByText("Implement manager")).toBeVisible();
    expect(screen.queryByText("Write release notes")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Human sessions" }));
    expect(screen.queryByText("Implement manager")).not.toBeInTheDocument();
    expect(screen.getByText("Write release notes")).toBeVisible();
  });

  it("filters by project and shows source-specific detail", async () => {
    const user = userEvent.setup();
    render(<SessionsPage projects={projects} sessions={[human, agent]} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Project" }), "p1");
    expect(screen.getByText("Implement manager")).toBeVisible();
    expect(screen.queryByText("Write release notes")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open session Implement manager" }));
    const detail = screen.getByRole("complementary", { name: "Session detail" });
    expect(within(detail).getByText("parent-1")).toBeVisible();
    expect(within(detail).getByText("/work/agentlog")).toBeVisible();
  });
});
