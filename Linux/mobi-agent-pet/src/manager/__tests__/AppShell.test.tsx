import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../components/AppShell";
import { I18nProvider } from "../i18n";

describe("AppShell", () => {
  it("shows a single records workspace without the old sidebar", () => {
    render(
      <I18nProvider locale="zh">
        <AppShell><div>记录内容</div></AppShell>
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "记录" })).toBeVisible();
    expect(screen.getByText("莫比 Pet")).toBeVisible();
    expect(screen.getByText("记录内容")).toBeVisible();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "设置" })).not.toBeInTheDocument();
  });

  it("keeps refresh and hide commands", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onHide = vi.fn();
    render(<AppShell onRefresh={onRefresh} onHide={onHide}><div>Records</div></AppShell>);

    await user.click(screen.getByRole("button", { name: "Refresh current view" }));
    await user.click(screen.getByRole("button", { name: "Hide Manager" }));

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onHide).toHaveBeenCalledOnce();
  });
});
