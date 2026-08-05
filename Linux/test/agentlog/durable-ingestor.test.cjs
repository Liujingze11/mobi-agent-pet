"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  closeAgentLogDatabase,
  openAgentLogDatabase,
} = require("../../runtime/agentlog/storage/database.cjs");
const { normalizeAgentEvent } = require("../../runtime/agentlog/events/normalized-event.cjs");
const { createProjectRepository } = require("../../runtime/agentlog/projects/project-repository.cjs");
const { createProjectResolver } = require("../../runtime/agentlog/projects/project-resolver.cjs");
const {
  createAgentSessionTracker,
  isWorkingState,
} = require("../../runtime/agentlog/sessions/agent-session-tracker.cjs");
const { createDurableIngestor } = require("../../runtime/agentlog/events/durable-ingestor.cjs");

function createHarness(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-durable-ingestor-"));
  const db = openAgentLogDatabase({ databasePath: path.join(tmp, "agentlog.db") });
  let nextId = 0;
  const repository = createProjectRepository(db, {
    now: () => 1_800_000_000_000,
    createId: () => `project-${++nextId}`,
  });
  const projectResolver = createProjectResolver({ repository });
  const sessionTracker = createAgentSessionTracker(db, {
    now: () => 1_800_000_000_000,
    createId: () => `session-${++nextId}`,
  });
  const ingestor = createDurableIngestor({ db, projectResolver, sessionTracker });
  t.after(() => {
    closeAgentLogDatabase(db);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  return { db, ingestor, projectResolver, sessionTracker, tmp };
}

function fixture(overrides = {}) {
  const { opts = {}, ...input } = overrides;
  return {
    sessionId: "codex-session-1",
    state: "thinking",
    event: "UserPromptSubmit",
    opts: {
      agentId: "codex",
      sourceEventId: "event-1",
      timestamp: 1_800_000_000_100,
      ...opts,
    },
    ...input,
  };
}

function row(db, table, id) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

function openIntervals(db, sessionId) {
  return db.prepare("SELECT * FROM agent_active_intervals WHERE agent_session_id = ? AND ended_at IS NULL").all(sessionId);
}

test("the first unknown-directory event persists before creating its pending project projection", (t) => {
  const { db, ingestor, tmp } = createHarness(t);
  const unknownDir = path.join(tmp, "unknown");
  fs.mkdirSync(unknownDir);
  const event = normalizeAgentEvent(fixture({ opts: { cwd: unknownDir, sourceEventId: "first" } }));

  const result = ingestor.ingest(event);

  assert.equal(result.inserted, true);
  assert.equal(row(db, "agent_events", event.id).project_id, result.projectId);
  assert.equal(row(db, "projects", result.projectId).confirmation, "pending");
  assert.equal(openIntervals(db, result.sessionId).length, 1);
});

test("the event row exists without projections when resolution begins", (t) => {
  const { db, projectResolver, sessionTracker, tmp } = createHarness(t);
  const cwd = path.join(tmp, "ordered");
  fs.mkdirSync(cwd);
  const event = normalizeAgentEvent(fixture({ opts: { cwd, sourceEventId: "ordered", timestamp: 100 } }));
  const resolve = projectResolver.resolve;
  projectResolver.resolve = (input) => {
    const persisted = row(db, "agent_events", event.id);
    assert.ok(persisted);
    assert.equal(persisted.project_id, null);
    assert.equal(persisted.agent_session_row_id, null);
    return resolve(input);
  };
  const ingestor = createDurableIngestor({ db, projectResolver, sessionTracker });

  ingestor.ingest(event);
});

test("working-state classification follows the normalized state contract", () => {
  for (const state of ["thinking", "working", "typing", "building", "subagent", "subagents", "compacting", "sweeping", "worktree"]) {
    assert.equal(isWorkingState(state.toUpperCase()), true, state);
  }
  assert.equal(isWorkingState("attention"), false);
  assert.equal(isWorkingState(null), false);
});

test("SessionEnd completes a sweeping session and closes its working interval", (t) => {
  const { db, ingestor } = createHarness(t);
  const started = normalizeAgentEvent(fixture({
    state: "working",
    event: "PreToolUse",
    opts: { sourceEventId: "working", timestamp: 100 },
  }));
  const ended = normalizeAgentEvent(fixture({
    state: "sweeping",
    event: "SessionEnd",
    opts: { sourceEventId: "ended", timestamp: 200 },
  }));

  const startedResult = ingestor.ingest(started);
  ingestor.ingest(ended);

  assert.equal(openIntervals(db, startedResult.sessionId).length, 0);
  const session = row(db, "agent_sessions", startedResult.sessionId);
  assert.equal(session.disposition, "completed");
  assert.equal(session.ended_at, 200);
});

test("start, working, permission, and completion project one active interval at a time", (t) => {
  const { db, ingestor, tmp } = createHarness(t);
  const cwd = path.join(tmp, "lifecycle");
  fs.mkdirSync(cwd);
  const start = normalizeAgentEvent(fixture({
    state: "idle", event: "SessionStart", opts: { cwd, sourceEventId: "start", timestamp: 100 },
  }));
  const working = normalizeAgentEvent(fixture({
    state: "working", event: "PreToolUse", opts: { cwd, sourceEventId: "working", timestamp: 200 },
  }));
  const permission = normalizeAgentEvent(fixture({
    state: "notification", event: "CodexUserInputRequest", opts: {
      cwd, sourceEventId: "permission", timestamp: 300, permissionAction: "ask", permissionCommand: "npm test",
    },
  }));
  const complete = normalizeAgentEvent(fixture({
    state: "attention", event: "Stop", opts: { cwd, sourceEventId: "complete", timestamp: 400 },
  }));

  const result = ingestor.ingest(start);
  assert.equal(openIntervals(db, result.sessionId).length, 0);
  ingestor.ingest(working);
  assert.equal(openIntervals(db, result.sessionId).length, 1);
  ingestor.ingest(permission);
  assert.equal(openIntervals(db, result.sessionId).length, 0);
  assert.equal(db.prepare("SELECT close_reason FROM agent_active_intervals WHERE agent_session_id = ?").get(result.sessionId).close_reason, "permission_requested");
  ingestor.ingest(complete);
  const session = row(db, "agent_sessions", result.sessionId);
  assert.equal(session.disposition, "completed");
  assert.equal(session.ended_at, 400);
  assert.deepEqual(JSON.parse(row(db, "agent_events", permission.id).permission_json), {
    action: "ask", command: "npm test", gateId: null,
  });
});

test("an error closes activity and marks the session errored", (t) => {
  const { db, ingestor } = createHarness(t);
  const working = normalizeAgentEvent(fixture({
    state: "working", event: "PreToolUse", opts: { sourceEventId: "working", timestamp: 100 },
  }));
  const failed = normalizeAgentEvent(fixture({
    state: "error", event: "PostToolUseFailure", opts: { sourceEventId: "failed", timestamp: 200 },
  }));

  const result = ingestor.ingest(working);
  ingestor.ingest(failed);

  assert.equal(openIntervals(db, result.sessionId).length, 0);
  assert.equal(row(db, "agent_sessions", result.sessionId).disposition, "errored");
  assert.equal(row(db, "agent_sessions", result.sessionId).ended_at, 200);
});

test("a sequential duplicate is a primary-key no-op for rows, intervals, and change notifications", (t) => {
  const { db, projectResolver, sessionTracker } = createHarness(t);
  const changes = [];
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    assert.notEqual(sql, "SELECT id FROM agent_events WHERE id = ?", "duplicates must use the primary-key constraint");
    return prepare(sql);
  };
  const ingestor = createDurableIngestor({
    db, projectResolver, sessionTracker, onChange: (result) => changes.push(result),
  });
  const event = normalizeAgentEvent(fixture({
    state: "working", event: "PreToolUse", opts: { sourceEventId: "duplicate", timestamp: 100 },
  }));

  assert.equal(ingestor.ingest(event).inserted, true);
  assert.equal(ingestor.ingest(event).inserted, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM agent_events").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM agent_active_intervals").get().count, 1);
  assert.equal(changes.length, 1);
});

