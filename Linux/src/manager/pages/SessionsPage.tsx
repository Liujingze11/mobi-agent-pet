import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { filterSessions, formatDuration, formatPath } from "../model.mjs";
import type { ProjectSummary, SessionSummary } from "../types";

type SessionKind = "all" | "agent" | "human";

type SessionsPageProps = {
  projects: ProjectSummary[];
  sessions: SessionSummary[];
};

function sessionName(session: SessionSummary) {
  if (session.source === "agent") return session.title || `${session.agentId} session`;
  return session.notes || "Human work session";
}

function sessionStatus(session: SessionSummary) {
  return session.source === "agent" ? session.disposition : session.status;
}

function sessionDuration(session: SessionSummary) {
  return session.source === "agent" ? session.activeMs : session.effectiveMs;
}

function dateTime(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "In progress";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionsPage({ projects, sessions }: SessionsPageProps) {
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

  return (
    <section className="sessions-workspace" aria-labelledby="sessions-title">
      <div className="workspace__heading">
        <div><p className="eyebrow">History</p><h2 id="sessions-title">Sessions</h2></div>
        <span>{rows.length} shown</span>
      </div>

      <div className="session-filters" aria-label="Session filters">
        <div className="segmented-control" aria-label="Session source">
          <button type="button" aria-pressed={kind === "all"} aria-label="All sessions" onClick={() => setKind("all")}>All</button>
          <button type="button" aria-pressed={kind === "agent"} aria-label="Agent sessions" onClick={() => setKind("agent")}>Agent</button>
          <button type="button" aria-pressed={kind === "human"} aria-label="Human sessions" onClick={() => setKind("human")}>Human</button>
        </div>
        <label><span>Project</span><select aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label><span>Status</span><select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Any status</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>From</span><input aria-label="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label><span>To</span><input aria-label="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <button type="button" className="icon-button session-sort" aria-label={`Sort ${direction === "newest" ? "oldest" : "newest"} first`} title={`Sort ${direction === "newest" ? "oldest" : "newest"} first`} onClick={() => setDirection((value) => value === "newest" ? "oldest" : "newest")}>
          {direction === "newest" ? <ArrowDown aria-hidden="true" size={16} /> : <ArrowUp aria-hidden="true" size={16} />}
        </button>
      </div>

      <div className="sessions-layout">
        <div className="session-table-wrap">
          {rows.length > 0 ? (
            <table className="session-table">
              <thead><tr><th>Source</th><th>Session</th><th>Project</th><th>Started</th><th>Status</th><th>Duration</th></tr></thead>
              <tbody>{rows.map((session) => (
                <tr key={session.id} data-selected={selectedId === session.id || undefined}>
                  <td>{session.source === "agent" ? session.agentId : "Human"}</td>
                  <td><button type="button" aria-label={`Open session ${sessionName(session)}`} onClick={() => setSelectedId(session.id)}>{sessionName(session)}</button></td>
                  <td>{session.projectName || "Unassigned"}</td>
                  <td>{dateTime(session.startedAt)}</td>
                  <td><span className={`record-state record-state--${sessionStatus(session)}`}>{sessionStatus(session)}</span></td>
                  <td>{formatDuration(sessionDuration(session))}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <div className="workspace-empty">No sessions match these filters.</div>}
        </div>

        {selected ? (
          <aside className="session-detail" aria-label="Session detail">
            <div className="section-heading"><h3>{sessionName(selected)}</h3><span>{selected.source}</span></div>
            <dl>
              <div><dt>Project</dt><dd>{selected.projectName || "Unassigned"}</dd></div>
              <div><dt>Started</dt><dd>{dateTime(selected.startedAt)}</dd></div>
              <div><dt>Ended</dt><dd>{dateTime(selected.endedAt)}</dd></div>
              <div><dt>Status</dt><dd>{sessionStatus(selected)}</dd></div>
              {selected.source === "agent" ? <>
                <div><dt>Active time</dt><dd>{formatDuration(selected.activeMs)}</dd></div>
                <div><dt>Working directory</dt><dd title={selected.cwd || undefined}>{formatPath(selected.cwd, 34)}</dd></div>
                <div><dt>Parent session</dt><dd>{selected.parentSourceSessionId || "None"}</dd></div>
              </> : <>
                <div><dt>Effective time</dt><dd>{formatDuration(selected.effectiveMs)}</dd></div>
                <div><dt>Paused time</dt><dd>{formatDuration(selected.accumulatedPauseMs)}</dd></div>
                <div><dt>Notes</dt><dd>{selected.notes || "None"}</dd></div>
              </>}
            </dl>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
