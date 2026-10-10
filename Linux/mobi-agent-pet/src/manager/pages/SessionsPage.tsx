import { useEffect, useState } from "react";

import { formatManagerDuration, useI18n } from "../i18n";
import type { AgentSession, SessionSummary, SessionUsage, UsageReport } from "../types";

type SessionsPageProps = {
  sessions: SessionSummary[];
  sessionUsage?: UsageReport["sessionUsage"];
  onLoadUsage?: (sessionId: string) => Promise<SessionUsage | null>;
  periodStart?: number;
  periodEnd?: number;
};

function dateTime(value: number | null, inProgress: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return inProgress;
  const date = new Date(value);
  const two = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}/${two(date.getMonth() + 1)}/${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

function workDuration(milliseconds: number, locale: "en" | "zh") {
  if (milliseconds > 0 && milliseconds < 60_000) {
    return String(Math.max(1, Math.round(milliseconds / 1000))) + (locale === "zh" ? "秒" : "s");
  }
  return formatManagerDuration(milliseconds, locale);
}

export function SessionsPage({ sessions, sessionUsage, onLoadUsage, periodStart, periodEnd }: SessionsPageProps) {
  const { locale, t } = useI18n();
  const [allHistory, setAllHistory] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedUsage, setLoadedUsage] = useState<Record<string, SessionUsage | null>>({});
  const [loadingUsageId, setLoadingUsageId] = useState<string | null>(null);
  const rows = sessions.filter((session): session is AgentSession => session.source === "agent")
    .filter((session) => allHistory || periodStart === undefined || periodEnd === undefined
      || (session.startedAt < periodEnd && (session.endedAt ?? Infinity) >= periodStart))
    .sort((left, right) => right.lastEventAt - left.lastEventAt || left.id.localeCompare(right.id));
  const selected = rows.find((session) => session.id === selectedId) || null;
  const selectedUsage = selected ? sessionUsage?.[selected.id] ?? loadedUsage[selected.id] ?? null : null;
  const tokenCount = (value: number) => new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value);
  const agentName = (agentId: string) => agentId === "claude-code" ? "Claude Code" : agentId === "codex" ? "Codex" : agentId;
  const displayName = (session: AgentSession) => session.title || t("sessions.agentFallback", { agent: session.agentId });
  const displayDate = (value: number | null) => dateTime(value, t("sessions.inProgress"));

  useEffect(() => {
    if (!selected || !onLoadUsage || sessionUsage?.[selected.id] || Object.hasOwn(loadedUsage, selected.id)) return;
    const id = selected.id;
    let active = true;
    setLoadingUsageId(id);
    void onLoadUsage(id).then((usage) => {
      if (active) setLoadedUsage((previous) => ({ ...previous, [id]: usage }));
    }).catch(() => {
      if (active) setLoadedUsage((previous) => ({ ...previous, [id]: null }));
    }).finally(() => {
      if (active) setLoadingUsageId(null);
    });
    return () => { active = false; };
  }, [loadedUsage, onLoadUsage, selected?.id, sessionUsage]);

  const usageFor = (session: AgentSession) => sessionUsage?.[session.id] ?? loadedUsage[session.id] ?? null;
  const usageFallback = (session: AgentSession) => Object.hasOwn(loadedUsage, session.id)
    ? t("usage.noData") : t("usage.openForUsage");

  return (
    <section className="sessions-workspace" aria-label={t("sessions.title")}>
      <div className="records-summary">
        <span>{t("sessions.shown", { count: rows.length })}</span>
        {periodStart !== undefined && periodEnd !== undefined ? <button type="button" onClick={() => setAllHistory((value) => !value)}>{t(allHistory ? "sessions.currentPeriod" : "sessions.allHistory")}</button> : null}
      </div>
      <div className="sessions-layout">
        <div className="session-table-wrap">
          {rows.length ? <table className="session-table">
            <thead><tr><th>{t("sessions.session")}</th><th>{t("sessions.started")}</th><th>{t("sessions.ended")}</th><th>{t("sessions.agent")}</th><th>{t("sessions.workDuration")}</th><th>{t("usage.tokens")}</th></tr></thead>
            <tbody>{rows.map((session) => {
              const usage = usageFor(session);
              return <tr key={session.id} data-selected={selectedId === session.id || undefined}>
                <td><button type="button" className="session-table__title" aria-label={t("sessions.open", { name: displayName(session) })} onClick={() => setSelectedId(session.id)}><strong>{displayName(session)}</strong></button></td>
                <td className="session-table__date"><time dateTime={new Date(session.startedAt).toISOString()}>{displayDate(session.startedAt)}</time></td>
                <td className="session-table__date">{session.endedAt == null ? t("sessions.inProgress") : <time dateTime={new Date(session.endedAt).toISOString()}>{displayDate(session.endedAt)}</time>}</td>
                <td><span className="session-table__agent">{agentName(session.agentId)}</span></td>
                <td className="session-table__number">{workDuration(session.activeMs, locale)}</td>
                <td className="session-table__number">{usage ? tokenCount(usage.inputTokens + usage.outputTokens) : usageFallback(session)}</td>
              </tr>;
            })}</tbody>
          </table> : <div className="workspace-empty">{t("sessions.empty")}</div>}
        </div>
        {selected ? <aside className="session-detail" aria-label={t("sessions.detail")}>
          <div className="section-heading"><h3>{displayName(selected)}</h3><span>{agentName(selected.agentId)}</span></div>
          <dl>
            <div><dt>{t("sessions.started")}</dt><dd>{displayDate(selected.startedAt)}</dd></div>
            <div><dt>{t("sessions.ended")}</dt><dd>{displayDate(selected.endedAt)}</dd></div>
            <div><dt>{t("usage.timeHeading")}</dt><dd>{workDuration(selected.activeMs, locale)}</dd></div>
            <div><dt>{t("usage.inputTokens")}</dt><dd>{selectedUsage ? tokenCount(selectedUsage.inputTokens) : loadingUsageId === selected.id ? t("usage.loading") : t("usage.noData")}</dd></div>
            <div><dt>{t("usage.outputTokens")}</dt><dd>{selectedUsage ? tokenCount(selectedUsage.outputTokens) : t("usage.noData")}</dd></div>
            <div><dt>{t("usage.cacheTokens")}</dt><dd>{selectedUsage ? tokenCount(selectedUsage.cachedInputTokens) : t("usage.noData")}</dd></div>
            {selectedUsage?.models?.length ? <div><dt>{t("sessions.models")}</dt><dd>{selectedUsage.models.join(", ")}</dd></div> : null}
            {selectedUsage?.undatedRecords ? <div><dt>{t("usage.dataStatus")}</dt><dd>{t("usage.partialData")}</dd></div> : null}
          </dl>
        </aside> : null}
      </div>
    </section>
  );
}
