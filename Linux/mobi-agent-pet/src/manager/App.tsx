import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { UsageOverview } from "./components/UsageOverview";
import { createTranslator, I18nProvider, normalizeManagerLocale } from "./i18n";
import type { ManagerLocale } from "./i18n";
import { SessionsPage } from "./pages/SessionsPage";
import { ProviderPage } from "./providers/ProviderPage";
import type { AgentLogApi, DiagnosticsHealth, SessionSummary, UsageReport } from "./types";

type RecordsData = { sessions: SessionSummary[]; report: UsageReport };
type ViewState =
  | { status: "loading" }
  | { status: "ready"; data: RecordsData }
  | { status: "error" };

type AppProps = { api?: AgentLogApi };

function shouldRefreshRecords(scope: string) {
  return scope === "sessions" || scope === "agent-events";
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
  const [health, setHealth] = useState<DiagnosticsHealth | null | "unexpected">(null);
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [activePage, setActivePage] = useState<"usage" | "providers">("usage");
  const [refreshError, setRefreshError] = useState(false);
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [anchor, setAnchor] = useState(() => Date.now());
  const periodRef = useRef<"day" | "week">("day");
  const anchorRef = useRef(anchor);
  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const languageRequestRef = useRef(0);
  const refreshingRef = useRef(false);
  const t = createTranslator(locale);

  const loadRecords = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!mountedRef.current) return;
    if (refreshingRef.current && (force || silent)) return;
    const request = ++requestRef.current;
    if (force) {
      refreshingRef.current = true;
      setRefreshing(true);
      setRefreshError(false);
    }
    if (!silent) setView({ status: "loading" });
    try {
      const [sessions, report] = await Promise.all([
        api.sessions.list({ includeArchived: true, source: "agent", limit: 500 }),
        api.analytics.get({ period: periodRef.current, anchor: anchorRef.current, ...(force ? { force: true } : {}) }),
      ]);
      if (!mountedRef.current || request !== requestRef.current) return;
      setView({ status: "ready", data: { sessions, report } });
      setRefreshError(false);
    } catch {
      if (!mountedRef.current || request !== requestRef.current) return;
      if (!silent) setView({ status: "error" });
      if (force) setRefreshError(true);
    } finally {
      if (force) {
        refreshingRef.current = false;
        if (mountedRef.current) setRefreshing(false);
      }
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
      if (scope === "language") refreshLanguage();
      else if (shouldRefreshRecords(scope)) void loadRecords({ silent: true });
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
  }, [api, loadRecords]);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  useEffect(() => {
    if (health && health !== "unexpected" && health.storage === "ready") void loadRecords();
  }, [health, loadRecords]);

  let content: ReactNode;
  if (health === null) {
    content = <StateSurface kind="loading" title={t("app.loadingTitle")} detail={t("app.loadingDetail")} />;
  } else if (health === "unexpected") {
    content = <StateSurface kind="error" title={t("app.loadErrorTitle")} detail={t("app.loadErrorDetail")} retryLabel={t("app.retry")} onRetry={() => window.location.reload()} />;
  } else if (health.storage === "starting") {
    content = <StateSurface kind="pending" title={t("app.storageStartingTitle")} detail={t("app.storageStartingDetail")} />;
  } else if (health.storage === "error") {
    content = <StateSurface kind="error" title={t("app.storageErrorTitle")} detail={t("app.storageErrorDetail")} />;
  } else if (activePage === "providers") {
    content = <ProviderPage api={api.providers} onChanged={api.events.onChanged} />;
  } else if (view.status === "loading") {
    content = <StateSurface kind="loading" title={t("app.loadingRoute", { route: t("sessions.title") })} detail={t("app.readingDetail")} />;
  } else if (view.status === "error") {
    content = <StateSurface kind="error" title={t("app.loadRouteError", { route: t("sessions.title") })} detail={t("app.viewErrorDetail")} retryLabel={t("app.retry")} onRetry={() => void loadRecords()} />;
  } else {
    content = <>
      <UsageOverview
        report={view.data.report}
        period={period}
        anchor={anchor}
        isRefreshing={refreshing}
        refreshError={refreshError}
        onRefresh={() => void loadRecords({ silent: true, force: true })}
        onPeriodChange={(next) => {
          periodRef.current = next;
          setPeriod(next);
          void loadRecords();
        }}
        onAnchorChange={(next) => {
          anchorRef.current = next;
          setAnchor(next);
          void loadRecords();
        }}
      />
      <details className="session-history" open><summary><span>{t("sessions.completeList")}</span><ChevronDown aria-hidden="true" size={18} /></summary>
        <SessionsPage
          sessions={view.data.sessions}
          sessionUsage={view.data.report.sessionUsage || {}}
          periodStart={view.data.report.start}
          periodEnd={view.data.report.end}
          onLoadUsage={api.sessions.usage}
        />
      </details>
    </>;
  }

  return (
    <I18nProvider locale={locale}>
      <UnexpectedErrorBoundary title={t("app.unexpectedTitle")} detail={t("app.unexpectedDetail")}>
        <AppShell
          activePage={activePage}
          onNavigate={setActivePage}
          onHide={() => void api.managerWindow.hide()}
        >
          {content}
        </AppShell>
      </UnexpectedErrorBoundary>
    </I18nProvider>
  );
}
