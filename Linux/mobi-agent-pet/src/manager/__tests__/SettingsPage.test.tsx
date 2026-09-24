import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n";
import { SettingsPage } from "../pages/SettingsPage";

describe("SettingsPage", () => {
  it("renders diagnostics in Simplified Chinese", () => {
    render(
      <I18nProvider locale="zh">
        <SettingsPage
          health={{
            storage: "ready",
            databaseName: "agentlog.db",
            errorMessage: null,
            tray: { status: "native", code: null },
          }}
          onOpenSettings={vi.fn(async () => undefined)}
        />
      </I18nProvider>
    );

    expect(screen.getByRole("heading", { name: "诊断" })).toBeVisible();
    expect(screen.getByText("存储")).toBeVisible();
    expect(screen.getByText("已就绪")).toBeVisible();
    expect(screen.getByText("原生托盘正在运行")).toBeVisible();
    expect(screen.getByRole("button", { name: "打开应用设置" })).toBeVisible();
  });

  it("localizes the redacted storage error", () => {
    render(
      <I18nProvider locale="zh">
        <SettingsPage
          health={{
            storage: "error",
            databaseName: "agentlog.db",
            errorMessage: "Unable to open Mobi Agent Pet storage",
            tray: { status: "starting", code: null },
          }}
          onOpenSettings={vi.fn(async () => undefined)}
        />
      </I18nProvider>
    );

    expect(screen.getByText("无法打开 莫比 Pet 存储")).toBeVisible();
    expect(screen.queryByText("Unable to open Mobi Agent Pet storage")).not.toBeInTheDocument();
  });
});
