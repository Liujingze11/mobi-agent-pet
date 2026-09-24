import type { ReactNode } from "react";
import {
  Bot,
  FolderKanban,
  History,
  LayoutDashboard,
  Minus,
  Palette,
  RefreshCw,
  Settings as SettingsIcon,
} from "lucide-react";

import { deriveNavigationBadge } from "../model.mjs";
import { useI18n } from "../i18n";
import type { RouteId } from "../types";

const destinations = [
  ["overview", "nav.overview", LayoutDashboard],
  ["projects", "nav.projects", FolderKanban],
  ["sessions", "nav.sessions", History],
  ["agents", "nav.agents", Bot],
  ["pet", "nav.pet", Palette],
  ["settings", "nav.settings", SettingsIcon],
] as const;

type AppShellProps = {
  children: ReactNode;
  currentRoute: RouteId;
  isRefreshing?: boolean;
  onHide?: () => void;
  onNavigate: (route: RouteId) => void;
  onRefresh?: () => void;
  pendingProjectCount?: number;
};

export function AppShell({
  children,
  currentRoute,
  isRefreshing = false,
  onHide,
  onNavigate,
  onRefresh,
  pendingProjectCount = 0,
}: AppShellProps) {
  const { t } = useI18n();
  const currentKey = destinations.find(([route]) => route === currentRoute)?.[1] || "nav.overview";
  const currentLabel = t(currentKey);

  return (
    <div className="app-shell" data-testid="manager-shell">
      <aside className="sidebar">
        <div className="product-mark" title={t("app.productName")}>
          <span className="product-mark__signal" aria-hidden="true" />
          <span className="product-mark__text">{t("app.productName")}</span>
        </div>
        <nav className="primary-navigation" aria-label={t("nav.destinations")}>
          {destinations.map(([route, labelKey, Icon]) => {
            const label = t(labelKey);
            const badge = deriveNavigationBadge(route, { pendingProjectCount });
            return (
              <button
                key={route}
                type="button"
                className={`navigation-item${badge ? " navigation-item--has-badge" : ""}`}
                aria-current={currentRoute === route ? "page" : undefined}
                aria-label={label}
                title={label}
                onClick={() => onNavigate(route)}
              >
                <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
                <span className="navigation-item__label">{label}</span>
                {badge ? <span className="navigation-item__badge">{badge}</span> : null}
              </button>
            );
          })}
        </nav>
      </aside>

      <header className="toolbar">
        <h1>{currentLabel}</h1>
        <div className="toolbar__commands">
          {onRefresh ? (
            <button
              type="button"
              className="icon-button"
              aria-label={t("nav.refresh")}
              title={t("nav.refresh")}
              disabled={isRefreshing}
              onClick={onRefresh}
            >
              <RefreshCw aria-hidden="true" size={16} />
            </button>
          ) : null}
          {onHide ? (
            <button
              type="button"
              className="icon-button"
              aria-label={t("nav.hide")}
              title={t("nav.hide")}
              onClick={onHide}
            >
              <Minus aria-hidden="true" size={17} />
            </button>
          ) : null}
        </div>
      </header>

      <main className="manager-content">{children}</main>
    </div>
  );
}
