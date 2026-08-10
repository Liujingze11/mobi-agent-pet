import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DiagnosticsHealth } from "../types";

type SettingsPageProps = {
  health: DiagnosticsHealth;
  onOpenSettings: () => Promise<unknown>;
};

const storageLabels = {
  starting: "Starting",
  ready: "Ready",
  error: "Error",
} as const;

export function SettingsPage({ health, onOpenSettings }: SettingsPageProps) {
  const [commandState, setCommandState] = useState<"idle" | "pending" | "error">("idle");
  const mountedRef = useRef(true);

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
          <p className="eyebrow">Manager</p>
          <h2 id="settings-title">Diagnostics</h2>
        </div>
      </div>
      <dl className="diagnostics-list">
        <div>
          <dt>Storage</dt>
          <dd><span className={`status-dot status-dot--${health.storage}`} />{storageLabels[health.storage]}</dd>
        </div>
        <div>
          <dt>Database</dt>
          <dd>{health.databaseName}</dd>
        </div>
      </dl>
      {health.errorMessage ? <p className="inline-alert inline-alert--error">{health.errorMessage}</p> : null}
      <div className="command-row">
        <button
          type="button"
          className="command-button"
          disabled={commandState === "pending"}
          onClick={openSettings}
        >
          <ExternalLink aria-hidden="true" size={15} />
          {commandState === "pending" ? "Opening App Settings" : "Open App Settings"}
        </button>
        {commandState === "error" ? <span className="command-error">Unable to open app settings.</span> : null}
      </div>
    </section>
  );
}
