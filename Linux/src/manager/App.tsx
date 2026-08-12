import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { AppShell } from "./components/AppShell";
import { OverviewPage } from "./pages/OverviewPage";
import { SettingsPage } from "./pages/SettingsPage";
import type {
  AgentLogApi,
  DiagnosticsHealth,
  InternalRouteId,
  OverviewSnapshot,
  ProjectSummary,
  RouteId,
  SessionSummary,
} from "./types";

type OverviewRouteData = { snapshot: OverviewSnapshot; projects: ProjectSummary[] };
type RouteData = OverviewRouteData | ProjectSummary[] | SessionSummary[] | DiagnosticsHealth;
type ViewState =
  | { status: "loading"; route: InternalRouteId }
  | { status: "ready"; route: InternalRouteId; data: RouteData }
  | { status: "error"; route: InternalRouteId };

type AppProps = {
  api?: AgentLogApi;
};

const routeLabels: Record<InternalRouteId, string> = {
  overview: "Overview",
  projects: "Projects",
  sessions: "Sessions",
  settings: "Settings",
};

function isRelevantScope(route: InternalRouteId, scope: string) {
  if (route === "overview") return true;
  if (route === "projects") return scope === "projects";
  if (route === "sessions") return scope === "sessions" || scope === "projects";
  return false;
}

