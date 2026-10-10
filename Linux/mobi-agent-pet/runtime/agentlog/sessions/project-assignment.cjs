"use strict";

function createProjectAssignment(db, { now = Date.now } = {}) {
  const findSession = db.prepare("SELECT id FROM agent_sessions WHERE id = ?");
  const findProject = db.prepare("SELECT id FROM projects WHERE id = ?");
  const updateSession = db.prepare("UPDATE agent_sessions SET project_id = ?, project_assignment_source = 'manual', updated_at = ? WHERE id = ?");
  const updateIntervals = db.prepare("UPDATE agent_active_intervals SET project_id = ? WHERE agent_session_id = ?");
  const updateEvents = db.prepare("UPDATE agent_events SET project_id = ? WHERE agent_session_row_id = ?");
  const assign = db.transaction((sessionId, projectId) => {
    if (!findSession.get(sessionId)) return { code: "NOT_FOUND" };
    if (projectId !== null && !findProject.get(projectId)) return { code: "NOT_FOUND" };
    updateSession.run(projectId, now(), sessionId);
    updateIntervals.run(projectId, sessionId);
    updateEvents.run(projectId, sessionId);
    return { sessionId, projectId };
  });
  return { assign };
}

module.exports = { createProjectAssignment };
