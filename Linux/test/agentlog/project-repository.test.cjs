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
  normalizeProjectPath,
} = require("../../runtime/agentlog/projects/path-identity.cjs");
const {
  createProjectRepository,
} = require("../../runtime/agentlog/projects/project-repository.cjs");

function createHarness(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-project-repository-"));
  const db = openAgentLogDatabase({ databasePath: path.join(tmp, "agentlog.db") });
  let nextId = 0;
  const repo = createProjectRepository(db, {
    now: () => 1_800_000_000_000,
    createId: () => `id-${++nextId}`,
  });
  t.after(() => {
    closeAgentLogDatabase(db);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  return { db, repo, tmp };
}

function makeDirectory(tmp, name) {
  const directory = path.join(tmp, name);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function seedAgentHistory(db, projectId) {
  db.prepare(
    "INSERT INTO agent_sessions(id, agent_id, source_session_id, project_id, started_at, last_event_at, latest_state, disposition, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("session-1", "codex", "source-1", projectId, 1, 1, "working", "active", 1, 1);
  db.prepare(
    "INSERT INTO agent_events(id, schema_version, agent_id, session_id, raw_session_id, project_id, agent_session_row_id, occurred_at, received_at, type, category, state, payload_json) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("event-1", 1, "codex", "source-1", "source-1", projectId, "session-1", 1, 1, "StateChanged", "state_changed", "working", "{}");
  db.prepare(
    "INSERT INTO agent_active_intervals(id, agent_session_id, project_id, started_at) VALUES(?, ?, ?, ?)"
  ).run("interval-1", "session-1", projectId, 1);
  db.prepare(
    "INSERT INTO human_sessions(id, project_id, status, started_at, accumulated_pause_ms, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)"
  ).run("human-1", projectId, "completed", 1, 0, 1, 1);
}

function projectIdFor(db, table, id) {
  return db.prepare(`SELECT project_id AS projectId FROM ${table} WHERE id = ?`).get(id).projectId;
}

test("normalizes real directories and keeps a stable absolute fallback for unavailable paths", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-path-identity-"));
  const directory = makeDirectory(tmp, "project");
  const available = normalizeProjectPath(` ${directory} `);
  const unavailable = normalizeProjectPath("relative/missing", {
    realpathSync() {
      throw new Error("missing");
    },
    statSync() {
      throw new Error("missing");
    },
  });

  assert.deepEqual(available, {
    path: path.resolve(directory),
    canonicalPath: fs.realpathSync(directory),
    isAvailable: true,
  });
  assert.deepEqual(unavailable, {
    path: path.resolve("relative/missing"),
    canonicalPath: path.resolve("relative/missing"),
    isAvailable: false,
  });
  assert.throws(() => normalizeProjectPath("  "), /project path is required/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("manual creation stores one confirmed project and canonical primary path", (t) => {
  const { repo, tmp } = createHarness(t);
  const realProjectDir = makeDirectory(tmp, "manual");

  const project = repo.createManual({
    name: "AgentLog Pet",
    description: "Desktop agent journal",
    path: realProjectDir,
  });

  assert.equal(project.confirmation, "confirmed");
  assert.equal(project.createdSource, "manual");
  assert.equal(project.lifecycle, "active");
  assert.deepEqual(project.paths.map((item) => item.kind), ["primary"]);
  assert.equal(project.paths[0].canonicalPath, fs.realpathSync(realProjectDir));
  assert.equal(project.paths[0].isAvailable, true);
});

test("pending creation creates an agent-owned pending project and confirmation preserves its path", (t) => {
  const { repo, tmp } = createHarness(t);
  const project = repo.createPending({ name: "Detected", path: makeDirectory(tmp, "pending") });

  const confirmed = repo.confirm(project.id, {
    name: "Confirmed detected project",
    description: "Kept history",
  });

  assert.equal(project.confirmation, "pending");
  assert.equal(project.createdSource, "agent");
  assert.equal(confirmed.confirmation, "confirmed");
  assert.equal(confirmed.name, "Confirmed detected project");
  assert.equal(confirmed.description, "Kept history");
  assert.equal(confirmed.paths[0].id, project.paths[0].id);
});

test("project paths reject canonical ownership conflicts across projects", (t) => {
  const { repo, tmp } = createHarness(t);
  const shared = makeDirectory(tmp, "shared");
  repo.createManual({ name: "First", path: shared });

  assert.throws(
    () => repo.createManual({ name: "Second", path: shared }),
    /UNIQUE constraint failed: project_paths\.canonical_path/
  );
});

test("updates project details without altering lifecycle or attached paths", (t) => {
  const { repo, tmp } = createHarness(t);
  const project = repo.createManual({ name: "Before", path: makeDirectory(tmp, "updated") });

  const updated = repo.update(project.id, { name: "After", description: "A description" });

  assert.equal(updated.name, "After");
  assert.equal(updated.description, "A description");
  assert.equal(updated.lifecycle, "active");
  assert.equal(updated.paths.length, 1);
});

test("adds aliases, preserves exactly one primary path, and rebinds the primary", (t) => {
  const { repo, tmp } = createHarness(t);
  const project = repo.createManual({ name: "Paths", path: makeDirectory(tmp, "primary") });
  const alias = repo.addPath(project.id, { path: makeDirectory(tmp, "alias"), kind: "alias" });

  const rebound = repo.rebindPrimary(project.id, alias.id);

  assert.equal(rebound.paths.filter((item) => item.kind === "primary").length, 1);
  assert.equal(rebound.paths.find((item) => item.kind === "primary").id, alias.id);
  assert.equal(rebound.paths.find((item) => item.id === project.paths[0].id).kind, "alias");
  assert.throws(() => repo.removePath(project.id, alias.id), /primary path cannot be removed/);

  const removable = repo.addPath(project.id, { path: makeDirectory(tmp, "removable"), kind: "alias" });
  const withoutAlias = repo.removePath(project.id, removable.id);
  assert.equal(withoutAlias.paths.some((item) => item.id === removable.id), false);
});

test("finds the deepest active path only at complete path-segment boundaries", (t) => {
  const { repo, tmp } = createHarness(t);
  const root = makeDirectory(tmp, "workspace");
  const nested = makeDirectory(root, "packages/app");
  const prefixOnly = makeDirectory(tmp, "workspace-copy");
  const rootProject = repo.createManual({ name: "Root", path: root });
  const nestedProject = repo.createManual({ name: "Nested", path: nested });
  const prefixProject = repo.createManual({ name: "Prefix", path: prefixOnly });

  assert.equal(repo.findDeepestPath(path.join(nested, "src")).id, nestedProject.id);
  assert.equal(repo.findDeepestPath(path.join(root, "docs")).id, rootProject.id);
  assert.equal(repo.findDeepestPath(path.join(tmp, "workspace-copied")), null);
  repo.archive(nestedProject.id);
  assert.equal(repo.findDeepestPath(path.join(nested, "src")).id, rootProject.id);
  assert.notEqual(prefixProject.id, rootProject.id);
});

test("matches an unambiguous Git remote and attaches an idempotent worktree", (t) => {
  const { repo, tmp } = createHarness(t);
  const project = repo.createManual({
    name: "Git project",
    path: makeDirectory(tmp, "git-primary"),
    git: { root: "/repos/git-project", remoteIdentity: "github.com/example/project", branch: "main" },
  });
  const worktreePath = normalizeProjectPath(makeDirectory(tmp, "git-worktree"));
  const git = { root: "/repos/git-project", remoteIdentity: "github.com/example/project", branch: "feature" };

  assert.equal(repo.findByGitIdentity(git).id, project.id);
  const first = repo.attachWorktree(project.id, worktreePath, git);
  const second = repo.attachWorktree(project.id, worktreePath, git);
  assert.equal(first.kind, "worktree");
  assert.equal(second.id, first.id);
  assert.equal(repo.get(project.id).paths.filter((item) => item.kind === "worktree").length, 1);
});

test("does not choose an ambiguous Git remote identity", (t) => {
  const { repo, tmp } = createHarness(t);
  const remoteIdentity = "github.com/example/shared";
  repo.createManual({ name: "One", path: makeDirectory(tmp, "one"), git: { remoteIdentity } });
  repo.createManual({ name: "Two", path: makeDirectory(tmp, "two"), git: { remoteIdentity } });

  assert.equal(repo.findByGitIdentity({ remoteIdentity }), null);
});

test("refreshing path availability changes only availability", (t) => {
  const { repo, tmp } = createHarness(t);
  const project = repo.createManual({ name: "Availability", path: makeDirectory(tmp, "availability") });
  const original = project.paths[0];
  const unavailableFs = {
    realpathSync() {
      throw new Error("missing");
    },
    statSync() {
      throw new Error("missing");
    },
  };

  const refreshed = repo.refreshPathAvailability(original.id, unavailableFs);

  assert.equal(refreshed.isAvailable, false);
  assert.equal(refreshed.path, original.path);
  assert.equal(refreshed.canonicalPath, original.canonicalPath);
  assert.equal(refreshed.updatedAt, original.updatedAt);
});

test("archiving hides a project from default lists without deleting history or paths", (t) => {
  const { db, repo, tmp } = createHarness(t);
  const project = repo.createManual({ name: "Archive me", path: makeDirectory(tmp, "archive") });
  seedAgentHistory(db, project.id);

  const archived = repo.archive(project.id);

  assert.equal(archived.lifecycle, "archived");
  assert.equal(repo.list().some((item) => item.id === project.id), false);
  assert.equal(repo.list({ includeArchived: true }).find((item) => item.id === project.id).paths.length, 1);
  assert.equal(projectIdFor(db, "agent_events", "event-1"), project.id);
});

test("merge moves every dependent history row and archives the source", (t) => {
  const { db, repo, tmp } = createHarness(t);
  const target = repo.createManual({ name: "Main", path: makeDirectory(tmp, "main") });
  const duplicate = repo.createPending({ name: "Worktree", path: makeDirectory(tmp, "worktree") });
  seedAgentHistory(db, duplicate.id);

  const merged = repo.merge({ sourceProjectId: duplicate.id, targetProjectId: target.id });

  assert.equal(merged.id, target.id);
  assert.equal(repo.get(duplicate.id).lifecycle, "archived");
  assert.equal(projectIdFor(db, "project_paths", duplicate.paths[0].id), target.id);
  assert.equal(projectIdFor(db, "agent_events", "event-1"), target.id);
  assert.equal(projectIdFor(db, "agent_sessions", "session-1"), target.id);
  assert.equal(projectIdFor(db, "agent_active_intervals", "interval-1"), target.id);
  assert.equal(projectIdFor(db, "human_sessions", "human-1"), target.id);
});

test("merge rolls back all reassignment when a dependent update fails", (t) => {
  const { db, repo, tmp } = createHarness(t);
  const target = repo.createManual({ name: "Target", path: makeDirectory(tmp, "rollback-target") });
  const source = repo.createPending({ name: "Source", path: makeDirectory(tmp, "rollback-source") });
  seedAgentHistory(db, source.id);
  db.exec(`
    CREATE TRIGGER abort_human_project_move
    BEFORE UPDATE OF project_id ON human_sessions
    WHEN OLD.project_id = '${source.id}'
    BEGIN
      SELECT RAISE(ABORT, 'injected human session failure');
    END;
  `);

  assert.throws(
    () => repo.merge({ sourceProjectId: source.id, targetProjectId: target.id }),
    /injected human session failure/
  );
  assert.equal(repo.get(source.id).lifecycle, "active");
  assert.equal(projectIdFor(db, "project_paths", source.paths[0].id), source.id);
  assert.equal(projectIdFor(db, "agent_events", "event-1"), source.id);
  assert.equal(projectIdFor(db, "agent_sessions", "session-1"), source.id);
  assert.equal(projectIdFor(db, "agent_active_intervals", "interval-1"), source.id);
  assert.equal(projectIdFor(db, "human_sessions", "human-1"), source.id);
});
