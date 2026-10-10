import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n";
import { UsageOverview } from "../components/UsageOverview";
import type { UsageReport } from "../types";

const report: UsageReport = {
  period: "day", start: new Date(2026, 8, 24).getTime(), end: new Date(2026, 8, 24, 13).getTime(),
  previousMs: 1_800_000, totalMs: 3_600_000, sessionCount: 2, ongoingSessions: 1,
  buckets: [{ start: new Date(2026, 8, 24, 9).getTime(), end: new Date(2026, 8, 24, 10).getTime(), activeMs: 3_600_000 }],
  projects: [{ projectId: "docs", name: "Docs", activeMs: 3_600_000 }],
  tokenBuckets: [{ start: new Date(2026, 8, 24, 9).getTime(), end: new Date(2026, 8, 24, 10).getTime(), inputTokens: 1_200, outputTokens: 300 }],
  usage: { inputTokens: 1_200, outputTokens: 300, cachedInputTokens: 400, estimatedUsd: 0.12, pricedSessions: 1, measuredSessions: 1, eligibleSessions: 1, missingLogSessions: 0 },
};

describe("UsageOverview", () => {
  it("shows seconds for short active periods instead of a zero-minute total", async () => {
    const shortReport = { ...report, totalMs: 43_000, buckets: [{ ...report.buckets[0], activeMs: 43_000 }] };
    render(<I18nProvider locale="zh"><UsageOverview report={shortReport} period="day" anchor={Date.now()} onPeriodChange={vi.fn()} onAnchorChange={vi.fn()} /></I18nProvider>);

    expect(screen.getByText("43秒")).toBeVisible();
    const bar = within(screen.getByLabelText("Agent 工作时间图表")).getByRole("button");
    expect(bar).toHaveAccessibleName(/43秒/);
    await userEvent.setup().hover(bar);
    expect(screen.getByRole("tooltip")).toHaveTextContent("43秒");
  });

  it("shows the Screen Time style summary and filters records in the same page", async () => {
    const user = userEvent.setup();
    const onPeriodChange = vi.fn();
    render(<I18nProvider locale="en"><UsageOverview report={report} period="day" anchor={Date.now()} onPeriodChange={onPeriodChange} onAnchorChange={vi.fn()} /></I18nProvider>);

    expect(screen.getByRole("heading", { name: "Agent work time" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Token usage" })).toBeVisible();
    expect(screen.queryByText(/State events|ending event|grouped by log time/)).not.toBeInTheDocument();
    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
    expect(screen.queryByText("Estimated cost")).not.toBeInTheDocument();
    expect(screen.getAllByText("1h 0m").length).toBeGreaterThan(0);
    expect(screen.queryByText("Complete sessions")).not.toBeInTheDocument();
    const bar = within(screen.getByLabelText("Agent work time chart")).getByRole("button");
    await user.hover(bar);
    expect(screen.getByRole("tooltip")).toHaveTextContent("1h 0m");
    await user.unhover(bar);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => bar.focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent("1h 0m");
    const tokenBar = within(screen.getByLabelText("Token usage chart")).getByRole("button");
    await user.hover(tokenBar);
    expect(screen.getByRole("tooltip")).toHaveTextContent("1,500");
    await user.click(screen.getByRole("button", { name: "This week" }));
    expect(onPeriodChange).toHaveBeenCalledWith("week");
  });

  it("uses a short notice when token data is incomplete", () => {
    const incomplete = { ...report, usage: { ...report.usage!, missingLogSessions: 1 } };
    render(<I18nProvider locale="zh"><UsageOverview report={incomplete} period="day" anchor={Date.now()} onPeriodChange={vi.fn()} onAnchorChange={vi.fn()} /></I18nProvider>);

    expect(screen.getByText("部分数据不可用")).toBeVisible();
    expect(screen.queryByText(/状态事件|等待结束事件|按日志时间归日|缺少日志/)).not.toBeInTheDocument();
  });
});