test("an event without cwd remains unprojected while retaining its session projection", (t) => {
  const { db, ingestor } = createHarness(t);
  const event = normalizeAgentEvent(fixture({
    state: "thinking", event: "UserPromptSubmit", opts: { sourceEventId: "no-cwd", timestamp: 100 },
  }));

  const result = ingestor.ingest(event);

  assert.equal(result.projectId, null);
  assert.equal(row(db, "agent_events", event.id).project_id, null);
  assert.equal(row(db, "agent_sessions", result.sessionId).project_id, null);
  assert.equal(openIntervals(db, result.sessionId).length, 1);
});

test("parent and transcript metadata are retained on both event and session projections", (t) => {
  const { db, ingestor } = createHarness(t);
  const event = normalizeAgentEvent(fixture({
    opts: {
      sourceEventId: "metadata", timestamp: 100, parentSessionId: "parent-1",
      transcriptPath: "/tmp/codex-transcript.jsonl", sessionTitle: "Fix durable storage",
    },
  }));

  const result = ingestor.ingest(event);

  const session = row(db, "agent_sessions", result.sessionId);
  assert.equal(session.parent_source_session_id, "parent-1");
  assert.equal(session.transcript_path, "/tmp/codex-transcript.jsonl");
  assert.equal(session.title, "Fix durable storage");
  assert.equal(row(db, "agent_events", event.id).parent_session_id, "parent-1");
  assert.equal(row(db, "agent_events", event.id).transcript_path, "/tmp/codex-transcript.jsonl");
});

