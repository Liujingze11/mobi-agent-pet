import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../components/AppShell";

describe("AppShell", () => {
  it("renders the six approved destinations without Phase 3 placeholders", () => {
    render(
      <AppShell currentRoute="overview" onNavigate={() => {}}>
        <div>Operational view</div>
      </AppShell>,
    );

    for (const label of ["Overview", "Projects", "Sessions", "Agents", "Pet & Themes", "Settings"]) {
      expect(screen.getByRole("button", { name: label })).toBeVisible();
    }
    expect(screen.getByText("Operational view")).toBeVisible();
    expect(screen.queryByText(/Reports|Restore|Coming Soon/i)).not.toBeInTheDocument();
  });

  it("reports destination selection through the navigation contract", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <AppShell currentRoute="overview" onNavigate={onNavigate}>
        <div>Operational view</div>
      </AppShell>,
    );

    await user.click(screen.getByRole("button", { name: "Sessions" }));

    expect(onNavigate).toHaveBeenCalledWith("sessions");
  });

  it("keeps the longest project badge inside the Projects button name", () => {
    render(
      <AppShell currentRoute="overview" onNavigate={() => {}} pendingProjectCount={104}>
        <div>Operational view</div>
      </AppShell>,
    );

    const projects = screen.getByRole("button", { name: "Projects" });
    expect(projects).toBeVisible();
    expect(projects).toHaveTextContent("99+");
  });
});