function StateSurface({
  detail,
  kind,
  onRetry,
  title,
}: {
  detail: string;
  kind: "loading" | "pending" | "error";
  onRetry?: () => void;
  title: string;
}) {
  return (
    <section className={`state-surface state-surface--${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span className="state-surface__indicator" aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {onRetry ? <button type="button" className="command-button" onClick={onRetry}>Retry</button> : null}
    </section>
  );
}

function ProjectsSkeleton({ projects }: { projects: ProjectSummary[] }) {
  if (projects.length === 0) {
    return <StateSurface kind="pending" title="No projects recorded" detail="The project register is empty." />;
  }
  return (
    <section className="workspace" aria-labelledby="projects-title">
      <div className="workspace__heading"><h2 id="projects-title">Project register</h2><span>{projects.length} total</span></div>
      <ul className="record-list">
        {projects.slice(0, 8).map((project) => (
          <li key={project.id}>
            <div><strong>{project.name}</strong><span>{project.confirmation}</span></div>
            <span className={`record-state record-state--${project.confirmation}`}>{project.lifecycle}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SessionsSkeleton({ sessions }: { sessions: SessionSummary[] }) {
  if (sessions.length === 0) {
    return <StateSurface kind="pending" title="No sessions recorded" detail="The session register is empty." />;
  }
  return (
    <section className="workspace" aria-labelledby="sessions-title">
      <div className="workspace__heading"><h2 id="sessions-title">Session register</h2><span>{sessions.length} total</span></div>
      <ul className="record-list">
        {sessions.slice(0, 8).map((session) => (
          <li key={session.id}>
            <div><strong>{session.projectName || "Unassigned project"}</strong><span>{session.source}</span></div>
            <span className="record-state">{session.source === "agent" ? session.disposition : session.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

class UnexpectedErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The renderer deliberately avoids exposing exception details in the UI.
  }

  render() {
    if (this.state.failed) {
      return <StateSurface kind="error" title="Manager encountered an unexpected error" detail="Close and reopen Manager to continue." />;
    }
    return this.props.children;
  }
}

export function App({ api = window.agentLog }: AppProps) {
  const [route, setRoute] = useState<InternalRouteId>("overview");
  const [health, setHealth] = useState<DiagnosticsHealth | null | "unexpected">(null);
  const [view, setView] = useState<ViewState>({ status: "loading", route: "overview" });
  const [commandError, setCommandError] = useState(false);
  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const routeRef = useRef<InternalRouteId>(route);
  const healthRef = useRef<DiagnosticsHealth | null | "unexpected">(health);
  routeRef.current = route;
  healthRef.current = health;

  const loadRoute = useCallback(async (target: InternalRouteId) => {
    if (!mountedRef.current) return;
    const request = ++requestRef.current;
    setView({ status: "loading", route: target });
    if (target === "settings") {
      const currentHealth = healthRef.current;
      if (mountedRef.current && currentHealth && currentHealth !== "unexpected") {
        setView({ status: "ready", route: target, data: currentHealth });
      }
      return;
    }
    try {
      const data = target === "overview"
        ? await Promise.all([api.overview.get(), api.projects.list({ lifecycle: "active" })])
          .then(([snapshot, projects]) => ({ snapshot, projects }))
        : target === "projects"
          ? await api.projects.list()
          : await api.sessions.list();
      if (!mountedRef.current || request !== requestRef.current || routeRef.current !== target) return;
      setView({ status: "ready", route: target, data });
    } catch {
      if (!mountedRef.current || request !== requestRef.current || routeRef.current !== target) return;
      setView({ status: "error", route: target });
    }
  }, [api]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const unsubscribe = api.events.onChanged((scope) => {
      const currentRoute = routeRef.current;
      if (isRelevantScope(currentRoute, scope)) void loadRoute(currentRoute);
    });
    void api.diagnostics.get().then((result) => {
      if (active) setHealth(result);
    }).catch(() => {
      if (active) setHealth("unexpected");
    });
    return () => {
      active = false;
      mountedRef.current = false;
      requestRef.current += 1;
      unsubscribe();
    };
  }, [api, loadRoute]);

  useEffect(() => {
    if (health && health !== "unexpected" && health.storage === "ready") void loadRoute(route);
  }, [health, loadRoute, route]);

  async function openHostSettings(tab: "agents" | "theme") {
    setCommandError(false);
    try {
      await api.settings.open(tab);
    } catch {
      if (mountedRef.current) setCommandError(true);
    }
  }

  function navigate(destination: RouteId) {
    if (destination === "agents") {
      void openHostSettings("agents");
      return;
    }
    if (destination === "pet") {
      void openHostSettings("theme");
      return;
    }
    setRoute(destination);
  }

  let content: ReactNode;
  if (health === null) {
    content = <StateSurface kind="loading" title="Loading AgentLog" detail="Checking local storage health." />;
  } else if (health === "unexpected") {
    content = <StateSurface kind="error" title="Unable to load AgentLog" detail="Diagnostics did not respond." onRetry={() => window.location.reload()} />;
  } else if (health.storage === "starting") {
    content = <StateSurface kind="pending" title="Storage is starting" detail="Local storage is not ready yet." />;
  } else if (health.storage === "error") {
    content = <StateSurface kind="error" title="AgentLog storage unavailable" detail={health.errorMessage || "Unable to open AgentLog storage"} />;
  } else if (view.status === "loading" || view.route !== route) {
    content = <StateSurface kind="loading" title={`Loading ${routeLabels[route]}`} detail="Reading current local data." />;
  } else if (view.status === "error") {
    content = <StateSurface kind="error" title={`Unable to load ${routeLabels[route]}`} detail="The current view could not read local data." onRetry={() => void loadRoute(route)} />;
  } else if (route === "overview") {
    const overviewData = view.data as OverviewRouteData;
    content = (
      <OverviewPage
        onOpenProjects={() => setRoute("projects")}
        projects={overviewData.projects}
        snapshot={overviewData.snapshot}
        timerApi={api.humanTimer}
      />
    );
  } else if (route === "projects") {
    content = <ProjectsSkeleton projects={view.data as ProjectSummary[]} />;
  } else if (route === "sessions") {
    content = <SessionsSkeleton sessions={view.data as SessionSummary[]} />;
  } else {
    content = <SettingsPage health={health} onOpenSettings={() => api.settings.open("general")} />;
  }

  const overview = view.status === "ready" && view.route === "overview"
    ? (view.data as OverviewRouteData).snapshot
    : null;

  return (
    <UnexpectedErrorBoundary>
      <AppShell
        currentRoute={route}
        isRefreshing={view.status === "loading"}
        onHide={() => void api.managerWindow.hide()}
        onNavigate={navigate}
        onRefresh={() => void loadRoute(route)}
        pendingProjectCount={overview?.pendingProjectCount || 0}
      >
        {commandError ? <p className="inline-alert inline-alert--error" role="alert">Unable to open app settings.</p> : null}
        {content}
      </AppShell>
    </UnexpectedErrorBoundary>
  );
}
