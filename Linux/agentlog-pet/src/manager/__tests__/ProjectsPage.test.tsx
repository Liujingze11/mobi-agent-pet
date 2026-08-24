import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectsPage } from "../pages/ProjectsPage";
import type { AgentLogApi, ProjectSummary } from "../types";

const pending: ProjectSummary = {
  id: "pending-1",
  name: "Detected workspace",
  description: null,
  lifecycle: "active",
  confirmation: "pending",
  createdSource: "agent",
  createdAt: 1,
  updatedAt: 10,
  paths: [{
    id: "path-pending",
    projectId: "pending-1",
    path: "/work/detected",
    canonicalPath: "/work/detected",
    kind: "primary",
    isAvailable: true,
    gitRoot: "/work/detected",
    gitRemoteIdentity: "github.com/example/detected",
    gitBranch: "main",
    createdAt: 1,
    updatedAt: 10,
  }],
};

const confirmed: ProjectSummary = {
  ...pending,
  id: "confirmed-1",
  name: "AgentLog Pet",
  confirmation: "confirmed",
  createdSource: "manual",
  updatedAt: 20,
  paths: [{ ...pending.paths[0], id: "path-confirmed", projectId: "confirmed-1", path: "/work/agentlog", canonicalPath: "/work/agentlog" }],
};

function projectApi(overrides: Partial<AgentLogApi["projects"]> = {}): AgentLogApi["projects"] {
  return {
    list: vi.fn(async () => [pending, confirmed]),
    get: vi.fn(async (id) => ({ ...(id === pending.id ? pending : confirmed), today: { agentSessionMs: 600_000, agentActiveMs: 480_000, humanMs: 300_000 } })),
    pickFolder: vi.fn(async () => ({ cancelled: true, path: null })),
    addFromFolder: vi.fn(async () => null),
    update: vi.fn(async () => null),
    confirm: vi.fn(async () => null),
    archive: vi.fn(async () => null),
    addPath: vi.fn(async () => pending.paths[0]),
    removePath: vi.fn(async () => null),
    rebind: vi.fn(async () => null),
    merge: vi.fn(async () => null),
    ...overrides,
  };
}

function sessionApi(): AgentLogApi["sessions"] {
  return { list: vi.fn(async () => []), timeline: vi.fn(async () => []) };
}

describe("ProjectsPage", () => {
  it("sorts pending work first and cancels folder add without opening a form", async () => {
    const user = userEvent.setup();
    const api = projectApi();
    render(<ProjectsPage projectApi={api} projects={[confirmed, pending]} sessionApi={sessionApi()} />);

    const items = screen.getAllByRole("button", { name: /Open project/ });
    expect(items[0]).toHaveAccessibleName("Open project Detected workspace");
    await user.click(screen.getByRole("button", { name: "Add project" }));
    expect(api.pickFolder).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Add project" })).not.toBeInTheDocument();
  });

  it("confirms pending work with edited details and renders the confirmed result", async () => {
    const user = userEvent.setup();
    const confirmedResult = { ...pending, name: "Detected API", description: "Imported work", confirmation: "confirmed" as const };
    const api = projectApi({ confirm: vi.fn(async () => confirmedResult) });
    render(<ProjectsPage projectApi={api} projects={[pending, confirmed]} sessionApi={sessionApi()} />);

    expect(await screen.findByText("10m")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm project" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm project" });
    const name = within(dialog).getByRole("textbox", { name: "Project name" });
    await user.clear(name);
    await user.type(name, "Detected API");
    await user.type(within(dialog).getByRole("textbox", { name: "Description" }), "Imported work");
    await user.click(within(dialog).getByRole("button", { name: "Confirm project" }));

    expect(await screen.findByRole("heading", { name: "Detected API" })).toBeVisible();
    expect(api.confirm).toHaveBeenCalledWith({ id: pending.id, name: "Detected API", description: "Imported work" });
    expect(screen.queryByText("Pending confirmation")).not.toBeInTheDocument();
    expect(screen.getByText("10m")).toBeVisible();
  });

  it("lists the exact project records before merge", async () => {
    const user = userEvent.setup();
    render(<ProjectsPage projectApi={projectApi()} projects={[pending, confirmed]} sessionApi={sessionApi()} />);

    await user.click(screen.getByRole("tab", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Merge project" }));
    const dialog = screen.getByRole("dialog", { name: "Merge Detected workspace" });
    expect(within(dialog).getByText("1 path")).toBeVisible();
    expect(within(dialog).getByText("0 sessions")).toBeVisible();
    expect(within(dialog).getByText("0 events")).toBeVisible();
  });

  it("reloads the selected project detail after an external project refresh", async () => {
    const firstDetail = { ...pending, today: { agentSessionMs: 600_000, agentActiveMs: 480_000, humanMs: 300_000 } };
    const refreshed = { ...pending, description: "Updated by agent", updatedAt: 50 };
    const secondDetail = { ...refreshed, today: { agentSessionMs: 1_200_000, agentActiveMs: 900_000, humanMs: 600_000 } };
    const api = projectApi({ get: vi.fn().mockResolvedValueOnce(firstDetail).mockResolvedValueOnce(secondDetail) });
    const sessions = sessionApi();
    const view = render(<ProjectsPage projectApi={api} projects={[pending, confirmed]} sessionApi={sessions} />);
    expect(await screen.findByText("10m")).toBeVisible();

    view.rerender(<ProjectsPage projectApi={api} projects={[refreshed, confirmed]} sessionApi={sessions} />);

    expect(await screen.findByText("20m")).toBeVisible();
    expect(screen.getByText("Updated by agent")).toBeVisible();
  });

  it("selects a project and requires archive confirmation", async () => {
    const user = userEvent.setup();
    const api = projectApi({ archive: vi.fn(async () => ({ ...confirmed, lifecycle: "archived" as const })) });
    render(<ProjectsPage projectApi={api} projects={[pending, confirmed]} sessionApi={sessionApi()} />);

    await user.click(screen.getByRole("button", { name: "Open project AgentLog Pet" }));
    expect(await screen.findByRole("heading", { name: "AgentLog Pet" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Archive project" }));
    const dialog = screen.getByRole("dialog", { name: "Archive AgentLog Pet" });
    expect(within(dialog).getByText(/history remains available/i)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Archive project" }));

    expect(api.archive).toHaveBeenCalledWith(confirmed.id);
    expect(screen.queryByRole("button", { name: "Open project AgentLog Pet" })).not.toBeInTheDocument();
  });
});
