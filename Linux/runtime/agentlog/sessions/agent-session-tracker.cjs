"use strict";

const { randomUUID } = require("node:crypto");

const WORKING_STATES = new Set([
  "thinking",
  "working",
  "typing",
  "building",
  "subagent",
  "subagents",
  "compacting",
  "sweeping",
  "worktree",
]);

function isWorkingState(state) {
  return WORKING_STATES.has(String(state || "").toLowerCase());
}

function createAgentSessionTracker(db, { now = Date.now, createId = randomUUID } = {}) {
  if (!db || typeof db.prepare !== "function" || typeof db.transaction !== "function") {
    throw new TypeError("a SQLite database is required");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof createId !== "function") throw new TypeError("createId must be a function");

  const findSession = db.prepare("SELECT * FROM agent_sessions WHERE agent_id = ? AND source_session_id = ?");
  const findById = db.prepare("SELECT * FROM agent_sessions WHERE id = ?");
  const insertSession = db.prepare(
    "INSERT INTO agent_sessions(id, agent_id, source_session_id, parent_source_session_id, project_id, cwd, title, started_at, last_event_at, latest_state, disposition, transcript_path, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)"
  );
  const updateSession = db.prepare(
    "UPDATE agent_sessions SET parent_source_session_id = COALESCE(?, parent_source_session_id), project_id = COALESCE(?, project_id), cwd = COALESCE(?, cwd), title = COALESCE(?, title), ended_at = ?, last_event_at = ?, latest_state = ?, disposition = ?, transcript_path = COALESCE(?, transcript_path), updated_at = ? WHERE id = ?"
  );
  const findOpenInterval = db.prepare("SELECT * FROM agent_active_intervals WHERE agent_session_id = ? AND ended_at IS NULL");
  const insertInterval = db.prepare(
    "INSERT INTO agent_active_intervals(id, agent_session_id, project_id, started_at) VALUES(?, ?, ?, ?)"
  );
  const updateOpenIntervalProject = db.prepare(
    "UPDATE agent_active_intervals SET project_id = COALESCE(?, project_id) WHERE agent_session_id = ? AND ended_at IS NULL"
  );
  const closeOpenInterval = db.prepare(
    "UPDATE agent_active_intervals SET ended_at = ?, close_reason = ? WHERE agent_session_id = ? AND ended_at IS NULL"
  );
  const closeAllIntervals = db.prepare(
    "UPDATE agent_active_intervals SET ended_at = ?, close_reason = 'interrupted' WHERE ended_at IS NULL"
  );
  const interruptSessions = db.prepare(
    "UPDATE agent_sessions SET ended_at = ?, disposition = 'interrupted', updated_at = ? WHERE ended_at IS NULL AND disposition = 'active'"
  );

  function timestamp() {
    return Math.trunc(now());
  }

  function dispositionFor(event) {
    if (event.category === "errored") return "errored";
    if (event.category === "completed" || event.category === "session_ended" || event.type === "SessionEnd") {
      return "completed";
    }
    return "active";
  }

  function isTerminalEvent(event) {
    return event.category === "completed"
      || event.category === "errored"
      || event.category === "session_ended"
      || event.type === "SessionEnd";
  }

  function applyEvent(event, projectId) {
    let session = findSession.get(event.agentId, event.sessionId);
    if (!session) {
      const id = createId();
      const at = timestamp();
      insertSession.run(
        id,
        event.agentId,
        event.sessionId,
        event.parentSessionId,
        projectId || null,
        event.cwd,
        event.payload && event.payload.sessionTitle,
        event.occurredAt,
        event.occurredAt,
        event.state,
        event.transcriptPath,
        at,
        at
      );
      session = findById.get(id);
    }

    if (event.occurredAt < session.last_event_at) return session;

    const disposition = dispositionFor(event);
    if (!isTerminalEvent(event) && isWorkingState(event.state)) {
      if (!findOpenInterval.get(session.id)) {
        insertInterval.run(createId(), session.id, projectId || session.project_id || null, event.occurredAt);
      } else {
        updateOpenIntervalProject.run(projectId || null, session.id);
      }
    } else {
      closeOpenInterval.run(event.occurredAt, event.category, session.id);
    }

    updateSession.run(
      event.parentSessionId,
      projectId || null,
      event.cwd,
      event.payload && event.payload.sessionTitle,
      disposition === "active" ? null : event.occurredAt,
      event.occurredAt,
      event.state,
      disposition,
      event.transcriptPath,
      timestamp(),
      session.id
    );
    return findById.get(session.id);
  }

  const reconcileInterrupted = db.transaction((at) => {
    const timestampAt = Math.trunc(at);
    closeAllIntervals.run(timestampAt);
    interruptSessions.run(timestampAt, timestampAt);
  });

  return { applyEvent, reconcileInterrupted };
}

module.exports = { isWorkingState, createAgentSessionTracker };
