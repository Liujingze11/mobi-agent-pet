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
import type { RouteId } from "../types";

const destinations = [
  ["overview", "Overview", LayoutDashboard],
  ["projects", "Projects", FolderKanban],
  ["sessions", "Sessions", History],
  ["agents", "Agents", Bot],
  ["pet", "Pet & Themes", Palette],
  ["settings", "Settings", SettingsIcon],
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
  const currentLabel = destinations.find(([route]) => route === currentRoute)?.[1] || "Overview";

  return (
    <div className="app-shell" data-testid="manager-shell">
      <aside className="sidebar">
        <div className="product-mark" title="AgentLog Pet">
          <span className="product-mark__signal" aria-hidden="true" />
          <span className="product-mark__text">AgentLog Pet</span>
        </div>
        <nav className="primary-navigation" aria-label="Manager destinations">
          {destinations.map(([route, label, Icon]) => {
            const badge = deriveNavigationBadge(route, { pendingProjectCount });
            return (
              <button
                key={route}
                type="button"
                className="navigation-item"
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
              aria-label="Refresh current view"
              title="Refresh current view"
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
              aria-label="Hide Manager"
              title="Hide Manager"
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
