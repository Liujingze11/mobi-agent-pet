"use strict";

function createHumanTimer({ db, now = Date.now, createId, projectRepository, onChange } = {}) {
  if (!db || typeof db.prepare !== "function" || typeof db.transaction !== "function") {
    throw new TypeError("a SQLite database is required");
  }
  if (!projectRepository || typeof projectRepository.get !== "function") {
    throw new TypeError("a project repository is required");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof createId !== "function") throw new TypeError("createId is required");
  if (onChange !== undefined && typeof onChange !== "function") {
    throw new TypeError("onChange must be a function");
  }

  const selectActive = db.prepare(
    "SELECT * FROM human_sessions WHERE status IN ('running', 'paused') LIMIT 1"
  );
  const selectSession = db.prepare("SELECT * FROM human_sessions WHERE id = ?");
  const selectOpenPause = db.prepare(
    "SELECT * FROM human_pause_intervals WHERE human_session_id = ? AND ended_at IS NULL"
  );
  const insertSession = db.prepare(
    "INSERT INTO human_sessions(id, project_id, status, started_at, ended_at, paused_at, accumulated_pause_ms, notes, created_at, updated_at) VALUES(?, ?, 'running', ?, NULL, NULL, 0, '', ?, ?)"
  );
  const insertPause = db.prepare(
    "INSERT INTO human_pause_intervals(id, human_session_id, started_at, ended_at) VALUES(?, ?, ?, NULL)"
  );
  const markPaused = db.prepare(
    "UPDATE human_sessions SET status = 'paused', paused_at = ?, updated_at = ? WHERE id = ?"
  );
  const closePause = db.prepare("UPDATE human_pause_intervals SET ended_at = ? WHERE id = ?");
  const deletePause = db.prepare("DELETE FROM human_pause_intervals WHERE id = ?");
  const markResumed = db.prepare(
    "UPDATE human_sessions SET status = 'running', paused_at = NULL, accumulated_pause_ms = accumulated_pause_ms + ?, updated_at = ? WHERE id = ?"
  );
  const markCompleted = db.prepare(
    "UPDATE human_sessions SET status = 'completed', ended_at = ?, paused_at = NULL, accumulated_pause_ms = accumulated_pause_ms + ?, notes = ?, updated_at = ? WHERE id = ?"
  );

  function timestamp() {
    const value = Math.trunc(now());
    if (!Number.isFinite(value)) throw new TypeError("now must return a finite timestamp");
    return value;
  }

  function transitionAt(session, at) {
    return Math.max(at, session.startedAt, session.updatedAt || session.startedAt);
  }

  function mapState(row, at) {
    if (!row) return null;
    const end = row.status === "running"
      ? Math.max(at, row.started_at, row.updated_at || row.started_at)
      : (row.status === "paused" ? row.paused_at : row.ended_at);
    const elapsedMs = Math.max(0, end - row.started_at);
    const effectiveMs = Math.max(0, elapsedMs - row.accumulated_pause_ms);
    const project = projectRepository.get(row.project_id);
    return {
      id: row.id,
      source: "human",
      projectId: row.project_id,
      projectName: project ? project.name : null,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      pausedAt: row.paused_at,
      accumulatedPauseMs: row.accumulated_pause_ms,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      elapsedMs,
      effectiveMs,
    };
  }

  function getState() {
    return mapState(selectActive.get(), timestamp());
  }

  function error(code, state = getState()) {
    return { code, state };
  }

  const startTransaction = db.transaction((id, projectId, at) => {
    insertSession.run(id, projectId, at, at, at);
  });
  const pauseTransaction = db.transaction((id, at) => {
    insertPause.run(createId(), id, at);
    markPaused.run(at, at, id);
  });
  const resumeTransaction = db.transaction((id, at) => {
    const pause = selectOpenPause.get(id);
    if (!pause) throw new Error("active pause interval not found");
    const pauseMs = Math.max(0, at - pause.started_at);
    if (at > pause.started_at) closePause.run(at, pause.id);
    else deletePause.run(pause.id);
    markResumed.run(pauseMs, at, id);
  });
  const stopTransaction = db.transaction((id, at, notes) => {
    const pause = selectOpenPause.get(id);
    const pauseMs = pause ? Math.max(0, at - pause.started_at) : 0;
    if (pause) {
      if (at > pause.started_at) closePause.run(at, pause.id);
      else deletePause.run(pause.id);
    }
    markCompleted.run(at, pauseMs, notes, at, id);
  });

  function publish(state) {
    if (onChange) onChange(state);
    return state;
  }

  function start(projectId) {
    const active = getState();
    if (active) return error("TIMER_ALREADY_ACTIVE", active);
    const project = projectRepository.get(projectId);
    if (!project) return error("PROJECT_NOT_FOUND", null);
    if (project.lifecycle !== "active") return error("PROJECT_ARCHIVED", null);
    const at = timestamp();
    const id = createId();
    startTransaction(id, project.id, at);
    return publish(getState());
  }

  function pause() {
    const active = getState();
    if (!active || active.status !== "running") return error("TIMER_NOT_RUNNING", active);
    pauseTransaction(active.id, transitionAt(active, timestamp()));
    return publish(getState());
  }

  function resume() {
    const active = getState();
    if (!active || active.status !== "paused") return error("TIMER_NOT_PAUSED", active);
    resumeTransaction(active.id, transitionAt(active, timestamp()));
    return publish(getState());
  }

  function stop({ notes = "" } = {}) {
    const active = getState();
    if (!active) return error("TIMER_NOT_ACTIVE", null);
    if (typeof notes !== "string") throw new TypeError("notes must be a string");
    const at = transitionAt(active, timestamp());
    stopTransaction(active.id, at, notes);
    return publish(mapState(selectSession.get(active.id), at));
  }

  return { getState, start, pause, resume, stop };
}

module.exports = { createHumanTimer };
