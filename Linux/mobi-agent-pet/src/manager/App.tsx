import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { AppShell } from "./components/AppShell";
import { createTranslator, I18nProvider, normalizeManagerLocale } from "./i18n";
import type { ManagerLocale, TranslationKey } from "./i18n";
import { OverviewPage } from "./pages/OverviewPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SessionsPage } from "./pages/SessionsPage";
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
type SessionsRouteData = { projects: ProjectSummary[]; sessions: SessionSummary[] };
type RouteData = OverviewRouteData | SessionsRouteData | ProjectSummary[] | DiagnosticsHealth;
type ViewState =
  | { status: "loading"; route: InternalRouteId }
  | { status: "ready"; route: InternalRouteId; data: RouteData }
  | { status: "error"; route: InternalRouteId };

type AppProps = {
  api?: AgentLogApi;
};

const routeLabels: Record<InternalRouteId, TranslationKey> = {
  overview: "nav.overview",
  projects: "nav.projects",
  sessions: "nav.sessions",
  settings: "nav.settings",
};

function isRelevantScope(route: InternalRouteId, scope: string) {
  if (route === "overview") return true;
  if (route === "projects") {
    return scope === "projects" || scope === "agent-events" || scope === "human-timer";
  }
  if (route === "sessions") {
    return scope === "sessions" || scope === "projects"
      || scope === "agent-events" || scope === "human-timer";
  }
  return false;
}

function StateSurface({
  detail,
  kind,
  onRetry,
  title,
  retryLabel = "Retry",
}: {
  detail: string;
  kind: "loading" | "pending" | "error";
  onRetry?: () => void;
  title: string;
  retryLabel?: string;
}) {
  return (
    <section className={`state-surface state-surface--${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span className="state-surface__indicator" aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {onRetry ? <button type="button" className="command-button" onClick={onRetry}>{retryLabel}</button> : null}
    </section>
  );
}

class UnexpectedErrorBoundary extends Component<{
  children: ReactNode;
  detail: string;
  title: string;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The renderer deliberately avoids exposing exception details in the UI.
  }

  render() {
    if (this.state.failed) {
      return <StateSurface kind="error" title={this.props.title} detail={this.props.detail} />;
    }
    return this.props.children;
  }
}

export function App({ api = window.agentLog }: AppProps) {
  const [locale, setLocale] = useState<ManagerLocale>("en");
  const [route, setRoute] = useState<InternalRouteId>("overview");
  const [health, setHealth] = useState<DiagnosticsHealth | null | "unexpected">(null);
  const [view, setView] = useState<ViewState>({ status: "loading", route: "overview" });
  const [commandError, setCommandError] = useState(false);
  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const languageRequestRef = useRef(0);
  const routeRef = useRef<InternalRouteId>(route);
  const healthRef = useRef<DiagnosticsHealth | null | "unexpected">(health);
  routeRef.current = route;
  healthRef.current = health;
  const t = createTranslator(locale);

  const loadRoute = useCallback(async (target: InternalRouteId, { silent = false } = {}) => {
    if (!mountedRef.current) return;
    const request = ++requestRef.current;
    if (!silent) setView({ status: "loading", route: target });
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
          : await Promise.all([api.sessions.list({ includeArchived: true, limit: 500 }), api.projects.list({ includeArchived: true })])
            .then(([sessions, projects]) => ({ sessions, projects }));
      if (!mountedRef.current || request !== requestRef.current || routeRef.current !== target) return;
      setView({ status: "ready", route: target, data });
    } catch {
      if (!mountedRef.current || request !== requestRef.current || routeRef.current !== target) return;
      if (!silent) setView({ status: "error", route: target });
    }
  }, [api]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const refreshLanguage = () => {
      const languageRequest = ++languageRequestRef.current;
      void api.localization.getLanguage().then((language) => {
        if (active && languageRequest === languageRequestRef.current) {
          setLocale(normalizeManagerLocale(language));
        }
      }).catch(() => {});
    };
    const unsubscribe = api.events.onChanged((scope) => {
      if (scope === "language") {
        refreshLanguage();
        return;
      }
      const currentRoute = routeRef.current;
      if (isRelevantScope(currentRoute, scope)) void loadRoute(currentRoute, { silent: true });
    });
    refreshLanguage();
    void api.diagnostics.get().then((result) => {
      if (active) setHealth(result);
    }).catch(() => {
      if (active) setHealth("unexpected");
    });
    return () => {
      active = false;
      mountedRef.current = false;
      requestRef.current += 1;
      languageRequestRef.current += 1;
      unsubscribe();
    };
  }, [api, loadRoute]);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

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
    content = <StateSurface kind="loading" title={t("app.loadingTitle")} detail={t("app.loadingDetail")} />;
  } else if (health === "unexpected") {
    content = <StateSurface kind="error" title={t("app.loadErrorTitle")} detail={t("app.loadErrorDetail")} retryLabel={t("app.retry")} onRetry={() => window.location.reload()} />;
  } else if (health.storage === "starting") {
    content = <StateSurface kind="pending" title={t("app.storageStartingTitle")} detail={t("app.storageStartingDetail")} />;
  } else if (health.storage === "error") {
    content = <StateSurface kind="error" title={t("app.storageErrorTitle")} detail={t("app.storageErrorDetail")} />;
  } else if (view.status === "loading" || view.route !== route) {
    content = <StateSurface kind="loading" title={t("app.loadingRoute", { route: t(routeLabels[route]) })} detail={t("app.readingDetail")} />;
  } else if (view.status === "error") {
    content = <StateSurface kind="error" title={t("app.loadRouteError", { route: t(routeLabels[route]) })} detail={t("app.viewErrorDetail")} retryLabel={t("app.retry")} onRetry={() => void loadRoute(route)} />;
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
    content = <ProjectsPage projectApi={api.projects} projects={view.data as ProjectSummary[]} sessionApi={api.sessions} />;
  } else if (route === "sessions") {
    const sessionsData = view.data as SessionsRouteData;
    content = <SessionsPage projects={sessionsData.projects} sessions={sessionsData.sessions} />;
  } else {
    content = <SettingsPage health={health} onOpenSettings={() => api.settings.open("general")} />;
  }

  const overview = view.status === "ready" && view.route === "overview"
    ? (view.data as OverviewRouteData).snapshot
    : null;

  return (
    <I18nProvider locale={locale}>
      <UnexpectedErrorBoundary title={t("app.unexpectedTitle")} detail={t("app.unexpectedDetail")}>
        <AppShell
        currentRoute={route}
        isRefreshing={view.status === "loading"}
        onHide={() => void api.managerWindow.hide()}
        onNavigate={navigate}
        onRefresh={() => void loadRoute(route)}
        pendingProjectCount={overview?.pendingProjectCount || 0}
      >
        {commandError ? <p className="inline-alert inline-alert--error" role="alert">{t("app.settingsError")}</p> : null}
        {content}
        </AppShell>
      </UnexpectedErrorBoundary>
    </I18nProvider>
  );
}
