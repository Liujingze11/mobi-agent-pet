"use strict";

function createDurableIngestor({ db, projectResolver, sessionTracker, onChange } = {}) {
  if (!db || typeof db.prepare !== "function" || typeof db.transaction !== "function") {
    throw new TypeError("a SQLite database is required");
  }
  if (!projectResolver || typeof projectResolver.resolve !== "function") {
    throw new TypeError("a project resolver is required");
  }
  if (!sessionTracker || typeof sessionTracker.applyEvent !== "function") {
    throw new TypeError("a session tracker is required");
  }
  if (onChange !== undefined && typeof onChange !== "function") {
    throw new TypeError("onChange must be a function");
  }

  const insertEvent = db.prepare(
    "INSERT INTO agent_events(id, schema_version, agent_id, source_event_id, source_sequence, session_id, raw_session_id, parent_session_id, occurred_at, received_at, cwd, type, category, state, tool_name, transcript_path, permission_json, payload_json) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const attachProjection = db.prepare(
    "UPDATE agent_events SET project_id = ?, agent_session_row_id = ? WHERE id = ?"
  );

  const ingestTransaction = db.transaction((event) => {
    insertEvent.run(
      event.id,
      event.schemaVersion,
      event.agentId,
      event.sourceEventId,
      event.sourceSequence,
      event.sessionId,
      event.rawSessionId,
      event.parentSessionId,
      event.occurredAt,
      event.receivedAt,
      event.cwd,
      event.type,
      event.category,
      event.state,
      event.toolName,
      event.transcriptPath,
      event.permission ? JSON.stringify(event.permission) : null,
      JSON.stringify(event.payload || {})
    );
    const resolved = projectResolver.resolve({ cwd: event.cwd });
    const projectId = resolved.project && resolved.project.id;
    const session = sessionTracker.applyEvent(event, projectId);
    attachProjection.run(projectId || null, session.id, event.id);
    return { inserted: true, eventId: event.id, projectId: projectId || null, sessionId: session.id };
  });

  function isEventIdPrimaryKeyConflict(error) {
    return error
      && error.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
      && error.message === "UNIQUE constraint failed: agent_events.id";
  }

  function ingest(event) {
    let result;
    try {
      result = ingestTransaction(event);
    } catch (error) {
      if (!isEventIdPrimaryKeyConflict(error)) throw error;
      result = { inserted: false, eventId: event.id };
    }
    if (result.inserted && onChange) onChange(result);
    return result;
  }

  return { ingest };
}

module.exports = { createDurableIngestor };
