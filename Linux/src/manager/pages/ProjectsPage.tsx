import { Archive, Check, FolderPlus, GitMerge, Link, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { formatDuration, formatPath, sortProjects } from "../model.mjs";
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

function basename(path: string) {
  return path.split(/[\\/]+/).filter(Boolean).at(-1) || "New project";
}

function projectStatus(project: ProjectSummary) {
  return project.confirmation === "pending" ? "Pending confirmation" : project.lifecycle;
}

function eventName(event: ActivityEvent) {
  return event.toolName || event.type || "Activity";
}

function sessionName(session: SessionSummary) {
  return session.source === "agent" ? session.title || `${session.agentId} session` : session.notes || "Human work session";
}

export function ProjectsPage({ projectApi, projects: initialProjects, sessionApi }: ProjectsPageProps) {
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
      if (active) setError("Unable to load project details.");
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
    setName(next.kind === "add" ? basename(next.path) : current?.name || "");
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
      setError("Unable to select a project folder.");
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
      setError("The project operation could not be completed.");
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
      setError("Unable to add the selected path.");
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
      setError("Unable to update this project path.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="projects-workspace" aria-labelledby="projects-title">
      <div className="workspace__heading projects-heading">
        <div><p className="eyebrow">Register</p><h2 id="projects-title">Projects</h2></div>
        <button type="button" className="command-button" onClick={() => void addProject()}><FolderPlus aria-hidden="true" size={15} />Add project</button>
      </div>
      {error ? <p className="inline-alert inline-alert--error" role="alert">{error}</p> : null}

      <div className="projects-layout">
        <aside className="project-list" aria-label="Project list">
          {projects.length > 0 ? projects.map((project) => (
            <button key={project.id} type="button" aria-label={`Open project ${project.name}`} aria-current={selectedId === project.id || undefined} onClick={() => { setSelectedId(project.id); setTab("overview"); }}>
              <span><strong>{project.name}</strong><small title={project.paths[0]?.path}>{formatPath(project.paths[0]?.path, 31)}</small></span>
              <span className={`record-state record-state--${project.confirmation}`}>{projectStatus(project)}</span>
            </button>
          )) : <div className="workspace-empty">No projects recorded.</div>}
        </aside>

        <div className="project-detail">
          {current ? <>
            <header className="project-detail__header">
              <div><h2>{current.name}</h2><p>{current.description || "No description"}</p></div>
              {current.confirmation === "pending" ? <button type="button" className="command-button command-button--accent" onClick={() => openDialog({ kind: "confirm" })}><Check aria-hidden="true" size={15} />Confirm project</button> : null}
            </header>
            {current.confirmation === "pending" ? <p className="pending-notice">Pending confirmation</p> : null}
            <div className="detail-tabs" role="tablist" aria-label="Project details">
              {(["overview", "activity", "sessions", "settings"] as ProjectTab[]).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
            </div>

            {tab === "overview" ? <div className="project-tab project-overview">
              <dl className="project-time-band">
                <div><dt>Agent session time</dt><dd>{formatDuration(detail?.today?.agentSessionMs || 0)}</dd></div>
                <div><dt>Agent active time</dt><dd>{formatDuration(detail?.today?.agentActiveMs || 0)}</dd></div>
                <div><dt>Human time</dt><dd>{formatDuration(detail?.today?.humanMs || 0)}</dd></div>
              </dl>
              <div className="path-list"><div className="section-heading"><h3>Paths</h3><span>{current.paths.length}</span></div>{current.paths.map((path) => <div className="path-row" key={path.id}>
                <span className={`path-health path-health--${path.isAvailable ? "ready" : "missing"}`} title={path.isAvailable ? "Path available" : "Path unavailable"} />
                <div><strong title={path.path}>{formatPath(path.path, 54)}</strong><span>{path.kind} / {path.gitBranch || "no branch"} / {path.gitRemoteIdentity || "no remote"}</span></div>
              </div>)}</div>
            </div> : null}

            {tab === "activity" ? <div className="project-tab"><div className="section-heading"><h3>Activity</h3><span>{timeline.length}</span></div>{timeline.length > 0 ? <ol className="project-activity">{timeline.map((event) => <li key={event.id}><time>{new Date(event.occurredAt).toLocaleString()}</time><strong>{eventName(event)}</strong><span>{event.agentId} / {event.state || "activity"}</span></li>)}</ol> : <div className="workspace-empty">No project activity recorded.</div>}</div> : null}

            {tab === "sessions" ? <div className="project-tab"><div className="section-heading"><h3>Sessions</h3><span>{sessions.length}</span></div>{sessions.length > 0 ? <ul className="project-sessions">{sessions.map((session) => <li key={session.id}><strong>{sessionName(session)}</strong><span>{session.source} / {session.source === "agent" ? session.disposition : session.status}</span></li>)}</ul> : <div className="workspace-empty">No project sessions recorded.</div>}</div> : null}

            {tab === "settings" ? <div className="project-tab project-settings">
              <div className="project-command-row"><div><strong>Project details</strong><span>Update the display name and description.</span></div><button type="button" className="icon-button" aria-label="Edit project" title="Edit project" onClick={() => openDialog({ kind: "edit" })}><Pencil aria-hidden="true" size={16} /></button></div>
              <div className="project-command-row"><div><strong>Alias path</strong><span>Attach another folder to this project.</span></div><button type="button" className="icon-button" aria-label="Add alias path" title="Add alias path" onClick={() => void addAlias()}><Link aria-hidden="true" size={16} /></button></div>
              {current.paths.filter((path) => path.kind !== "primary").map((path) => <div className="project-command-row" key={path.id}><div><strong title={path.path}>{formatPath(path.path, 48)}</strong><span>{path.kind}</span></div><div className="row-actions"><button type="button" className="icon-button" aria-label={`Make primary ${path.path}`} title="Make primary" onClick={() => void updatePath(path.id, "rebind")}><RotateCcw aria-hidden="true" size={16} /></button><button type="button" className="icon-button icon-button--danger" aria-label={`Remove path ${path.path}`} title="Remove path" onClick={() => void updatePath(path.id, "remove")}><Trash2 aria-hidden="true" size={16} /></button></div></div>)}
              <div className="project-command-row"><div><strong>Merge project</strong><span>Move paths, sessions, events, and recorded time to another confirmed project.</span></div><button type="button" className="icon-button" aria-label="Merge project" title="Merge project" disabled={mergeTargets.length === 0} onClick={() => openDialog({ kind: "merge" })}><GitMerge aria-hidden="true" size={16} /></button></div>
              <div className="project-command-row"><div><strong>Archive project</strong><span>Hide this project from active views while preserving history.</span></div><button type="button" className="icon-button icon-button--danger" aria-label="Archive project" title="Archive project" onClick={() => openDialog({ kind: "archive" })}><Archive aria-hidden="true" size={16} /></button></div>
            </div> : null}
          </> : <div className="workspace-empty workspace-empty--detail">Select or add a project.</div>}
        </div>
      </div>

      {dialog ? <div className="dialog-backdrop"><div className="manager-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
        <h3 id="project-dialog-title">{dialog.kind === "add" ? "Add project" : dialog.kind === "confirm" ? "Confirm project" : dialog.kind === "edit" ? "Edit project" : dialog.kind === "merge" ? `Merge ${current?.name}` : `Archive ${current?.name}`}</h3>
        {dialog.kind === "add" || dialog.kind === "confirm" || dialog.kind === "edit" ? <div className="dialog-form">
          <label><span>Project name</span><input aria-label="Project name" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} /></label>
          <label><span>Description</span><textarea aria-label="Description" value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} /></label>
          {dialog.kind === "add" ? <p title={dialog.path}>{formatPath(dialog.path, 58)}</p> : null}
        </div> : null}
        {dialog.kind === "merge" ? <div className="dialog-form"><p>Paths, sessions, events, and recorded time will move to the selected project.</p><dl className="merge-summary"><div><dt>Paths</dt><dd>{current?.paths.length || 0} {(current?.paths.length || 0) === 1 ? "path" : "paths"}</dd></div><div><dt>Sessions</dt><dd>{sessions.length} sessions</dd></div><div><dt>Events</dt><dd>{timeline.length} events</dd></div></dl><label><span>Target project</span><select aria-label="Target project" value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)}>{mergeTargets.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div> : null}
        {dialog.kind === "archive" ? <p>Archive this project? Its history remains available in archived records.</p> : null}
        <div className="dialog-actions"><button type="button" className="command-button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button type="button" className={`command-button ${dialog.kind === "archive" ? "command-button--danger" : "command-button--accent"}`} disabled={busy || ((dialog.kind === "add" || dialog.kind === "confirm" || dialog.kind === "edit") && !name.trim()) || (dialog.kind === "merge" && !mergeTargetId)} onClick={() => void submitDialog()}>{dialog.kind === "archive" ? "Archive project" : dialog.kind === "merge" ? "Merge project" : dialog.kind === "edit" ? "Save changes" : dialog.kind === "confirm" ? "Confirm project" : "Add project"}</button></div>
      </div></div> : null}
    </section>
  );
}
