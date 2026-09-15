import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { filterSessions, formatDuration, formatPath } from "../model.mjs";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n";
import type { ProjectSummary, SessionSummary } from "../types";

type SessionKind = "all" | "agent" | "human";

type SessionsPageProps = {
  projects: ProjectSummary[];
  sessions: SessionSummary[];
};

function sessionStatus(session: SessionSummary) {
  return session.source === "agent" ? session.disposition : session.status;
}

function sessionDuration(session: SessionSummary) {
  return session.source === "agent" ? session.activeMs : session.effectiveMs;
}

const statusKeys: Record<string, TranslationKey> = {
  active: "status.active",
  running: "status.running",
  paused: "status.paused",
  completed: "status.completed",
  errored: "status.errored",
  interrupted: "status.interrupted",
};

function dateTime(value: number | null, locale: "en" | "zh", inProgress: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return inProgress;
  return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionsPage({ projects, sessions }: SessionsPageProps) {
  const { locale, t } = useI18n();
  const [kind, setKind] = useState<SessionKind>("all");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [direction, setDirection] = useState<"newest" | "oldest">("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const statuses = kind === "agent"
    ? ["active", "completed", "errored", "interrupted"]
    : kind === "human"
      ? ["running", "paused", "completed"]
      : ["active", "running", "paused", "completed", "errored", "interrupted"];

  useEffect(() => {
    if (status && !statuses.includes(status)) setStatus("");
  }, [status, statuses]);

  const rows = useMemo(
    () => filterSessions(sessions, { kind, projectId, status, from, to, direction }) as SessionSummary[],
    [direction, from, kind, projectId, sessions, status, to]
  );
  const selected = sessions.find((session) => session.id === selectedId) || null;
  const displayName = (session: SessionSummary) => session.source === "agent"
    ? session.title || t("sessions.agentFallback", { agent: session.agentId })
    : session.notes || t("sessions.humanFallback");
  const displayStatus = (session: SessionSummary) => {
    const value = sessionStatus(session);
    return statusKeys[value] ? t(statusKeys[value]) : value;
  };
  const displayDate = (value: number | null) => dateTime(value, locale, t("sessions.inProgress"));

  return (
    <section className="sessions-workspace" aria-labelledby="sessions-title">
      <div className="workspace__heading">
        <div><p className="eyebrow">{t("sessions.eyebrow")}</p><h2 id="sessions-title">{t("sessions.title")}</h2></div>
        <span>{t("sessions.shown", { count: rows.length })}</span>
      </div>

      <div className="session-filters" aria-label={t("sessions.filters")}>
        <div className="segmented-control" aria-label={t("sessions.sourceFilter")}>
          <button type="button" aria-pressed={kind === "all"} aria-label={t("sessions.allAria")} onClick={() => setKind("all")}>{t("sessions.all")}</button>
          <button type="button" aria-pressed={kind === "agent"} aria-label={t("sessions.agentAria")} onClick={() => setKind("agent")}>{t("sessions.agent")}</button>
          <button type="button" aria-pressed={kind === "human"} aria-label={t("sessions.humanAria")} onClick={() => setKind("human")}>{t("sessions.human")}</button>
        </div>
        <label><span>{t("sessions.project")}</span><select aria-label={t("sessions.project")} value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">{t("sessions.allProjects")}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label><span>{t("sessions.status")}</span><select aria-label={t("sessions.status")} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t("sessions.anyStatus")}</option>{statuses.map((value) => <option key={value} value={value}>{statusKeys[value] ? t(statusKeys[value]) : value}</option>)}</select></label>
        <label><span>{t("sessions.from")}</span><input aria-label={t("sessions.fromDate")} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label><span>{t("sessions.to")}</span><input aria-label={t("sessions.toDate")} type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <button type="button" className="icon-button session-sort" aria-label={t(direction === "newest" ? "sessions.sortOldest" : "sessions.sortNewest")} title={t(direction === "newest" ? "sessions.sortOldest" : "sessions.sortNewest")} onClick={() => setDirection((value) => value === "newest" ? "oldest" : "newest")}>
          {direction === "newest" ? <ArrowDown aria-hidden="true" size={16} /> : <ArrowUp aria-hidden="true" size={16} />}
        </button>
      </div>

      <div className="sessions-layout">
        <div className="session-table-wrap">
          {rows.length > 0 ? (
            <table className="session-table">
              <thead><tr><th>{t("sessions.source")}</th><th>{t("sessions.session")}</th><th>{t("sessions.project")}</th><th>{t("sessions.started")}</th><th>{t("sessions.status")}</th><th>{t("sessions.duration")}</th></tr></thead>
              <tbody>{rows.map((session) => (
                <tr key={session.id} data-selected={selectedId === session.id || undefined}>
                  <td>{session.source === "agent" ? session.agentId : t("sessions.human")}</td>
                  <td><button type="button" aria-label={t("sessions.open", { name: displayName(session) })} onClick={() => setSelectedId(session.id)}>{displayName(session)}</button></td>
                  <td>{session.projectName || t("sessions.unassigned")}</td>
                  <td>{displayDate(session.startedAt)}</td>
                  <td><span className={`record-state record-state--${sessionStatus(session)}`}>{displayStatus(session)}</span></td>
                  <td>{formatDuration(sessionDuration(session))}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <div className="workspace-empty">{t("sessions.empty")}</div>}
        </div>

        {selected ? (
          <aside className="session-detail" aria-label={t("sessions.detail")}>
            <div className="section-heading"><h3>{displayName(selected)}</h3><span>{selected.source === "agent" ? t("sessions.agent") : t("sessions.human")}</span></div>
            <dl>
              <div><dt>{t("sessions.project")}</dt><dd>{selected.projectName || t("sessions.unassigned")}</dd></div>
              <div><dt>{t("sessions.started")}</dt><dd>{displayDate(selected.startedAt)}</dd></div>
              <div><dt>{t("sessions.ended")}</dt><dd>{displayDate(selected.endedAt)}</dd></div>
              <div><dt>{t("sessions.status")}</dt><dd>{displayStatus(selected)}</dd></div>
              {selected.source === "agent" ? <>
                <div><dt>{t("sessions.activeTime")}</dt><dd>{formatDuration(selected.activeMs)}</dd></div>
                <div><dt>{t("sessions.workingDirectory")}</dt><dd title={selected.cwd || undefined}>{formatPath(selected.cwd, 34)}</dd></div>
                <div><dt>{t("sessions.parent")}</dt><dd>{selected.parentSourceSessionId || t("sessions.none")}</dd></div>
              </> : <>
                <div><dt>{t("sessions.effectiveTime")}</dt><dd>{formatDuration(selected.effectiveMs)}</dd></div>
                <div><dt>{t("sessions.pausedTime")}</dt><dd>{formatDuration(selected.accumulatedPauseMs)}</dd></div>
                <div><dt>{t("sessions.notes")}</dt><dd>{selected.notes || t("sessions.none")}</dd></div>
              </>}
            </dl>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
