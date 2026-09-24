"use strict";

const {
  sumIntervalDuration,
  unionIntervalDuration,
} = require("../time/intervals.cjs");

function createOverviewQueries(db, { now = Date.now } = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("a SQLite database is required");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");

  const selectProject = db.prepare(
    "SELECT * FROM projects WHERE id = ? AND (? = 1 OR lifecycle = 'active')"
  );
  const selectProjectPaths = db.prepare(
    "SELECT * FROM project_paths WHERE project_id = ? ORDER BY CASE kind WHEN 'primary' THEN 0 WHEN 'alias' THEN 1 ELSE 2 END, created_at ASC, id ASC"
  );
  const selectProjects = db.prepare(
    "SELECT * FROM projects WHERE (? = 1 OR lifecycle = 'active') AND (? IS NULL OR created_source = ?) AND (? IS NULL OR confirmation = ?) AND (? IS NULL OR lifecycle = ?) ORDER BY CASE lifecycle WHEN 'active' THEN 0 ELSE 1 END, CASE confirmation WHEN 'pending' THEN 0 ELSE 1 END, updated_at DESC, id ASC"
  );
  const selectPendingProjectCount = db.prepare(
    "SELECT COUNT(*) AS count FROM projects WHERE lifecycle = 'active' AND confirmation = 'pending'"
  );
  const selectAgentIntervals = db.prepare(
    "SELECT i.started_at, i.ended_at FROM agent_active_intervals i LEFT JOIN projects p ON p.id = i.project_id WHERE i.project_id IS NULL OR p.lifecycle = 'active'"
  );
  const selectProjectAgentIntervals = db.prepare(
    "SELECT started_at, ended_at FROM agent_active_intervals WHERE project_id = ?"
  );
  const selectActiveAgentSessions = db.prepare(
    "SELECT s.*, p.name AS project_name FROM agent_sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.disposition = 'active' AND (s.project_id IS NULL OR p.lifecycle = 'active') ORDER BY s.last_event_at DESC, s.id ASC"
  );
  const selectAgentSessions = db.prepare(
    "SELECT s.*, p.name AS project_name FROM agent_sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE (? = 1 OR s.project_id IS NULL OR p.lifecycle = 'active') AND (? IS NULL OR s.project_id = ?) AND (? IS NULL OR s.disposition = ?) AND (? IS NULL OR s.agent_id = ?) ORDER BY s.last_event_at DESC, s.id ASC"
  );
  const selectHumanSessions = db.prepare(
    "SELECT h.*, p.name AS project_name FROM human_sessions h JOIN projects p ON p.id = h.project_id WHERE (? = 1 OR p.lifecycle = 'active') AND (? IS NULL OR h.project_id = ?) AND (? IS NULL OR h.status = ?) ORDER BY h.updated_at DESC, h.id ASC"
  );
  const selectHumanTimer = db.prepare(
    "SELECT h.*, p.name AS project_name FROM human_sessions h JOIN projects p ON p.id = h.project_id WHERE h.status IN ('running', 'paused') AND p.lifecycle = 'active' ORDER BY h.updated_at DESC, h.id ASC LIMIT 1"
  );
  const selectHumanSessionsForOverview = db.prepare(
    "SELECT h.*, p.name AS project_name FROM human_sessions h JOIN projects p ON p.id = h.project_id WHERE p.lifecycle = 'active'"
  );
  const selectHumanSessionsForProject = db.prepare(
    "SELECT h.*, p.name AS project_name FROM human_sessions h JOIN projects p ON p.id = h.project_id WHERE h.project_id = ?"
  );
  const selectHumanPauseIntervals = db.prepare(
    "SELECT started_at, ended_at FROM human_pause_intervals WHERE human_session_id = ? ORDER BY started_at ASC, id ASC"
  );
  const selectRecentActivity = db.prepare(
    "SELECT e.*, p.name AS project_name FROM agent_events e LEFT JOIN projects p ON p.id = e.project_id WHERE e.project_id IS NULL OR p.lifecycle = 'active' ORDER BY e.occurred_at DESC, e.id DESC LIMIT ?"
  );
  const selectProjectTimeline = db.prepare(
    "SELECT e.*, p.name AS project_name FROM agent_events e JOIN projects p ON p.id = e.project_id WHERE e.project_id = ? AND (? IS NULL OR e.agent_id = ?) AND (? IS NULL OR e.category = ?) AND (? IS NULL OR e.type = ?) ORDER BY e.occurred_at DESC, e.id DESC LIMIT ?"
  );
  const selectSessionIntervals = db.prepare(
    "SELECT started_at, ended_at FROM agent_active_intervals WHERE agent_session_id = ?"
  );

  function timestamp() {
    const value = Math.trunc(now());
    if (!Number.isFinite(value)) throw new TypeError("now must return a finite timestamp");
    return value;
  }

  function localDayRange(at) {
    const start = new Date(at);
    start.setHours(0, 0, 0, 0);
    return { start: start.getTime(), end: at };
  }

  function mapPath(row) {
    return {
      id: row.id,
      projectId: row.project_id,
      path: row.path,
      canonicalPath: row.canonical_path,
      kind: row.kind,
      isAvailable: Boolean(row.is_available),
      gitRoot: row.git_root,
      gitRemoteIdentity: row.git_remote_identity,
      gitBranch: row.git_branch,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapProject(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      lifecycle: row.lifecycle,
      confirmation: row.confirmation,
      createdSource: row.created_source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      paths: selectProjectPaths.all(row.id).map(mapPath),
    };
  }

  function mapIntervals(rows) {
    return rows.map((row) => ({ startedAt: row.started_at, endedAt: row.ended_at }));
  }

  function humanEffectiveMs(row, at, range) {
    if (!Number.isFinite(row.started_at)) return 0;
    const nominalEnd = row.status === "paused"
      ? row.paused_at
      : (row.ended_at == null ? at : row.ended_at);
    if (!Number.isFinite(nominalEnd)) return 0;
    const start = range ? Math.max(range.start, row.started_at) : row.started_at;
    const end = range ? Math.min(range.end, nominalEnd) : nominalEnd;
    const elapsedMs = Math.max(0, end - start);
    const pausedMs = unionIntervalDuration(
      mapIntervals(selectHumanPauseIntervals.all(row.id)),
      { start, end }
    );
    return Math.max(0, elapsedMs - pausedMs);
  }

  function mapAgentSession(row, at) {
    const activeMs = sumIntervalDuration(mapIntervals(selectSessionIntervals.all(row.id)), { end: at });
    return {
      id: row.id,
      source: "agent",
      agentId: row.agent_id,
      sourceSessionId: row.source_session_id,
      parentSourceSessionId: row.parent_source_session_id,
      projectId: row.project_id,
      projectName: row.project_name || null,
      cwd: row.cwd,
      title: row.title,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      lastEventAt: row.last_event_at,
      latestState: row.latest_state,
      disposition: row.disposition,
      transcriptPath: row.transcript_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      activeMs,
    };
  }

  function mapHumanSession(row, at, range) {
    return {
      id: row.id,
      source: "human",
      projectId: row.project_id,
      projectName: row.project_name || null,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      pausedAt: row.paused_at,
      accumulatedPauseMs: row.accumulated_pause_ms,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      effectiveMs: humanEffectiveMs(row, at, range),
    };
  }

  function parseJson(value, fallback) {
    if (typeof value !== "string") return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function mapEvent(row) {
    return {
      id: row.id,
      schemaVersion: row.schema_version,
      agentId: row.agent_id,
      sourceEventId: row.source_event_id,
      sourceSequence: row.source_sequence,
      sessionId: row.session_id,
      rawSessionId: row.raw_session_id,
      parentSessionId: row.parent_session_id,
      projectId: row.project_id,
      projectName: row.project_name || null,
      agentSessionRowId: row.agent_session_row_id,
      occurredAt: row.occurred_at,
      receivedAt: row.received_at,
      cwd: row.cwd,
      type: row.type,
      category: row.category,
      state: row.state,
      toolName: row.tool_name,
      transcriptPath: row.transcript_path,
      permission: parseJson(row.permission_json, null),
      payload: parseJson(row.payload_json, {}),
    };
  }

  function boundedLimit(value, fallback = 100) {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(500, Math.trunc(value)));
  }

  function projectFilters(filters = {}) {
    const status = filters.status;
    const source = filters.createdSource ?? filters.source ?? null;
    const confirmation = filters.confirmation ?? (status === "pending" || status === "confirmed" ? status : null);
    const lifecycle = filters.lifecycle ?? (status === "active" || status === "archived" ? status : null);
    return { source, confirmation, lifecycle };
  }

  function durationSummary(intervalRows, humanRows, range, at) {
    const intervals = mapIntervals(intervalRows);
    return {
      agentSessionMs: sumIntervalDuration(intervals, range),
      agentActiveMs: unionIntervalDuration(intervals, range),
      humanMs: humanRows.reduce((total, row) => total + humanEffectiveMs(row, at, range), 0),
    };
  }

  function getOverview() {
    const at = timestamp();
    const range = localDayRange(at);
    return {
      pendingProjectCount: selectPendingProjectCount.get().count,
      activeAgentSessions: selectActiveAgentSessions.all().map((row) => mapAgentSession(row, at)),
      humanTimer: (() => {
        const row = selectHumanTimer.get();
        return row ? mapHumanSession(row, at) : null;
      })(),
      today: durationSummary(
        selectAgentIntervals.all(),
        selectHumanSessionsForOverview.all(),
        range,
        at
      ),
      recentActivity: selectRecentActivity.all(20).map(mapEvent),
    };
  }

  function listProjects(filters = {}) {
    const { source, confirmation, lifecycle } = projectFilters(filters);
    return selectProjects.all(
      Number(Boolean(filters.includeArchived)),
      source,
      source,
      confirmation,
      confirmation,
      lifecycle,
      lifecycle
    ).map(mapProject);
  }

  function getProjectDetail(projectId, { includeArchived = false } = {}) {
    const project = mapProject(selectProject.get(projectId, Number(Boolean(includeArchived))));
    if (!project) return null;
    const at = timestamp();
    project.today = durationSummary(
      selectProjectAgentIntervals.all(project.id),
      selectHumanSessionsForProject.all(project.id),
      localDayRange(at),
      at
    );
    return project;
  }

  function listSessions(filters = {}) {
    const at = timestamp();
    const includeArchived = Number(Boolean(filters.includeArchived));
    const source = filters.source;
    const agentRows = source === undefined || source === "agent"
      ? selectAgentSessions.all(
        includeArchived,
        filters.projectId || null,
        filters.projectId || null,
        filters.status || null,
        filters.status || null,
        filters.agentId || null,
        filters.agentId || null
      ).map((row) => mapAgentSession(row, at))
      : [];
    const humanRows = source === undefined || source === "human"
      ? selectHumanSessions.all(
        includeArchived,
        filters.projectId || null,
        filters.projectId || null,
        filters.status || null,
        filters.status || null
      ).map((row) => mapHumanSession(row, at))
      : [];

    return [...agentRows, ...humanRows]
      .sort((left, right) => {
        const leftAt = left.source === "agent" ? left.lastEventAt : left.updatedAt;
        const rightAt = right.source === "agent" ? right.lastEventAt : right.updatedAt;
        return rightAt - leftAt || left.id.localeCompare(right.id);
      })
      .slice(0, boundedLimit(filters.limit));
  }

  function getProjectTimeline(projectId, filters = {}) {
    if (!getProjectDetail(projectId, { includeArchived: Boolean(filters.includeArchived) })) return [];
    return selectProjectTimeline.all(
      projectId,
      filters.agentId || null,
      filters.agentId || null,
      filters.category || null,
      filters.category || null,
      filters.type || null,
      filters.type || null,
      boundedLimit(filters.limit)
    ).map(mapEvent);
  }

  return {
    getOverview,
    listProjects,
    getProjectDetail,
    listSessions,
    getProjectTimeline,
  };
}

module.exports = { createOverviewQueries };
