import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n";
import type { DiagnosticsHealth } from "../types";

type SettingsPageProps = {
  health: DiagnosticsHealth;
  onOpenSettings: () => Promise<unknown>;
};

const storageLabels = {
  starting: "settings.storageStarting",
  ready: "settings.storageReady",
  error: "settings.storageError",
} satisfies Record<DiagnosticsHealth["storage"], TranslationKey>;

const trayLabels = {
  starting: "settings.trayStarting",
  native: "settings.trayNative",
  "electron-fallback": "settings.trayFallback",
  "no-host": "settings.trayNoHost",
  failed: "settings.trayFailed",
} satisfies Record<DiagnosticsHealth["tray"]["status"], TranslationKey>;

export function SettingsPage({ health, onOpenSettings }: SettingsPageProps) {
  const { t } = useI18n();
  const [commandState, setCommandState] = useState<"idle" | "pending" | "error">("idle");
  const mountedRef = useRef(true);
  const tray = health.tray ?? { status: "starting", code: null };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function openSettings() {
    setCommandState("pending");
    try {
      await onOpenSettings();
      if (mountedRef.current) setCommandState("idle");
    } catch {
      if (mountedRef.current) setCommandState("error");
    }
  }

  return (
    <section className="workspace" aria-labelledby="settings-title">
      <div className="workspace__heading">
        <div>
          <p className="eyebrow">{t("settings.eyebrow")}</p>
          <h2 id="settings-title">{t("settings.title")}</h2>
        </div>
      </div>
      <dl className="diagnostics-list">
        <div>
          <dt>{t("settings.storage")}</dt>
          <dd><span className={`status-dot status-dot--${health.storage}`} />{t(storageLabels[health.storage])}</dd>
        </div>
        <div>
          <dt>{t("settings.database")}</dt>
          <dd>{health.databaseName}</dd>
        </div>
        <div>
          <dt>{t("settings.tray")}</dt>
          <dd>{t(trayLabels[tray.status])}{tray.status === "failed" && tray.code ? ` (${tray.code})` : ""}</dd>
        </div>
      </dl>
      {health.errorMessage ? <p className="inline-alert inline-alert--error">{t("app.storageErrorDetail")}</p> : null}
      <div className="command-row">
        <button
          type="button"
          className="command-button"
          disabled={commandState === "pending"}
          onClick={openSettings}
        >
          <ExternalLink aria-hidden="true" size={15} />
          {commandState === "pending" ? t("settings.opening") : t("settings.open")}
        </button>
        {commandState === "error" ? <span className="command-error" role="alert">{t("settings.openError")}</span> : null}
      </div>
    </section>
  );
}
