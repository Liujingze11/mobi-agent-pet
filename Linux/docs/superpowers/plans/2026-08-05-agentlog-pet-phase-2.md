# AgentLog Pet Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fresh local project storage, automatic and manual project management, durable agent history, separate agent and human timing, and a functional React manager window to the existing single AgentLog Pet application.

**Architecture:** The pinned Clawd runtime remains the only Electron lifecycle owner. Product-owned CommonJS modules under `runtime/agentlog` own SQLite, project resolution, event projection, timing, IPC, and the manager window; a separately built React renderer under `src/manager` consumes only the validated preload API.

**Tech Stack:** Node.js 22.12+, Electron 41.10.3, CommonJS, `better-sqlite3` 13.0.2, React 19, TypeScript 5.7, Vite 6, Lucide React, Node test runner, electron-builder 26.15.3.

## Global Constraints

- Target Linux x86_64 first and keep the product name `AgentLog Pet`.
- Preserve one installer, one application identity, one main process owner, one single-instance lock, and one tray.
- Keep the pinned Clawd baseline at commit `45d388aa661824443cd96779ff0a5d277972bd10` and make only narrow integration edits under `runtime/clawd`.
- Use `data/agentlog.db` in the AgentLog Pet user-data directory; never discover, import, open, or migrate `devpulse.db`.
- Persist a normalized event before applying its project and session projections in the same transaction.
- Unknown working directories create reusable `pending` projects without interrupting the user.
- Keep agent session time, deduplicated agent wall-clock active time, and human time separate.
- Keep the pet state driven by agent activity; the human timer must not override pet animation.
- Manager copy is English-first and the first screen is the operational Overview.
- AI summaries, reports, workspace restore, cloud sync, accounts, Windows, and macOS are out of scope.
- Use TDD for every production behavior and keep the full pinned-upstream test suite green.

## File Map

### Product Runtime

- `runtime/agentlog/storage/schema-v1.sql`: fresh Phase 2 schema.
- `runtime/agentlog/storage/database.cjs`: database open, migrations, pragmas, and close.
- `runtime/agentlog/projects/path-identity.cjs`: canonical paths and Git remote identity.
- `runtime/agentlog/projects/git-inspector.cjs`: bounded local Git metadata lookup.
- `runtime/agentlog/projects/project-repository.cjs`: project and path transactions.
- `runtime/agentlog/projects/project-resolver.cjs`: configured-path, Git, and pending resolution.
- `runtime/agentlog/sessions/agent-session-tracker.cjs`: session projection and active intervals.
- `runtime/agentlog/events/durable-ingestor.cjs`: idempotent event transaction.
- `runtime/agentlog/time/intervals.cjs`: interval union and duration aggregation.
- `runtime/agentlog/time/human-timer.cjs`: one persistent manual timer.
- `runtime/agentlog/queries/overview.cjs`: Overview and project/session read models.
- `runtime/agentlog/manager/validation.cjs`: IPC argument validation.
- `runtime/agentlog/manager/ipc.cjs`: manager IPC handlers and change broadcasts.
- `runtime/agentlog/manager/preload.cjs`: narrow `window.agentLog` bridge.
- `runtime/agentlog/manager/window.cjs`: same-application manager BrowserWindow.
- `runtime/agentlog/app-runtime.cjs`: Phase 2 service composition and lifecycle.
- `runtime/agentlog/runtime-bridge.cjs`: normalized event stream plus host action bridge.
- `runtime/agentlog/main.cjs`: install AgentLog services before loading Clawd.

### Manager Renderer

- `vite.manager.config.ts`: renderer-only Vite build.
- `vitest.manager.config.ts`: manager component test environment.
- `tsconfig.manager.json`: isolated manager renderer typecheck.
- `src/manager/index.html`: manager renderer entry.
- `src/manager/main.tsx`: React mount.
- `src/manager/App.tsx`: navigation and top-level data refresh.
- `src/manager/api.ts`: typed preload access.
- `src/manager/types.ts`: serialized domain contracts.
- `src/manager/model.mjs`: renderer-safe formatting and list derivation tested in Node.
- `src/manager/styles.css`: responsive operational layout.
- `src/manager/components/AppShell.tsx`: sidebar, toolbar, and route surface.
- `src/manager/components/HumanTimerBar.tsx`: persistent manual timer controls.
- `src/manager/pages/OverviewPage.tsx`: live operational snapshot.
- `src/manager/pages/ProjectsPage.tsx`: project list and detail workspace.
- `src/manager/pages/SessionsPage.tsx`: agent and human history filters.
- `src/manager/pages/SettingsPage.tsx`: AgentLog storage health and links to host settings.

### Tests And Verification

- `test/agentlog/database.test.cjs`
- `test/agentlog/project-repository.test.cjs`
- `test/agentlog/project-resolver.test.cjs`
- `test/agentlog/durable-ingestor.test.cjs`
- `test/agentlog/intervals.test.cjs`
- `test/agentlog/human-timer.test.cjs`
- `test/agentlog/overview-queries.test.cjs`
- `test/agentlog/app-runtime.test.cjs`
- `test/agentlog/manager-ipc.test.cjs`
- `test/agentlog/manager-window.test.cjs`
- `test/agentlog/manager-model.test.cjs`
- `src/manager/__tests__/AppShell.test.tsx`
- `src/manager/__tests__/OverviewPage.test.tsx`
- `src/manager/__tests__/ProjectsPage.test.tsx`
- `src/manager/__tests__/SessionsPage.test.tsx`
- `scripts/smoke-manager.cjs`
- `docs/verification/2026-08-05-agentlog-pet-phase-2-linux.md`

---

### Task 1: Fresh SQLite Foundation

