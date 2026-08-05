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
const {
  createOverviewQueries,
} = require("../../runtime/agentlog/queries/overview.cjs");

const NOW = new Date(2026, 7, 5, 12, 0, 0).getTime();

function startOfLocalDay(at) {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

function createHarness(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-overview-queries-"));
  const db = openAgentLogDatabase({ databasePath: path.join(tmp, "agentlog.db") });
  const queries = createOverviewQueries(db, { now: () => NOW });
  t.after(() => {
    closeAgentLogDatabase(db);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  return { db, queries };
}

function seedProject(db, { id, name, confirmation, createdSource, lifecycle = "active", updatedAt }) {
  db.prepare(
    "INSERT INTO projects(id, name, lifecycle, confirmation, created_source, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)"
  ).run(id, name, lifecycle, confirmation, createdSource, updatedAt, updatedAt);
  db.prepare(
    "INSERT INTO project_paths(id, project_id, path, canonical_path, kind, is_available, created_at, updated_at) VALUES(?, ?, ?, ?, 'primary', ?, ?, ?)"
  ).run(`path-${id}`, id, `/projects/${id}`, `/projects/${id}`, Number(id !== "archived"), updatedAt, updatedAt);
}

function seedAgentSession(db, input) {
  db.prepare(
    "INSERT INTO agent_sessions(id, agent_id, source_session_id, project_id, cwd, title, started_at, ended_at, last_event_at, latest_state, disposition, transcript_path, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    input.id,
    input.agentId || "codex",
    `source-${input.id}`,
    input.projectId,
    `/projects/${input.projectId}`,
    input.title || input.id,
    input.startedAt,
    input.endedAt || null,
    input.lastEventAt,
    input.latestState || "working",
    input.disposition,
    null,
    input.startedAt,
    input.lastEventAt
  );
}

function seedInterval(db, { id, sessionId, projectId, startedAt, endedAt }) {
  db.prepare(
    "INSERT INTO agent_active_intervals(id, agent_session_id, project_id, started_at, ended_at) VALUES(?, ?, ?, ?, ?)"
  ).run(id, sessionId, projectId, startedAt, endedAt || null);
}

function seedEvent(db, { id, projectId, sessionId, occurredAt }) {
  db.prepare(
    "INSERT INTO agent_events(id, schema_version, agent_id, session_id, raw_session_id, project_id, agent_session_row_id, occurred_at, received_at, type, category, state, payload_json) VALUES(?, 1, 'codex', ?, ?, ?, ?, ?, ?, 'PreToolUse', 'tool', 'working', '{\"command\":\"npm test\"}')"
  ).run(id, `source-${sessionId}`, `source-${sessionId}`, projectId, sessionId, occurredAt, occurredAt);
}

function seedFixture(db) {
  const day = startOfLocalDay(NOW);
  seedProject(db, {
    id: "pending", name: "Pending", confirmation: "pending", createdSource: "agent", updatedAt: day + 10,
  });
  seedProject(db, {
    id: "active", name: "Active", confirmation: "confirmed", createdSource: "manual", updatedAt: day + 20,
  });
  seedProject(db, {
    id: "archived", name: "Archived", confirmation: "confirmed", createdSource: "manual", lifecycle: "archived", updatedAt: day + 30,
  });

  seedAgentSession(db, {
    id: "session-pending", projectId: "pending", startedAt: day + 1_000, lastEventAt: NOW - 200, disposition: "active",
  });
  seedAgentSession(db, {
    id: "session-active", projectId: "active", startedAt: day + 5_000, lastEventAt: NOW - 100, disposition: "active",
  });
  seedAgentSession(db, {
    id: "session-completed", projectId: "active", startedAt: day + 20_000, endedAt: day + 30_000, lastEventAt: day + 30_000, disposition: "completed",
  });
  seedAgentSession(db, {
    id: "session-archived", projectId: "archived", startedAt: day + 2_000, lastEventAt: NOW - 50, disposition: "active",
  });
  seedInterval(db, { id: "interval-pending", sessionId: "session-pending", projectId: "pending", startedAt: day + 1_000 });
  seedInterval(db, { id: "interval-active", sessionId: "session-active", projectId: "active", startedAt: day + 5_000 });
  seedInterval(db, { id: "interval-completed", sessionId: "session-completed", projectId: "active", startedAt: day + 20_000, endedAt: day + 30_000 });
  seedInterval(db, { id: "interval-archived", sessionId: "session-archived", projectId: "archived", startedAt: day + 2_000 });
  db.prepare(
    "INSERT INTO human_sessions(id, project_id, status, started_at, accumulated_pause_ms, notes, created_at, updated_at) VALUES('human-running', 'pending', 'running', ?, 0, '', ?, ?)"
  ).run(day + 6_000, day + 6_000, day + 6_000);

  seedEvent(db, { id: "event-old", projectId: "active", sessionId: "session-active", occurredAt: NOW - 500 });
  seedEvent(db, { id: "event-a", projectId: "pending", sessionId: "session-pending", occurredAt: NOW - 100 });
  seedEvent(db, { id: "event-z", projectId: "active", sessionId: "session-active", occurredAt: NOW - 100 });
  seedEvent(db, { id: "event-archived", projectId: "archived", sessionId: "session-archived", occurredAt: NOW - 10 });

  return day;
}

test("overview keeps summed agent intervals, unioned wall-clock activity, and human time separate", (t) => {
  const { db, queries } = createHarness(t);
  const day = seedFixture(db);

  const overview = queries.getOverview();

  assert.equal(overview.pendingProjectCount, 1);
  assert.deepEqual(overview.activeAgentSessions.map((item) => item.id), ["session-active", "session-pending"]);
  assert.deepEqual(overview.today, {
    agentSessionMs: 86_404_000,
    agentActiveMs: 43_199_000,
    humanMs: 43_194_000,
  });
  assert.deepEqual(overview.recentActivity.map((item) => item.id), ["event-z", "event-a", "event-old"]);
  assert.deepEqual(overview, JSON.parse(JSON.stringify(overview)));
});

test("project and session lists apply source and status filters with stable ordering", (t) => {
  const { db, queries } = createHarness(t);
  seedFixture(db);

  assert.deepEqual(queries.listProjects().map((item) => item.id), ["pending", "active"]);
  assert.deepEqual(queries.listProjects({ createdSource: "agent" }).map((item) => item.id), ["pending"]);
  assert.deepEqual(queries.listProjects({ confirmation: "confirmed" }).map((item) => item.id), ["active"]);
  assert.deepEqual(queries.listProjects({ includeArchived: true }).map((item) => item.id), ["pending", "active", "archived"]);
  assert.deepEqual(
    queries.listSessions({ source: "agent", status: "active" }).map((item) => item.id),
    ["session-active", "session-pending"]
  );
  assert.deepEqual(
    queries.listSessions({ source: "human", status: "running" }).map((item) => item.id),
    ["human-running"]
  );
});

test("project detail and timeline exclude archived projects by default", (t) => {
  const { db, queries } = createHarness(t);
  const day = seedFixture(db);

  const detail = queries.getProjectDetail("active");
  assert.equal(detail.name, "Active");
  assert.equal(detail.paths[0].isAvailable, true);
  assert.deepEqual(detail.today, {
    agentSessionMs: 43_205_000,
    agentActiveMs: 43_195_000,
    humanMs: 0,
  });
  assert.deepEqual(queries.getProjectTimeline("active").map((item) => item.id), ["event-z", "event-old"]);
  assert.equal(queries.getProjectDetail("archived"), null);
  assert.deepEqual(queries.getProjectTimeline("archived"), []);
  assert.equal(queries.getProjectDetail("archived", { includeArchived: true }).id, "archived");
  assert.equal(day < NOW, true);
});
