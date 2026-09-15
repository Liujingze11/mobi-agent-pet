import { Archive, Check, FolderPlus, GitMerge, Link, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { formatDuration, formatPath, sortProjects } from "../model.mjs";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n";
import type { ActivityEvent, AgentLogApi, ProjectDetail, ProjectSummary, SessionSummary } from "../types";

type ProjectTab = "overview" | "activity" | "sessions" | "settings";
type ProjectDialog =
  | { kind: "add"; path: string }
  | { kind: "confirm" }
  | { kind: "edit" }
  | { kind: "merge" }
  | { kind: "archive" }
  | null;

type ProjectsPageProps = {
  projectApi: AgentLogApi["projects"];
  projects: ProjectSummary[];
  sessionApi: AgentLogApi["sessions"];
};

function basename(path: string, fallback: string) {
  return path.split(/[\\/]+/).filter(Boolean).at(-1) || fallback;
}

const tabKeys: Record<ProjectTab, TranslationKey> = {
  overview: "projects.tabOverview",
  activity: "projects.tabActivity",
  sessions: "projects.tabSessions",
  settings: "projects.tabSettings",
};

const statusKeys: Record<string, TranslationKey> = {
  active: "status.active",
  archived: "status.archived",
  running: "status.running",
  paused: "status.paused",
  completed: "status.completed",
  errored: "status.errored",
  interrupted: "status.interrupted",
};

const pathKeys: Record<ProjectSummary["paths"][number]["kind"], TranslationKey> = {
  primary: "path.primary",
  alias: "path.alias",
  worktree: "path.worktree",
};

export function ProjectsPage({ projectApi, projects: initialProjects, sessionApi }: ProjectsPageProps) {
  const { locale, t } = useI18n();
  const [projects, setProjects] = useState(() => sortProjects(initialProjects) as ProjectSummary[]);
  const [selectedId, setSelectedId] = useState<string | null>(() => (sortProjects(initialProjects)[0] as ProjectSummary | undefined)?.id || null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [timeline, setTimeline] = useState<ActivityEvent[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [tab, setTab] = useState<ProjectTab>("overview");
  const [dialog, setDialog] = useState<ProjectDialog>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedExternalUpdatedAt = initialProjects.find((project) => project.id === selectedId)?.updatedAt;

  useEffect(() => {
    const next = sortProjects(initialProjects) as ProjectSummary[];
    setProjects(next);
    setSelectedId((current) => next.some((project) => project.id === current) ? current : next[0]?.id || null);
  }, [initialProjects]);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setTimeline([]);
    setSessions([]);
    if (!selectedId) return () => { active = false; };
    void Promise.all([
      projectApi.get(selectedId),
      sessionApi.timeline({ projectId: selectedId, limit: 100 }),
      sessionApi.list({ projectId: selectedId, includeArchived: true, limit: 100 }),
    ]).then(([nextDetail, nextTimeline, nextSessions]) => {
      if (!active) return;
      setDetail(nextDetail);
      setTimeline(nextTimeline);
      setSessions(nextSessions);
    }).catch(() => {
      if (active) setError(t("projects.errorDetails"));
    });
    return () => { active = false; };
  }, [projectApi, selectedExternalUpdatedAt, selectedId, sessionApi]);

  const selected = projects.find((project) => project.id === selectedId) || null;
  const current = detail || selected;
  const mergeTargets = useMemo(
    () => projects.filter((project) => project.id !== selectedId && project.lifecycle === "active" && project.confirmation === "confirmed"),
    [projects, selectedId]
  );

  function openDialog(next: Exclude<ProjectDialog, null>) {
    if (next.kind !== "add" && !current) return;
    setError(null);
    setName(next.kind === "add" ? basename(next.path, t("projects.newProject")) : current?.name || "");
    setDescription(next.kind === "add" ? "" : current?.description || "");
    setMergeTargetId(mergeTargets[0]?.id || "");
    setDialog(next);
  }

  async function addProject() {
    setError(null);
    try {
      const result = await projectApi.pickFolder();
      if (!result.cancelled && result.path) openDialog({ kind: "add", path: result.path });
    } catch {
      setError(t("projects.errorSelect"));
    }
  }

  function replaceProject(project: ProjectSummary) {
    setProjects((rows) => sortProjects(rows.map((row) => row.id === project.id ? project : row)) as ProjectSummary[]);
    setSelectedId(project.id);
    setDetail({ ...project, today: detail?.id === project.id ? detail.today : undefined });
  }

  async function submitDialog() {
    if (!dialog || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (dialog.kind === "add") {
        const created = await projectApi.addFromFolder({ path: dialog.path, name: name.trim(), description: description.trim() });
        if (created) {
          setProjects((rows) => sortProjects([...rows, created]) as ProjectSummary[]);
          setSelectedId(created.id);
          setDetail(created);
        }
      } else if (dialog.kind === "confirm" && current) {
        const confirmed = await projectApi.confirm({ id: current.id, name: name.trim(), description: description.trim() });
        if (confirmed) replaceProject(confirmed);
      } else if (dialog.kind === "edit" && current) {
        const updated = await projectApi.update({ id: current.id, name: name.trim(), description: description.trim() });
        if (updated) replaceProject(updated);
      } else if (dialog.kind === "merge" && current && mergeTargetId) {
        const target = await projectApi.merge({ sourceProjectId: current.id, targetProjectId: mergeTargetId });
        setProjects((rows) => sortProjects(rows.filter((row) => row.id !== current.id).map((row) => row.id === target?.id ? target : row)) as ProjectSummary[]);
        setSelectedId(target?.id || mergeTargetId);
        setDetail(target);
      } else if (dialog.kind === "archive" && current) {
        await projectApi.archive(current.id);
        const remaining = projects.filter((project) => project.id !== current.id);
        setProjects(sortProjects(remaining) as ProjectSummary[]);
        setSelectedId(remaining[0]?.id || null);
        setDetail(null);
      }
      setDialog(null);
    } catch {
      setError(t("projects.errorOperation"));
    } finally {
      setBusy(false);
    }
  }

  async function addAlias() {
    if (!current || busy) return;
    setError(null);
    try {
      const result = await projectApi.pickFolder();
      if (result.cancelled || !result.path) return;
      setBusy(true);
      await projectApi.addPath({ projectId: current.id, path: result.path, kind: "alias" });
      const updated = await projectApi.get(current.id);
      if (updated) replaceProject(updated);
    } catch {
      setError(t("projects.errorAlias"));
    } finally {
      setBusy(false);
    }
  }

  async function updatePath(pathId: string, action: "rebind" | "remove") {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = action === "rebind"
        ? await projectApi.rebind({ projectId: current.id, pathId })
        : await projectApi.removePath({ projectId: current.id, pathId });
      if (updated) replaceProject(updated);
    } catch {
      setError(t("projects.errorPath"));
    } finally {
      setBusy(false);
    }
  }

  const projectStatus = (project: ProjectSummary) => project.confirmation === "pending"
    ? t("projects.pending")
    : t(statusKeys[project.lifecycle]);
  const eventName = (event: ActivityEvent) => event.toolName || event.type || t("projects.activity");
  const sessionName = (session: SessionSummary) => session.source === "agent"
    ? session.title || t("sessions.agentFallback", { agent: session.agentId })
    : session.notes || t("sessions.humanFallback");
  const sessionState = (session: SessionSummary) => {
    const value = session.source === "agent" ? session.disposition : session.status;
    return statusKeys[value] ? t(statusKeys[value]) : value;
  };

  return (
    <section className="projects-workspace" aria-labelledby="projects-title">
      <div className="workspace__heading projects-heading">
        <div><p className="eyebrow">{t("projects.eyebrow")}</p><h2 id="projects-title">{t("projects.title")}</h2></div>
        <button type="button" className="command-button" onClick={() => void addProject()}><FolderPlus aria-hidden="true" size={15} />{t("projects.add")}</button>
      </div>
      {error ? <p className="inline-alert inline-alert--error" role="alert">{error}</p> : null}

      <div className="projects-layout">
        <aside className="project-list" aria-label={t("projects.list")}>
          {projects.length > 0 ? projects.map((project) => (
            <button key={project.id} type="button" aria-label={t("projects.open", { name: project.name })} aria-current={selectedId === project.id || undefined} onClick={() => { setSelectedId(project.id); setTab("overview"); }}>
              <span><strong>{project.name}</strong><small title={project.paths[0]?.path}>{formatPath(project.paths[0]?.path, 31)}</small></span>
              <span className={`record-state record-state--${project.confirmation}`}>{projectStatus(project)}</span>
            </button>
          )) : <div className="workspace-empty">{t("projects.empty")}</div>}
        </aside>

        <div className="project-detail">
          {current ? <>
            <header className="project-detail__header">
              <div><h2>{current.name}</h2><p>{current.description || t("projects.noDescription")}</p></div>
              {current.confirmation === "pending" ? <button type="button" className="command-button command-button--accent" onClick={() => openDialog({ kind: "confirm" })}><Check aria-hidden="true" size={15} />{t("projects.confirm")}</button> : null}
            </header>
            {current.confirmation === "pending" ? <p className="pending-notice">{t("projects.pending")}</p> : null}
            <div className="detail-tabs" role="tablist" aria-label={t("projects.details")}>
              {(["overview", "activity", "sessions", "settings"] as ProjectTab[]).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{t(tabKeys[value])}</button>)}
            </div>

            {tab === "overview" ? <div className="project-tab project-overview">
              <dl className="project-time-band">
                <div><dt>{t("overview.agentSessionTime")}</dt><dd>{formatDuration(detail?.today?.agentSessionMs || 0)}</dd></div>
                <div><dt>{t("overview.agentActiveTime")}</dt><dd>{formatDuration(detail?.today?.agentActiveMs || 0)}</dd></div>
                <div><dt>{t("overview.humanTime")}</dt><dd>{formatDuration(detail?.today?.humanMs || 0)}</dd></div>
              </dl>
              <div className="path-list"><div className="section-heading"><h3>{t("projects.paths")}</h3><span>{current.paths.length}</span></div>{current.paths.map((path) => <div className="path-row" key={path.id}>
                <span className={`path-health path-health--${path.isAvailable ? "ready" : "missing"}`} title={path.isAvailable ? t("projects.pathAvailable") : t("projects.pathUnavailable")} />
                <div><strong title={path.path}>{formatPath(path.path, 54)}</strong><span>{t(pathKeys[path.kind])} / {path.gitBranch || t("projects.noBranch")} / {path.gitRemoteIdentity || t("projects.noRemote")}</span></div>
              </div>)}</div>
            </div> : null}

            {tab === "activity" ? <div className="project-tab"><div className="section-heading"><h3>{t("projects.activity")}</h3><span>{timeline.length}</span></div>{timeline.length > 0 ? <ol className="project-activity">{timeline.map((event) => <li key={event.id}><time>{new Date(event.occurredAt).toLocaleString(locale === "zh" ? "zh-CN" : "en")}</time><strong>{eventName(event)}</strong><span>{event.agentId} / {event.state && statusKeys[event.state] ? t(statusKeys[event.state]) : event.state || t("projects.activity")}</span></li>)}</ol> : <div className="workspace-empty">{t("projects.noActivity")}</div>}</div> : null}

            {tab === "sessions" ? <div className="project-tab"><div className="section-heading"><h3>{t("projects.sessions")}</h3><span>{sessions.length}</span></div>{sessions.length > 0 ? <ul className="project-sessions">{sessions.map((session) => <li key={session.id}><strong>{sessionName(session)}</strong><span>{session.source === "agent" ? t("sessions.agent") : t("sessions.human")} / {sessionState(session)}</span></li>)}</ul> : <div className="workspace-empty">{t("projects.noSessions")}</div>}</div> : null}

            {tab === "settings" ? <div className="project-tab project-settings">
              <div className="project-command-row"><div><strong>{t("projects.details")}</strong><span>{t("projects.editHint")}</span></div><button type="button" className="icon-button" aria-label={t("projects.edit")} title={t("projects.edit")} onClick={() => openDialog({ kind: "edit" })}><Pencil aria-hidden="true" size={16} /></button></div>
              <div className="project-command-row"><div><strong>{t("projects.aliasPath")}</strong><span>{t("projects.aliasHint")}</span></div><button type="button" className="icon-button" aria-label={t("projects.addAlias")} title={t("projects.addAlias")} onClick={() => void addAlias()}><Link aria-hidden="true" size={16} /></button></div>
              {current.paths.filter((path) => path.kind !== "primary").map((path) => <div className="project-command-row" key={path.id}><div><strong title={path.path}>{formatPath(path.path, 48)}</strong><span>{t(pathKeys[path.kind])}</span></div><div className="row-actions"><button type="button" className="icon-button" aria-label={t("projects.makePrimary", { path: path.path })} title={t("projects.makePrimaryTitle")} onClick={() => void updatePath(path.id, "rebind")}><RotateCcw aria-hidden="true" size={16} /></button><button type="button" className="icon-button icon-button--danger" aria-label={t("projects.removePath", { path: path.path })} title={t("projects.removePathTitle")} onClick={() => void updatePath(path.id, "remove")}><Trash2 aria-hidden="true" size={16} /></button></div></div>)}
              <div className="project-command-row"><div><strong>{t("projects.merge")}</strong><span>{t("projects.mergeHint")}</span></div><button type="button" className="icon-button" aria-label={t("projects.merge")} title={t("projects.merge")} disabled={mergeTargets.length === 0} onClick={() => openDialog({ kind: "merge" })}><GitMerge aria-hidden="true" size={16} /></button></div>
              <div className="project-command-row"><div><strong>{t("projects.archive")}</strong><span>{t("projects.archiveHint")}</span></div><button type="button" className="icon-button icon-button--danger" aria-label={t("projects.archive")} title={t("projects.archive")} onClick={() => openDialog({ kind: "archive" })}><Archive aria-hidden="true" size={16} /></button></div>
            </div> : null}
          </> : <div className="workspace-empty workspace-empty--detail">{t("projects.select")}</div>}
        </div>
      </div>

      {dialog ? <div className="dialog-backdrop"><div className="manager-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
        <h3 id="project-dialog-title">{dialog.kind === "add" ? t("projects.add") : dialog.kind === "confirm" ? t("projects.confirm") : dialog.kind === "edit" ? t("projects.edit") : dialog.kind === "merge" ? t("projects.mergeNamed", { name: current?.name || "" }) : t("projects.archiveNamed", { name: current?.name || "" })}</h3>
        {dialog.kind === "add" || dialog.kind === "confirm" || dialog.kind === "edit" ? <div className="dialog-form">
          <label><span>{t("projects.name")}</span><input aria-label={t("projects.name")} value={name} maxLength={200} onChange={(event) => setName(event.target.value)} /></label>
          <label><span>{t("projects.description")}</span><textarea aria-label={t("projects.description")} value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} /></label>
          {dialog.kind === "add" ? <p title={dialog.path}>{formatPath(dialog.path, 58)}</p> : null}
        </div> : null}
        {dialog.kind === "merge" ? <div className="dialog-form"><p>{t("projects.mergeExplanation")}</p><dl className="merge-summary"><div><dt>{t("projects.paths")}</dt><dd>{t((current?.paths.length || 0) === 1 ? "projects.pathCount" : "projects.pathsCount", { count: current?.paths.length || 0 })}</dd></div><div><dt>{t("projects.sessions")}</dt><dd>{t("projects.sessionsCount", { count: sessions.length })}</dd></div><div><dt>{t("projects.events")}</dt><dd>{t("projects.eventsCount", { count: timeline.length })}</dd></div></dl><label><span>{t("projects.target")}</span><select aria-label={t("projects.target")} value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)}>{mergeTargets.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div> : null}
        {dialog.kind === "archive" ? <p>{t("projects.archiveQuestion")}</p> : null}
        <div className="dialog-actions"><button type="button" className="command-button" disabled={busy} onClick={() => setDialog(null)}>{t("projects.cancel")}</button><button type="button" className={`command-button ${dialog.kind === "archive" ? "command-button--danger" : "command-button--accent"}`} disabled={busy || ((dialog.kind === "add" || dialog.kind === "confirm" || dialog.kind === "edit") && !name.trim()) || (dialog.kind === "merge" && !mergeTargetId)} onClick={() => void submitDialog()}>{dialog.kind === "archive" ? t("projects.archive") : dialog.kind === "merge" ? t("projects.merge") : dialog.kind === "edit" ? t("projects.save") : dialog.kind === "confirm" ? t("projects.confirm") : t("projects.add")}</button></div>
      </div></div> : null}
    </section>
  );
}