**Files:**
- Create: `runtime/agentlog/storage/schema-v1.sql`
- Create: `runtime/agentlog/storage/database.cjs`
- Create: `test/agentlog/database.test.cjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Electron supplies the final `databasePath`; tests supply a temporary path.
- Produces: `openAgentLogDatabase({ databasePath, DatabaseCtor? })`, `runMigrations(db)`, and `closeAgentLogDatabase(db)`.

- [ ] **Step 1: Add a failing real-database test**

```js
test("opens a fresh AgentLog database with Phase 2 schema and pragmas", () => {
  const db = openAgentLogDatabase({ databasePath: path.join(tmp, "agentlog.db") });
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
  assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  for (const name of ["projects", "project_paths", "agent_events", "agent_sessions", "agent_active_intervals", "human_sessions"]) {
    assert.ok(tables.includes(name), name);
  }
  assert.equal(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get().version, 1);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/agentlog/database.test.cjs`

Expected: FAIL because `storage/database.cjs` does not exist.

- [ ] **Step 3: Install the pinned production dependency**

Run: `npm install --save-exact better-sqlite3@13.0.2`

Expected: `better-sqlite3` appears under `dependencies`, not `devDependencies`, and the lockfile records 13.0.2.

- [ ] **Step 4: Add the exact versioned schema**

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('active','archived')),
  confirmation TEXT NOT NULL CHECK (confirmation IN ('pending','confirmed')),
  created_source TEXT NOT NULL CHECK (created_source IN ('manual','agent')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE project_paths (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  canonical_path TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('primary','alias','worktree')),
  is_available INTEGER NOT NULL CHECK (is_available IN (0,1)),
  git_root TEXT,
  git_remote_identity TEXT,
  git_branch TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX project_paths_active_canonical ON project_paths(canonical_path);
CREATE UNIQUE INDEX project_paths_one_primary ON project_paths(project_id) WHERE kind='primary';
CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  source_session_id TEXT NOT NULL,
  parent_source_session_id TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  cwd TEXT,
  title TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  last_event_at INTEGER NOT NULL,
  latest_state TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('active','completed','errored','interrupted')),
  transcript_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(agent_id, source_session_id)
);
CREATE TABLE agent_events (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  source_event_id TEXT,
  source_sequence INTEGER,
  session_id TEXT NOT NULL,
  raw_session_id TEXT NOT NULL,
  parent_session_id TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  agent_session_row_id TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  cwd TEXT,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  state TEXT NOT NULL,
  tool_name TEXT,
  transcript_path TEXT,
  permission_json TEXT,
  payload_json TEXT NOT NULL
);
CREATE INDEX agent_events_project_time ON agent_events(project_id, occurred_at DESC);
CREATE TABLE agent_active_intervals (
  id TEXT PRIMARY KEY,
  agent_session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  close_reason TEXT
);
CREATE UNIQUE INDEX agent_intervals_one_open ON agent_active_intervals(agent_session_id) WHERE ended_at IS NULL;
CREATE TABLE human_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('running','paused','completed')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  paused_at INTEGER,
  accumulated_pause_ms INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX human_sessions_one_active ON human_sessions((1)) WHERE status IN ('running','paused');
```

- [ ] **Step 5: Implement migration and connection helpers**

```js
function openAgentLogDatabase({ databasePath, DatabaseCtor = require("better-sqlite3") }) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseCtor(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  runMigrations(db);
  return db;
}

function runMigrations(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const migrations = [{ version: 1, file: "schema-v1.sql" }];
  const applied = new Set(db.prepare("SELECT version FROM schema_migrations").all().map(row => row.version));
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const sql = fs.readFileSync(path.join(__dirname, migration.file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)").run(migration.version, Date.now());
    })();
  }
}
```

- [ ] **Step 6: Verify GREEN and regressions**

Run: `node --test test/agentlog/database.test.cjs test/agentlog/product-entry.test.cjs`

Expected: PASS, including reopening an already migrated database without duplicate schema work.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json runtime/agentlog/storage test/agentlog/database.test.cjs
git commit -m "feat: add AgentLog project database"
```

### Task 2: Project Repository And Manual Workflows

**Files:**
- Create: `runtime/agentlog/projects/path-identity.cjs`
- Create: `runtime/agentlog/projects/project-repository.cjs`
- Create: `test/agentlog/project-repository.test.cjs`

**Interfaces:**
- Consumes: migrated SQLite database from Task 1.
- Produces: `normalizeProjectPath(input, fsApi?)` and `createProjectRepository(db, { now, createId })` with `list`, `get`, `createManual`, `createPending`, `update`, `confirm`, `archive`, `addPath`, `removePath`, `rebindPrimary`, `merge`, `findDeepestPath`, `findByGitIdentity`, `attachWorktree`, and `refreshPathAvailability`.

- [ ] **Step 1: Write failing repository tests**

```js
test("manual creation stores one confirmed project and canonical primary path", () => {
  const project = repo.createManual({ name: "AgentLog Pet", description: "Desktop agent journal", path: realProjectDir });
  assert.equal(project.confirmation, "confirmed");
  assert.equal(project.createdSource, "manual");
  assert.deepEqual(project.paths.map(item => item.kind), ["primary"]);
  assert.equal(project.paths[0].canonicalPath, fs.realpathSync(realProjectDir));
});

test("merge moves history and archives the duplicate atomically", () => {
  const target = repo.createManual({ name: "Main", path: mainDir });
  const duplicate = repo.createPending({ name: "Worktree", path: worktreeDir });
  seedAgentHistory(db, duplicate.id);
  repo.merge({ sourceProjectId: duplicate.id, targetProjectId: target.id });
  assert.equal(repo.get(duplicate.id).lifecycle, "archived");
  assert.equal(countEvents(db, target.id), 1);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test test/agentlog/project-repository.test.cjs`

Expected: FAIL because the repository and path identity modules do not exist.

- [ ] **Step 3: Implement path identity and serialized row mapping**

```js
function normalizeProjectPath(input, fsApi = fs) {
  if (typeof input !== "string" || !input.trim()) throw new TypeError("project path is required");
  const absolute = path.resolve(input.trim());
  let canonicalPath = absolute;
  let isAvailable = false;
  try {
    canonicalPath = fsApi.realpathSync.native ? fsApi.realpathSync.native(absolute) : fsApi.realpathSync(absolute);
    isAvailable = fsApi.statSync(canonicalPath).isDirectory();
  } catch {}
  return { path: absolute, canonicalPath, isAvailable };
}
```

- [ ] **Step 4: Implement project transactions**

Use prepared statements and return camel-case plain objects. `createManual` and `createPending` insert the project and primary path in one transaction. `findDeepestPath` compares complete path segments rather than raw string prefixes. `refreshPathAvailability` updates only `is_available`. `merge` updates `project_paths`, `agent_events`, `agent_sessions`, `agent_active_intervals`, and `human_sessions`, resolves path conflicts in favor of the target, and archives the source only after all moves succeed.

```js
const createManual = db.transaction(input => createProject({
  ...input,
  confirmation: "confirmed",
  createdSource: "manual",
}));
const archive = db.transaction(id => {
  requireProject(id);
  updateLifecycle.run("archived", now(), id);
  return get(id);
});
```

- [ ] **Step 5: Verify duplicate, rebind, archive, and rollback behavior**

Run: `node --test test/agentlog/project-repository.test.cjs`

Expected: PASS for canonical path uniqueness, one primary path, pending confirmation, rebind, archive preservation, merge reassignment, and rollback after an injected constraint failure.

- [ ] **Step 6: Commit**

```bash
git add runtime/agentlog/projects test/agentlog/project-repository.test.cjs
git commit -m "feat: add manual project repository"
```

### Task 3: Automatic Project Resolution

**Files:**
- Create: `runtime/agentlog/projects/git-inspector.cjs`
- Create: `runtime/agentlog/projects/project-resolver.cjs`
- Create: `test/agentlog/project-resolver.test.cjs`

**Interfaces:**
- Consumes: `normalizeProjectPath` and project repository from Task 2.
- Produces: `normalizeRemoteIdentity(remote)`, `inspectGit(cwd, { spawnSync? })`, and `createProjectResolver({ repository, inspectGit, pathIdentity })` with `resolve({ cwd })`.

- [ ] **Step 1: Write failing resolution-order tests**

```js
test("chooses the deepest configured path before repository identity", () => {
  const root = repo.createManual({ name: "Root", path: workspace });
  const nested = repo.createManual({ name: "Nested", path: packageDir });
  assert.equal(resolver.resolve({ cwd: path.join(packageDir, "src") }).project.id, nested.id);
  assert.notEqual(nested.id, root.id);
});

test("creates one pending project and reuses it for later unknown-directory events", () => {
  const first = resolver.resolve({ cwd: unknownDir });
  const second = resolver.resolve({ cwd: path.join(unknownDir, "src") });
  assert.equal(first.created, true);
  assert.equal(first.project.confirmation, "pending");
  assert.equal(second.project.id, first.project.id);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test test/agentlog/project-resolver.test.cjs`

Expected: FAIL because `project-resolver.cjs` does not exist.

- [ ] **Step 3: Implement bounded Git inspection**

```js
function git(cwd, args, spawn = spawnSync) {
  const result = spawn("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    timeout: 250,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}
```

Normalize HTTPS and SSH remotes to a lowercase host plus repository path with a trailing `.git` removed. Return `{ gitRoot, remoteIdentity, branch, isWorktree }`, and return null fields when Git is unavailable.

- [ ] **Step 4: Implement deterministic resolver order and inspection cache**

```js
function resolve({ cwd }) {
  if (!cwd) return { project: null, path: null, created: false };
  const identity = pathIdentity(cwd);
  const direct = repository.findDeepestPath(identity.canonicalPath);
  if (direct) return { project: direct, path: identity, created: false };
  const git = getCachedGit(identity.canonicalPath);
  const related = repository.findByGitIdentity(git);
  if (related) return { project: related, path: repository.attachWorktree(related.id, identity, git), created: false };
  return { project: repository.createPending(pendingInput(identity, git)), path: identity, created: true };
}
```

- [ ] **Step 5: Verify GREEN and error fallbacks**

Run: `node --test test/agentlog/project-resolver.test.cjs test/agentlog/project-repository.test.cjs`

Expected: PASS for deepest path, Git root, worktree remote identity, unknown pending reuse, missing directory fallback, no-cwd result, and Git timeout.

- [ ] **Step 6: Commit**

```bash
git add runtime/agentlog/projects test/agentlog/project-resolver.test.cjs
git commit -m "feat: resolve agent work to projects"
```

### Task 4: Durable Agent Events And Session Projection

**Files:**
- Create: `runtime/agentlog/sessions/agent-session-tracker.cjs`
- Create: `runtime/agentlog/events/durable-ingestor.cjs`
- Create: `test/agentlog/durable-ingestor.test.cjs`

**Interfaces:**
- Consumes: normalized schema-version-1 events, database, and project resolver.
- Produces: `isWorkingState(state)`, `createAgentSessionTracker(db, deps)` with `applyEvent(event, projectId)` and `reconcileInterrupted(at)`, and `createDurableIngestor({ db, projectResolver, sessionTracker, onChange })` with `ingest(event)`.

- [ ] **Step 1: Write a failing end-to-end ingestion test**

```js
test("the first unknown-directory event persists before creating its pending project projection", () => {
  const event = normalizeAgentEvent(fixture({ event: "UserPromptSubmit", state: "thinking", cwd: unknownDir }));
  const result = ingestor.ingest(event);
  assert.equal(result.inserted, true);
  assert.equal(row("agent_events", event.id).project_id, result.projectId);
  assert.equal(row("projects", result.projectId).confirmation, "pending");
  assert.equal(openIntervals(result.sessionId).length, 1);
});

test("a duplicate event is a no-op for rows and intervals", () => {
  assert.equal(ingestor.ingest(event).inserted, true);
  assert.equal(ingestor.ingest(event).inserted, false);
  assert.equal(count("agent_events"), 1);
  assert.equal(count("agent_active_intervals"), 1);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/agentlog/durable-ingestor.test.cjs`

Expected: FAIL because the durable ingestor is missing.

- [ ] **Step 3: Implement session and interval projection**

```js
const WORKING_STATES = new Set(["thinking", "working", "typing", "building", "subagent", "subagents", "compacting", "sweeping", "worktree"]);
function isWorkingState(state) { return WORKING_STATES.has(String(state || "").toLowerCase()); }

function applyEvent(event, projectId) {
  const session = upsertSession(event, projectId);
  if (event.occurredAt < session.lastEventAt) return session;
  if (isWorkingState(event.state)) openIntervalIfNeeded(session, event.occurredAt, projectId);
  else closeOpenInterval(session.id, event.occurredAt, event.category);
  updateDispositionAndLatestState(session.id, event);
  return getSession(session.id);
}
```

- [ ] **Step 4: Implement one ingestion transaction**

Insert the event first with nullable projection IDs. Resolve the project, apply the session tracker, then update the event with `project_id` and `agent_session_row_id`. Catch only the primary-key duplicate as `{ inserted: false }`; propagate all other failures so the transaction rolls back.

```js
const ingestTransaction = db.transaction(event => {
  if (findEvent.get(event.id)) return { inserted: false, eventId: event.id };
  insertEvent.run(toEventRow(event));
  const resolved = projectResolver.resolve({ cwd: event.cwd });
  const session = sessionTracker.applyEvent(event, resolved.project && resolved.project.id);
  attachProjection.run(resolved.project && resolved.project.id, session.id, event.id);
  return { inserted: true, eventId: event.id, projectId: resolved.project && resolved.project.id, sessionId: session.id };
});
```

- [ ] **Step 5: Verify lifecycle, ordering, and rollback behavior**

Run: `node --test test/agentlog/durable-ingestor.test.cjs`

Expected: PASS for start, working interval, permission boundary, completion, error, explicit session end, duplicate, no-cwd event, parent session, transcript reference, older late event, forced transaction rollback, and `reconcileInterrupted(at)` closing every open interval and active session at the supplied timestamp. A newer event for the same source session may reactivate the row and open a new interval.

- [ ] **Step 6: Commit**

```bash
git add runtime/agentlog/events/durable-ingestor.cjs runtime/agentlog/sessions test/agentlog/durable-ingestor.test.cjs
git commit -m "feat: persist agent sessions and activity"
```

### Task 5: Time Aggregation And Read Models

**Files:**
- Create: `runtime/agentlog/time/intervals.cjs`
- Create: `runtime/agentlog/queries/overview.cjs`
- Create: `test/agentlog/intervals.test.cjs`
- Create: `test/agentlog/overview-queries.test.cjs`

**Interfaces:**
- Consumes: interval, session, event, project, and human-session tables.
- Produces: `sumIntervalDuration(intervals, range?)`, `unionIntervalDuration(intervals, range?)`, and `createOverviewQueries(db, { now })` with `getOverview`, `listProjects`, `getProjectDetail`, `listSessions`, and `getProjectTimeline`.

- [ ] **Step 1: Write failing concurrent-time tests**

```js
test("sums session duration but unions overlapping wall-clock time", () => {
  const intervals = [
    { startedAt: 0, endedAt: 10_000 },
    { startedAt: 5_000, endedAt: 15_000 },
  ];
  assert.equal(sumIntervalDuration(intervals), 20_000);
  assert.equal(unionIntervalDuration(intervals), 15_000);
});
```

- [ ] **Step 2: Run the interval test and verify RED**

Run: `node --test test/agentlog/intervals.test.cjs`

Expected: FAIL because `intervals.cjs` is missing.

- [ ] **Step 3: Implement clipped interval union**

```js
function unionIntervalDuration(intervals, range = {}) {
  const start = Number.isFinite(range.start) ? range.start : -Infinity;
  const end = Number.isFinite(range.end) ? range.end : Date.now();
  const sorted = intervals.map(item => [Math.max(start, item.startedAt), Math.min(end, item.endedAt ?? end)])
    .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let total = 0, current = null;
  for (const interval of sorted) {
    if (!current || interval[0] > current[1]) { if (current) total += current[1] - current[0]; current = interval.slice(); }
    else current[1] = Math.max(current[1], interval[1]);
  }
  return total + (current ? current[1] - current[0] : 0);
}
```

- [ ] **Step 4: Write failing read-model tests**

Test an Overview fixture containing one pending project, two overlapping live agent sessions, one running human timer, and recent events. Assert separated totals, stable descending activity order, source/status filters, and archived-project exclusion by default.

Run: `node --test test/agentlog/overview-queries.test.cjs`

Expected: FAIL because `queries/overview.cjs` is missing.

- [ ] **Step 5: Implement serializable read models**

Use SQL for row filtering and the interval helper for summed and union duration. Open intervals end at injected `now()`. Return camel-case objects with no SQLite statement or Buffer values.

```js
return {
  pendingProjectCount,
  activeAgentSessions,
  humanTimer,
  today: { agentSessionMs, agentActiveMs, humanMs },
  recentActivity,
};
```

- [ ] **Step 6: Verify GREEN and commit**

Run: `node --test test/agentlog/intervals.test.cjs test/agentlog/overview-queries.test.cjs`

```bash
git add runtime/agentlog/time/intervals.cjs runtime/agentlog/queries test/agentlog/intervals.test.cjs test/agentlog/overview-queries.test.cjs
git commit -m "feat: add project and time read models"
```

### Task 6: Persistent Human Timer

**Files:**
- Create: `runtime/agentlog/time/human-timer.cjs`
- Create: `test/agentlog/human-timer.test.cjs`

**Interfaces:**
- Consumes: database and project repository.
- Produces: `createHumanTimer({ db, now, createId, onChange })` with `getState`, `start(projectId)`, `pause()`, `resume()`, and `stop({ notes? })`.

- [ ] **Step 1: Write failing transition and recovery tests**

```js
test("pause and resume exclude persisted pause time", () => {
  timer.start(project.id);
  clock.advance(10_000);
  timer.pause();
  clock.advance(20_000);
  timer.resume();
  clock.advance(5_000);
  const completed = timer.stop({ notes: "Implemented persistence" });
  assert.equal(completed.effectiveMs, 15_000);
  assert.equal(completed.accumulatedPauseMs, 20_000);
});

test("a new service instance restores the running row", () => {
  first.start(project.id);
  assert.equal(createHumanTimer(deps).getState().status, "running");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/agentlog/human-timer.test.cjs`

Expected: FAIL because `human-timer.cjs` is missing.

- [ ] **Step 3: Implement transactional state changes**

```js
function pause() {
  const active = requireState("running");
  updatePause.run(now(), now(), active.id);
  return publish(getState());
}
function resume() {
  const active = requireState("paused");
  const pauseMs = Math.max(0, now() - active.pausedAt);
  updateResume.run(pauseMs, now(), active.id);
  return publish(getState());
}
```

Starting while active returns a structured `TIMER_ALREADY_ACTIVE` error containing the current state. Stopping computes effective time from persisted timestamps and clears the partial-unique active slot by setting status to `completed`.

- [ ] **Step 4: Verify every legal and illegal transition**

Run: `node --test test/agentlog/human-timer.test.cjs`

Expected: PASS for start, pause, resume, stop, notes, reopening, pending project use, archived/missing project rejection, monotonic elapsed time, and duplicate-start rejection.

- [ ] **Step 5: Commit**

```bash
git add runtime/agentlog/time/human-timer.cjs test/agentlog/human-timer.test.cjs
git commit -m "feat: add persistent human project timer"
```

### Task 7: Compose The Phase 2 Runtime

**Files:**
- Create: `runtime/agentlog/app-runtime.cjs`
- Create: `test/agentlog/app-runtime.test.cjs`
- Modify: `runtime/agentlog/runtime-bridge.cjs`
- Modify: `runtime/agentlog/main.cjs`

**Interfaces:**
- Consumes: Tasks 1-6 services and the Phase 1 normalized event stream.
- Produces: singleton `install({ app, BrowserWindow, ipcMain, dialog })`, `getServices()`, `getHealth()`, `showManager()`, `registerHostActions(actions)`, and `shutdown()`.

- [ ] **Step 1: Write a failing lifecycle/queue test**

```js
test("events received before database readiness are flushed once in publication order", async () => {
  runtime.install(fakeElectron);
  bridge.publishUpstreamEvent(fixture({ sourceEventId: "one" }));
  bridge.publishUpstreamEvent(fixture({ sourceEventId: "two" }));
  await fakeElectron.app.emitReady();
  assert.deepEqual(readEventIds(db), [eventId("one"), eventId("two")]);
});

test("install and shutdown are idempotent", async () => {
  assert.equal(runtime.install(fakeElectron), runtime.install(fakeElectron));
  await runtime.shutdown();
  await runtime.shutdown();
  assert.equal(closeCalls, 1);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/agentlog/app-runtime.test.cjs`

Expected: FAIL because `app-runtime.cjs` is missing.

- [ ] **Step 3: Extend the bridge with host actions without changing event semantics**

```js
let hostActions = Object.freeze({});
function registerHostActions(next) { hostActions = Object.freeze({ ...hostActions, ...next }); }
function invokeHostAction(name, ...args) {
  if (typeof hostActions[name] !== "function") throw new Error(`AgentLog host action unavailable: ${name}`);
  return hostActions[name](...args);
}
```

Keep the existing publish, subscribe, snapshot, stats, and clear contracts byte-for-byte compatible.

- [ ] **Step 4: Implement service composition and queued ingestion**

Subscribe before `app.whenReady()`. Push normalized events into an in-memory FIFO until the database is open; then call `sessionTracker.reconcileInterrupted(now())`, ingest the queue synchronously, and accept direct writes. Use `path.join(app.getPath("userData"), "data", "agentlog.db")`. Register a single `before-quit` shutdown handler. `getHealth()` returns `{ storage: "starting" | "ready" | "error", databaseName: "agentlog.db", errorMessage: string | null }`; it never exposes the full user-data path.

```js
function install(electron = require("electron")) {
  if (installed) return api;
  installed = true;
  unsubscribe = bridge.subscribeToAgentEvents(event => ready ? ingest(event) : pending.push(event));
  electron.app.whenReady().then(() => start(electron));
  electron.app.once("before-quit", shutdown);
  return api;
}
```

- [ ] **Step 5: Install before the upstream main module**

```js
const agentLogApp = require("./app-runtime.cjs");
agentLogApp.install();
require("../clawd/src/main.js");
```

- [ ] **Step 6: Verify runtime and Phase 1 bridge regressions**

Run: `node --test test/agentlog/app-runtime.test.cjs test/agentlog/runtime-bridge.test.cjs test/agentlog/event-stream.test.cjs`

Expected: PASS with no duplicate subscribers or lifecycle owners.

- [ ] **Step 7: Commit**

```bash
git add runtime/agentlog/main.cjs runtime/agentlog/runtime-bridge.cjs runtime/agentlog/app-runtime.cjs test/agentlog/app-runtime.test.cjs
git commit -m "feat: compose AgentLog project runtime"
```

### Task 8: Validated Manager IPC And Preload

**Files:**
- Create: `runtime/agentlog/manager/validation.cjs`
- Create: `runtime/agentlog/manager/ipc.cjs`
- Create: `runtime/agentlog/manager/preload.cjs`
- Create: `test/agentlog/manager-ipc.test.cjs`

**Interfaces:**
- Consumes: project repository, overview queries, human timer, Electron `ipcMain`, `dialog`, and `BrowserWindow`.
- Produces: `registerManagerIpc(deps)`, `dispose()`, and renderer global `window.agentLog` grouped as `overview`, `projects`, `sessions`, `humanTimer`, `settings`, `diagnostics`, `managerWindow`, and `events`.

- [ ] **Step 1: Write failing IPC contract tests**

```js
test("projects:addFromFolder validates the selected directory in main", async () => {
  const api = registerHarness();
  await api.invoke("agentlog:projects:add-from-folder", { path: projectDir, name: "  Demo  " });
  assert.deepEqual(repo.createManualCalls[0], { path: projectDir, name: "Demo", description: "" });
});

test("invalid lifecycle input returns a structured validation error", async () => {
  await assert.rejects(
    api.invoke("agentlog:projects:list", { lifecycle: "deleted" }),
    error => error.code === "INVALID_ARGUMENT"
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/agentlog/manager-ipc.test.cjs`

Expected: FAIL because manager IPC is missing.

- [ ] **Step 3: Implement validators and exact channels**

Register these invoke channels: `agentlog:overview:get`, `agentlog:projects:list`, `get`, `pick-folder`, `add-from-folder`, `update`, `confirm`, `archive`, `add-path`, `remove-path`, `rebind`, `merge`; `agentlog:sessions:list`, `timeline`; `agentlog:human-timer:get`, `start`, `pause`, `resume`, `stop`; `agentlog:diagnostics:get`; `agentlog:manager:hide`; and `agentlog:host:open-settings`.

```js
function boundedText(value, { name, max, required = false }) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw validationError(`${name} is required`);
  if (result.length > max) throw validationError(`${name} is too long`);
  return result;
}
```

- [ ] **Step 4: Expose only named preload methods**

```js
contextBridge.exposeInMainWorld("agentLog", Object.freeze({
  overview: { get: () => invoke("agentlog:overview:get") },
  projects: {
    list: filters => invoke("agentlog:projects:list", filters), get: id => invoke("agentlog:projects:get", { id }),
    pickFolder: () => invoke("agentlog:projects:pick-folder"), addFromFolder: input => invoke("agentlog:projects:add-from-folder", input),
    update: input => invoke("agentlog:projects:update", input), confirm: input => invoke("agentlog:projects:confirm", input),
    archive: id => invoke("agentlog:projects:archive", { id }), addPath: input => invoke("agentlog:projects:add-path", input),
    removePath: input => invoke("agentlog:projects:remove-path", input), rebind: input => invoke("agentlog:projects:rebind", input),
    merge: input => invoke("agentlog:projects:merge", input),
  },
  sessions: { list: filters => invoke("agentlog:sessions:list", filters), timeline: input => invoke("agentlog:sessions:timeline", input) },
  humanTimer: {
    get: () => invoke("agentlog:human-timer:get"), start: projectId => invoke("agentlog:human-timer:start", { projectId }),
    pause: () => invoke("agentlog:human-timer:pause"), resume: () => invoke("agentlog:human-timer:resume"),
    stop: notes => invoke("agentlog:human-timer:stop", { notes }),
  },
  settings: { open: tab => invoke("agentlog:host:open-settings", { tab }) },
  diagnostics: { get: () => invoke("agentlog:diagnostics:get") },
  managerWindow: { hide: () => invoke("agentlog:manager:hide") },
  events: {
    onChanged(callback) {
      const listener = (_event, scope) => callback(scope);
      ipcRenderer.on("agentlog:data-changed", listener);
      return () => ipcRenderer.removeListener("agentlog:data-changed", listener);
    },
  },
}));
```

- [ ] **Step 5: Verify channel disposal, validation, and notifications**

Run: `node --test test/agentlog/manager-ipc.test.cjs`

Expected: PASS and prove that arbitrary channel invocation, arbitrary file reads, raw SQL, overlong text, unknown IDs, and invalid enums are not exposed.

- [ ] **Step 6: Commit**

```bash
git add runtime/agentlog/manager test/agentlog/manager-ipc.test.cjs
git commit -m "feat: expose validated manager API"
```

### Task 9: Manager Window And Same-App Navigation

**Files:**
- Create: `runtime/agentlog/manager/window.cjs`
- Create: `test/agentlog/manager-window.test.cjs`
- Modify: `runtime/agentlog/app-runtime.cjs`
- Modify: `runtime/clawd/src/main.js`
- Modify: `runtime/clawd/src/menu.js`
- Modify: `runtime/clawd/src/i18n.js`
- Modify: `runtime/clawd/test/menu-display.test.js`

**Interfaces:**
- Consumes: manager preload and app-runtime host actions.
- Produces: `createManagerWindowController({ app, BrowserWindow, preloadPath, rendererPath })` with `show`, `hide`, `focus`, `getWindow`, and `destroy`; tray/pet menu command `Open AgentLog`.

- [ ] **Step 1: Write failing window ownership tests**

```js
test("show reuses one manager window and close hides it", async () => {
  const controller = createManagerWindowController(deps);
  const first = controller.show();
  first.emit("close", closeEvent);
  assert.equal(closeEvent.defaultPrevented, true);
  assert.equal(first.hideCalls, 1);
  assert.equal(controller.show(), first);
  assert.equal(FakeBrowserWindow.instances.length, 1);
});
```

- [ ] **Step 2: Run manager and upstream menu tests to verify RED**

Run: `node --test test/agentlog/manager-window.test.cjs runtime/clawd/test/menu-display.test.js`

Expected: FAIL because the manager controller and `Open AgentLog` command are missing.

- [ ] **Step 3: Implement a hidden-on-close manager BrowserWindow**

```js
new BrowserWindow({
  width: 1180,
  height: 760,
  minWidth: 900,
  minHeight: 620,
  title: "AgentLog Pet",
  show: false,
  backgroundColor: "#171918",
  webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false },
});
```

Load `dist/manager/index.html`, reveal on `ready-to-show`, hide on user close, and destroy only during application quit.

- [ ] **Step 4: Wire one product-owned menu action**

Register `openAgentLogManager` and `openSettingsTab` host actions from upstream main. Add `Open AgentLog` above existing session/settings actions in both tray and pet context templates. Keep Agent Integrations available and route it to the existing `agents` tab.

- [ ] **Step 5: Verify GREEN and upstream pin integrity**

Run: `node --test test/agentlog/manager-window.test.cjs runtime/clawd/test/menu-display.test.js test/agentlog/upstream-pin.test.cjs`

Expected: PASS with one reused manager window and no second app/tray owner.

- [ ] **Step 6: Commit**

```bash
git add runtime/agentlog runtime/clawd/src/main.js runtime/clawd/src/menu.js runtime/clawd/src/i18n.js runtime/clawd/test/menu-display.test.js test/agentlog/manager-window.test.cjs
git commit -m "feat: open AgentLog manager from the pet"
```

### Task 10: Build The React Manager Shell

**Files:**
- Create: `vite.manager.config.ts`
- Create: `vitest.manager.config.ts`
- Create: `tsconfig.manager.json`
- Create: `src/manager/index.html`
- Create: `src/manager/main.tsx`
- Create: `src/manager/App.tsx`
- Create: `src/manager/api.ts`
- Create: `src/manager/types.ts`
- Create: `src/manager/model.mjs`
- Create: `src/manager/styles.css`
- Create: `src/manager/components/AppShell.tsx`
- Create: `src/manager/pages/SettingsPage.tsx`
- Create: `test/agentlog/manager-model.test.cjs`
- Create: `src/manager/__tests__/AppShell.test.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `window.agentLog` preload contract from Task 8.
- Produces: a static `dist/manager/index.html` renderer, typed `agentLogApi`, route IDs `overview`, `projects`, `sessions`, `agents`, `pet`, and `settings`, and pure `formatDuration`, `formatPath`, and `deriveNavigationBadge` helpers.

- [ ] **Step 1: Write failing renderer model and real component tests**

```js
test("formatDuration keeps long project time compact and stable", () => {
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(3_900_000), "1h 5m");
});

test("renders the six approved destinations without Phase 3 placeholders", () => {
  render(<AppShell currentRoute="overview" onNavigate={() => {}}><div>Operational view</div></AppShell>);
  for (const label of ["Overview", "Projects", "Sessions", "Agents", "Pet & Themes", "Settings"]) {
    expect(screen.getByRole("button", { name: label })).toBeVisible();
  }
  expect(screen.queryByText(/Reports|Restore|Coming Soon/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/agentlog/manager-model.test.cjs && npm run test:manager`

Expected: the Node model test fails because the model does not exist, and the component test fails because `AppShell` does not exist.

- [ ] **Step 3: Add renderer-only Vite build and scripts**

```ts
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist/manager",
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, "src/manager/index.html") },
  },
});
```

Install exact test dependencies with `npm install --save-dev --save-exact vitest@3.2.4 jsdom@26.1.0 @testing-library/react@16.3.0 @testing-library/user-event@14.6.1 @testing-library/jest-dom@6.6.3`. Add an isolated `tsconfig.manager.json` with `allowJs: true`, `checkJs: true`, DOM/ES2022 libraries, `moduleResolution: "bundler"`, and includes limited to `src/manager`, `vite.manager.config.ts`, and `vitest.manager.config.ts`. Configure Vitest with the `jsdom` environment and a setup file that imports `@testing-library/jest-dom/vitest`. Add these exact scripts:

```json
"build:manager": "vite build --config vite.manager.config.ts",
"typecheck:manager": "tsc -p tsconfig.manager.json --noEmit",
"test:manager": "vitest run --config vitest.manager.config.ts",
"test:phase2": "npm test && npm run test:manager && npm run typecheck:manager && npm run build:manager && npm run test:upstream"
```

Make `start`, `dev`, and `prebuild:linux` run `build:manager` before Electron or electron-builder starts.

- [ ] **Step 4: Implement the typed shell**

Use a fixed 216px sidebar, 52px top toolbar, scrollable content area, Lucide icons, and route buttons with tooltips where the icon meaning is not obvious. Use neutral graphite surfaces with green active state, amber pending state, red error state, and restrained cyan accents. Keep card radius at 8px or less and do not nest cards.

```tsx
const destinations = [
  ["overview", "Overview", LayoutDashboard],
  ["projects", "Projects", FolderKanban],
  ["sessions", "Sessions", History],
  ["agents", "Agents", Bot],
  ["pet", "Pet & Themes", Palette],
  ["settings", "Settings", Settings],
] as const;
```

Agents and Pet & Themes call `agentLogApi.settings.open(tab)` to open the existing same-application settings surfaces. Settings renders `SettingsPage` inside Manager with database health and an `Open App Settings` command that calls `agentLogApi.settings.open("general")`. Overview, Projects, Sessions, and Settings render inside Manager.

- [ ] **Step 5: Verify model, typecheck, and production build**

Run: `node --test test/agentlog/manager-model.test.cjs && npm run test:manager && npm run typecheck:manager && npm run build:manager`

Expected: PASS and `dist/manager/index.html` references relative hashed assets.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.manager.json vite.manager.config.ts vitest.manager.config.ts src/manager test/agentlog/manager-model.test.cjs
git commit -m "feat: add AgentLog manager shell"
```

### Task 11: Overview And Human Timer UI

**Files:**
- Create: `src/manager/components/HumanTimerBar.tsx`
- Create: `src/manager/pages/OverviewPage.tsx`
- Modify: `src/manager/App.tsx`
- Modify: `src/manager/model.mjs`
- Modify: `src/manager/styles.css`
- Modify: `test/agentlog/manager-model.test.cjs`
- Create: `src/manager/__tests__/OverviewPage.test.tsx`

**Interfaces:**
- Consumes: Overview snapshot and human-timer preload methods.
- Produces: always-stable timer toolbar, separated today totals, pending-project action, live agent list, and recent activity list.

- [ ] **Step 1: Add failing state derivation tests**

```js
test("deriveTimerActions exposes only valid controls", () => {
  assert.deepEqual(deriveTimerActions({ status: "running" }), ["pause", "stop"]);
  assert.deepEqual(deriveTimerActions({ status: "paused" }), ["resume", "stop"]);
  assert.deepEqual(deriveTimerActions(null), ["start"]);
});
```

Render `OverviewPage` with a literal snapshot fixture and require the visible labels `Agent session time`, `Agent active time`, `Human time`, `Pending projects`, and `Recent activity`. Render `HumanTimerBar` in running and paused states, click its icon buttons with `userEvent`, and assert the consumer-visible state callback or error message rather than asserting that a mock exists.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/agentlog/manager-model.test.cjs && npm run test:manager`

Expected: FAIL because timer derivation and Overview components are absent.

- [ ] **Step 3: Implement timer controls and refresh behavior**

Subscribe once to `agentLog.events.onChanged`, refresh the Overview after relevant scopes, and update displayed running time from a local one-second display tick anchored to persisted timestamps. Every command awaits the IPC result before changing controls.

```tsx
<IconButton title="Pause timer" onClick={pause}><Pause size={16} /></IconButton>
<IconButton title="Stop timer" onClick={stop}><Square size={16} /></IconButton>
```

- [ ] **Step 4: Implement the compact Overview**

Use one metrics band, one live-session table, and one chronological activity list. Empty states contain direct actions such as `Add project` or `Review pending projects`, not feature explanations.

- [ ] **Step 5: Verify focused tests, typecheck, and build**

Run: `node --test test/agentlog/manager-model.test.cjs && npm run test:manager && npm run typecheck:manager && npm run build:manager`

- [ ] **Step 6: Commit**

```bash
git add src/manager test/agentlog/manager-model.test.cjs
git commit -m "feat: show live work and human timing"
```

### Task 12: Projects And Sessions Workspaces

**Files:**
- Create: `src/manager/pages/ProjectsPage.tsx`
- Create: `src/manager/pages/SessionsPage.tsx`
- Modify: `src/manager/App.tsx`
- Modify: `src/manager/model.mjs`
- Modify: `src/manager/styles.css`
- Modify: `test/agentlog/manager-model.test.cjs`
- Create: `src/manager/__tests__/ProjectsPage.test.tsx`
- Create: `src/manager/__tests__/SessionsPage.test.tsx`

**Interfaces:**
- Consumes: all project and session preload methods.
- Produces: folder-based manual add, pending confirmation, edit, alias, rebind, merge, archive, project detail tabs, activity timeline, and filtered agent/human session history.

- [ ] **Step 1: Add failing project/session model tests**

```js
test("project list sorts pending work before confirmed active work", () => {
  const result = sortProjects([
    { id: "a", confirmation: "confirmed", updatedAt: 20 },
    { id: "b", confirmation: "pending", updatedAt: 10 },
  ]);
  assert.deepEqual(result.map(item => item.id), ["b", "a"]);
});

test("session filters preserve agent and human sources separately", () => {
  assert.deepEqual(filterSessions(rows, { kind: "agent", projectId: "p1" }).map(row => row.id), ["agent-1"]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/agentlog/manager-model.test.cjs && npm run test:manager`

Expected: FAIL because sorting/filtering and the two workspaces are absent.

- [ ] **Step 3: Implement the Projects split layout**

Use a 320px responsive project list and a flexible detail pane. The add command opens the native folder picker, then a compact confirmation dialog for name and description. Pending confirmation edits in place. Merge requires selecting a confirmed target and shows the exact records that move. Archive requires a confirmation dialog and never says delete.

Project detail tabs are exactly `Overview`, `Activity`, `Sessions`, and `Settings`. Show path health, Git metadata, the three separate time totals, aliases, and worktrees without exposing raw SQL fields.

Render `ProjectsPage` with literal pending and confirmed fixtures. Exercise folder-add cancellation, pending confirmation, project selection, and archive confirmation through visible controls, then assert the resulting rendered project state and callback result.

- [ ] **Step 4: Implement the Sessions table**

Use segmented controls for Agent/Human/All, project and status menus, date inputs, sortable start time, and a side detail panel. Agent rows show source, title, disposition, duration, cwd, and parent session. Human rows show effective and paused time plus notes.

Render `SessionsPage` with literal agent and human fixtures. Select each segment and a project filter with `userEvent`, then assert only the matching real rows remain visible.

- [ ] **Step 5: Verify focused tests and responsive build**

Run: `node --test test/agentlog/manager-model.test.cjs && npm run test:manager && npm run typecheck:manager && npm run build:manager`

Expected: PASS with no text labels overflowing at 900x620 and 1440x900 based on the CSS grid constraints.

- [ ] **Step 6: Commit**

```bash
git add src/manager test/agentlog/manager-model.test.cjs
git commit -m "feat: manage projects and session history"
```

### Task 13: Package, Smoke, And Linux Acceptance

**Files:**
- Create: `scripts/smoke-manager.cjs`
- Create: `docs/verification/2026-08-05-agentlog-pet-phase-2-linux.md`
- Modify: `package.json`
- Modify: `test/agentlog/product-entry.test.cjs`
- Modify: `scripts/smoke-linux.cjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete Phase 2 runtime and manager assets.
- Produces: packaged native SQLite, manager smoke result, final Phase 2 verification record, AppImage, and deb.

- [ ] **Step 1: Add failing package contract tests**

```js
assert.equal(pkg.dependencies["better-sqlite3"], "13.0.2");
assert.ok(pkg.build.files.includes("dist/manager/**/*"));
assert.ok(pkg.build.asarUnpack.includes("node_modules/better-sqlite3/**/*"));
assert.match(pkg.scripts["prebuild:linux"], /build:manager/);
```

Run: `node --test test/agentlog/product-entry.test.cjs`

Expected: FAIL until package metadata includes manager assets and native SQLite unpacking.

- [ ] **Step 2: Complete package metadata and smoke mode**

Add `dist/manager/**/*` to build files and `node_modules/better-sqlite3/**/*` to `asarUnpack`. Extend smoke mode with `AGENTLOG_MANAGER_SMOKE_MODE=1`: open the manager, wait for `did-finish-load`, query `[data-testid='manager-shell']`, read the database path basename, and print one JSON payload without exposing the full user path.

```json
{"status":"ok","productName":"AgentLog Pet","managerTitle":"AgentLog Pet","databaseName":"agentlog.db","managerShell":true}
```

- [ ] **Step 3: Run all product and upstream tests**

Run: `npm run test:phase2`

Expected: every AgentLog test passes; pinned upstream remains at 6,238 passes and 22 platform skips unless the pinned baseline's deterministic count changes because an approved upstream test was added in this phase.

- [ ] **Step 4: Verify development runtime**

Run: `npm run verify:sidecars -- build:linux`

Run: `npm run smoke:linux`

Run: `npm run smoke:manager`

Expected: both smokes report `status: ok`; the second application launch reuses the existing single instance; the manager reports `agentlog.db` and a rendered shell.

- [ ] **Step 5: Inspect the manager visually**

Launch with an isolated HOME and XDG config directory, open Manager from the pet menu, and capture screenshots at 900x620 and 1440x900. Inspect both screenshots for nonblank content, readable English text, stable sidebar and toolbar dimensions, no overlap, no nested cards, and visible Pending/active/error distinctions. Exercise manual add, pending confirmation, timer pause/resume, project archive, and session filters against disposable fixture directories.

- [ ] **Step 6: Build Linux packages and inspect native contents**

Run: `npm run build:linux`

Run: `npx asar list Linux/linux-unpacked/resources/app.asar | rg 'dist/manager|runtime/agentlog/storage/schema-v1.sql'`

Run: `find Linux/linux-unpacked/resources -path '*better_sqlite3.node' -print`

Expected: manager assets and schema are in the app archive, and `better_sqlite3.node` is unpacked.

- [ ] **Step 7: Smoke the final AppImage**

Run: `APPIMAGE_EXTRACT_AND_RUN=1 npm run smoke:linux -- Linux/AgentLog-Pet-0.1.0-x64.AppImage`

Run: `APPIMAGE_EXTRACT_AND_RUN=1 npm run smoke:manager -- Linux/AgentLog-Pet-0.1.0-x64.AppImage`

Expected: both final-artifact smokes report `status: ok`. Record the host's missing `libfuse.so.2` caveat if native FUSE launch remains unavailable.

- [ ] **Step 8: Write the verification record and update README**

Record exact test counts, smoke payloads, screenshot dimensions, manual interactions actually observed, package sizes, SHA-256 hashes, desktop entry metadata, native module path, and every unverified item. Update README development, test, database, manager, and packaging commands without describing Phase 3 features as complete.

- [ ] **Step 9: Run the final clean-tree gate**

Run: `git diff --check`

Run: `npm run test:phase2`

Run: `npm run typecheck:manager && npm run build:manager`

Run: `git status --short`

Expected: no whitespace errors, all suites green, manager build green, and only intentional source/docs changes present; generated installers remain ignored.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json test/agentlog/product-entry.test.cjs scripts README.md docs/verification/2026-08-05-agentlog-pet-phase-2-linux.md
git commit -m "test: verify AgentLog Pet project manager"
```

## Phase 2 Completion Gate

- Manual project add, edit, confirm, rebind, merge, and archive work against fresh `agentlog.db` data.
- Unknown Codex and Claude directories create pending projects and preserve the first normalized event.
- Project activity, agent sessions, intervals, and human sessions survive restart.
- Agent summed time, agent wall-clock active time, and human time remain visibly separate.
- One human timer recovers across manager closure and application restart.
- Overview, Projects, Sessions, Agents, Pet & Themes, and Settings are functioning manager destinations.
- The manager hides without stopping the pet, event ingestion, or timing.
- The app still has one lifecycle owner, one single-instance lock, and one tray.
- Development and packaged Linux smokes pass with native SQLite loaded.
- Product tests, TypeScript, Vite build, and the pinned Clawd regression suite pass.

Phase 3 begins only after this gate and adds provider-independent summaries,
reports, trusted restore profiles, execution logs, health checks, and agent
session continuation.
