import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SessionsPage } from "../pages/SessionsPage";
import { I18nProvider } from "../i18n";
import type { AgentSession, HumanSession } from "../types";

const agent: AgentSession = {
  id: "agent-1", source: "agent", agentId: "codex", sourceSessionId: "source-1", parentSourceSessionId: null,
  projectId: "p1", projectName: "Old project", cwd: "/work/agentlog", title: "Implement manager", startedAt: 2_000,
  endedAt: 8_000, lastEventAt: 8_000, latestState: "completed", disposition: "completed", transcriptPath: null,
  createdAt: 2_000, updatedAt: 8_000, activeMs: 5_000,
};

const human: HumanSession = {
  id: "human-1", source: "human", projectId: "p1", projectName: "Old project", status: "completed", startedAt: 3_000,
  endedAt: 10_000, pausedAt: null, accumulatedPauseMs: 2_000, notes: "Manual timer", createdAt: 3_000,
  updatedAt: 10_000, effectiveMs: 5_000,
};

describe("SessionsPage", () => {
  it("shows numeric start and end, Agent, duration, and exact Tokens in each row", () => {
    const session = { ...agent, startedAt: new Date(2026, 8, 28, 9, 30).getTime(), endedAt: new Date(2026, 8, 28, 10, 45).getTime(), activeMs: 3_600_000 };
    render(<I18nProvider locale="zh"><SessionsPage sessions={[session]} sessionUsage={{
      [session.id]: { inputTokens: 1_200, outputTokens: 300, cachedInputTokens: 400, cacheWriteTokens: 0, estimatedUsd: null, pricedRecords: 0, measuredRecords: 1 },
    }} /></I18nProvider>);

    expect(screen.getByRole("columnheader", { name: "开始时间" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "结束时间" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Agent" })).toBeVisible();
    expect(screen.getByText("2026/09/28 09:30")).toBeVisible();
    expect(screen.getByText("2026/09/28 10:45")).toBeVisible();
    expect(screen.getByRole("cell", { name: "Codex" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "1,500" })).toBeVisible();
  });
  it("shows only Agent conversations and removes project and cost organization", async () => {
    const user = userEvent.setup();
    render(<I18nProvider locale="zh"><SessionsPage sessions={[human, agent]} /></I18nProvider>);

    expect(screen.getByText("Implement manager")).toBeVisible();
    expect(screen.queryByText("Manual timer")).not.toBeInTheDocument();
    expect(screen.queryByText("Old project")).not.toBeInTheDocument();
    expect(screen.queryByText("预估费用")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "打开会话 Implement manager" }));
    const detail = screen.getByRole("complementary", { name: "会话详情" });
    expect(within(detail).getByText("5秒")).toBeVisible();
    expect(within(detail).queryByText("工作目录")).not.toBeInTheDocument();
  });

  it("reveals older conversations and reads complete Token usage on selection", async () => {
    const user = userEvent.setup();
    const older = { ...agent, id: "older", title: "Older work", startedAt: 10_000, endedAt: 12_000, lastEventAt: 12_000 };
    const loadUsage = vi.fn(async () => ({
      inputTokens: 1_200, outputTokens: 300, cachedInputTokens: 400,
      cacheWriteTokens: 0, estimatedUsd: null, pricedRecords: 0,
      measuredRecords: 1, models: ["gpt-6-sol"],
    }));
    render(<SessionsPage sessions={[agent, older]} periodStart={0} periodEnd={9_000} onLoadUsage={loadUsage} />);

    expect(screen.getByText("Implement manager")).toBeVisible();
    expect(screen.queryByText("Older work")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All history" }));
    expect(screen.getByText("Older work")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Open session Older work" }));
    expect(await screen.findByText("gpt-6-sol")).toBeVisible();
    expect(loadUsage).toHaveBeenCalledWith("older");
    expect(screen.queryByText("Estimated cost")).not.toBeInTheDocument();
  });
});