test("a late event persists but cannot move the session projection backward", (t) => {
  const { db, ingestor } = createHarness(t);
  const current = normalizeAgentEvent(fixture({
    state: "working", event: "PreToolUse", opts: { sourceEventId: "current", timestamp: 200 },
  }));
  const late = normalizeAgentEvent(fixture({
    state: "attention", event: "Stop", opts: { sourceEventId: "late", timestamp: 100 },
  }));

  const result = ingestor.ingest(current);
  ingestor.ingest(late);

  assert.ok(row(db, "agent_events", late.id));
  const session = row(db, "agent_sessions", result.sessionId);
  assert.equal(session.last_event_at, 200);
  assert.equal(session.latest_state, "working");
  assert.equal(session.disposition, "active");
  assert.equal(openIntervals(db, result.sessionId).length, 1);
});

test("a projection failure rolls back the earlier event insert and project resolution", (t) => {
  const { db, projectResolver } = createHarness(t);
  const event = normalizeAgentEvent(fixture({
    opts: { cwd: path.join(os.tmpdir(), "agentlog-rollback-project"), sourceEventId: "rollback", timestamp: 100 },
  }));
  const ingestor = createDurableIngestor({
    db,
    projectResolver,
    sessionTracker: { applyEvent() { throw new Error("forced projection failure"); } },
  });

  assert.throws(() => ingestor.ingest(event), /forced projection failure/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM agent_events").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM projects").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM agent_sessions").get().count, 0);
});

test("interrupted reconciliation closes active rows and a newer event reactivates the source session", (t) => {
  const { db, ingestor, sessionTracker } = createHarness(t);
  const initial = normalizeAgentEvent(fixture({
    state: "working", event: "PreToolUse", opts: { sourceEventId: "initial", timestamp: 100 },
  }));
  const resumed = normalizeAgentEvent(fixture({
    state: "working", event: "PreToolUse", opts: { sourceEventId: "resumed", timestamp: 600 },
  }));
  const delayed = normalizeAgentEvent(fixture({
    state: "working", event: "PreToolUse", opts: { sourceEventId: "delayed", timestamp: 300 },
  }));

  const result = ingestor.ingest(initial);
  sessionTracker.reconcileInterrupted(500);
  assert.equal(openIntervals(db, result.sessionId).length, 0);
  let session = row(db, "agent_sessions", result.sessionId);
  assert.equal(session.disposition, "interrupted");
  assert.equal(session.ended_at, 500);
  assert.equal(db.prepare("SELECT close_reason FROM agent_active_intervals WHERE agent_session_id = ?").get(result.sessionId).close_reason, "interrupted");

  const delayedResult = ingestor.ingest(delayed);
  assert.equal(delayedResult.inserted, true);
  assert.ok(row(db, "agent_events", delayed.id));
  session = row(db, "agent_sessions", result.sessionId);
  assert.equal(session.disposition, "interrupted");
  assert.equal(session.ended_at, 500);
  assert.equal(session.last_event_at, 500);
  assert.equal(openIntervals(db, result.sessionId).length, 0);

  const reactivated = ingestor.ingest(resumed);
  session = row(db, "agent_sessions", result.sessionId);
  assert.equal(reactivated.sessionId, result.sessionId);
  assert.equal(session.disposition, "active");
  assert.equal(session.ended_at, null);
  assert.equal(openIntervals(db, result.sessionId).length, 1);
});
