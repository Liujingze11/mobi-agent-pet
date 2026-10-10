import type { ReactNode } from "react";
import { Minus, RefreshCw } from "lucide-react";

import { useI18n } from "../i18n";

type AppShellProps = {
  children: ReactNode;
  activePage?: "usage" | "providers";
  isRefreshing?: boolean;
  onHide?: () => void;
  onNavigate?: (page: "usage" | "providers") => void;
  onRefresh?: () => void;
};

export function AppShell({
  children,
  activePage = "usage",
  isRefreshing = false,
  onHide,
  onNavigate,
  onRefresh,
}: AppShellProps) {
  const { t } = useI18n();

  return (
    <div className="app-shell" data-testid="manager-shell">
      <header className="toolbar">
        <div className="toolbar__identity">
          <span className="product-mark__signal" aria-hidden="true" />
          <span className="product-mark__text">{t("app.productName")}</span>
          <span className="toolbar__divider" aria-hidden="true" />
          <h1>{activePage === "providers" ? t("providers.title") : t("sessions.title")}</h1>
        </div>
        {onNavigate ? <nav className="toolbar__tabs" aria-label={t("nav.destinations")}>
          <button type="button" aria-current={activePage === "usage" ? "page" : undefined}
            onClick={() => onNavigate("usage")}>{t("nav.usage")}</button>
          <button type="button" aria-current={activePage === "providers" ? "page" : undefined}
            onClick={() => onNavigate("providers")}>{t("nav.providers")}</button>
        </nav> : null}
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
