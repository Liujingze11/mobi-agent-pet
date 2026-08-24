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
  createProjectRepository,
} = require("../../runtime/agentlog/projects/project-repository.cjs");
const {
  createHumanTimer,
} = require("../../runtime/agentlog/time/human-timer.cjs");

function createClock(at = 1_800_000_000_000) {
  return {
    now: () => at,
    advance(ms) {
      at += ms;
    },
  };
}

function createHarness(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-human-timer-"));
  const db = openAgentLogDatabase({ databasePath: path.join(tmp, "agentlog.db") });
  const clock = createClock();
  let nextId = 0;
  const createId = () => `id-${++nextId}`;
  const projectRepository = createProjectRepository(db, { now: clock.now, createId });
  const timer = createHumanTimer({ db, now: clock.now, createId, projectRepository });
  t.after(() => {
    closeAgentLogDatabase(db);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  return { clock, db, projectRepository, timer, tmp };
}

function createProject(harness, name = "Timer project") {
  const projectDir = path.join(harness.tmp, name.replaceAll(" ", "-"));
  fs.mkdirSync(projectDir);
  return harness.projectRepository.createManual({ name, path: projectDir });
}

test("pause and resume exclude persisted pause time", (t) => {
  const harness = createHarness(t);
  const project = createProject(harness);

  harness.timer.start(project.id);
  harness.clock.advance(10_000);
  harness.timer.pause();
  harness.clock.advance(20_000);
  harness.timer.resume();
  harness.clock.advance(5_000);
  const completed = harness.timer.stop({ notes: "Implemented persistence" });

  assert.equal(completed.effectiveMs, 15_000);
  assert.equal(completed.accumulatedPauseMs, 20_000);
});

test("a new service instance restores the running row", (t) => {
  const harness = createHarness(t);
  const project = createProject(harness);

  const started = harness.timer.start(project.id);
  const restored = createHumanTimer({
    db: harness.db,
    now: harness.clock.now,
    createId: () => "unused",
    projectRepository: harness.projectRepository,
  }).getState();

  assert.equal(restored.status, "running");
  assert.equal(restored.id, started.id);
  assert.deepEqual(restored, JSON.parse(JSON.stringify(restored)));
});

test("a new service instance restores a paused row without counting its open pause", (t) => {
  const harness = createHarness(t);
  const project = createProject(harness);

  harness.timer.start(project.id);
  harness.clock.advance(10_000);
  harness.timer.pause();
  harness.clock.advance(20_000);
  const restored = createHumanTimer({
    db: harness.db,
    now: harness.clock.now,
    createId: () => "unused",
    projectRepository: harness.projectRepository,
  }).getState();

  assert.equal(restored.status, "paused");
  assert.equal(restored.elapsedMs, 10_000);
  assert.equal(restored.effectiveMs, 10_000);
  assert.equal(restored.accumulatedPauseMs, 0);
});

test("stopping while paused closes the persisted pause interval", (t) => {
  const harness = createHarness(t);
  const project = createProject(harness);

  const started = harness.timer.start(project.id);
  harness.clock.advance(10_000);
  harness.timer.pause();
  harness.clock.advance(20_000);
  const completed = harness.timer.stop({ notes: "Paused finish" });
  const pause = harness.db.prepare(
    "SELECT started_at, ended_at FROM human_pause_intervals WHERE human_session_id = ?"
  ).get(started.id);

  assert.deepEqual(pause, { started_at: 1_800_000_010_000, ended_at: 1_800_000_030_000 });
  assert.equal(completed.status, "completed");
  assert.equal(completed.effectiveMs, 10_000);
  assert.equal(completed.accumulatedPauseMs, 20_000);
  assert.equal(harness.timer.getState(), null);
});

test("a failed pause rolls back its interval and does not publish a change", (t) => {
  const harness = createHarness(t);
  const project = createProject(harness);
  const changes = [];
  const timer = createHumanTimer({
    db: harness.db,
    now: harness.clock.now,
    createId: () => `change-${changes.length}`,
    projectRepository: harness.projectRepository,
    onChange: (state) => changes.push(state),
  });
  timer.start(project.id);
  harness.db.exec(`
    CREATE TRIGGER reject_timer_pause
    BEFORE UPDATE OF status ON human_sessions
    WHEN NEW.status = 'paused'
    BEGIN
      SELECT RAISE(ABORT, 'injected pause failure');
    END;
  `);

  assert.throws(() => timer.pause(), /injected pause failure/);
  assert.equal(harness.db.prepare("SELECT COUNT(*) AS count FROM human_pause_intervals").get().count, 0);
  assert.equal(timer.getState().status, "running");
  assert.equal(changes.length, 1);
});

test("a pending project is a valid timer target", (t) => {
  const harness = createHarness(t);
  const projectDir = path.join(harness.tmp, "pending-project");
  fs.mkdirSync(projectDir);
  const project = harness.projectRepository.createPending({ name: "Detected project", path: projectDir });

  const started = harness.timer.start(project.id);

  assert.equal(started.status, "running");
  assert.equal(started.projectId, project.id);
});

test("archived and missing projects are rejected without changing idle state", (t) => {
  const harness = createHarness(t);
  const archived = createProject(harness, "Archived project");
  harness.projectRepository.archive(archived.id);

  assert.deepEqual(harness.timer.start(archived.id), { code: "PROJECT_ARCHIVED", state: null });
  assert.deepEqual(harness.timer.start("missing-project"), { code: "PROJECT_NOT_FOUND", state: null });
  assert.equal(harness.timer.getState(), null);
  assert.equal(harness.db.prepare("SELECT COUNT(*) AS count FROM human_sessions").get().count, 0);
});

test("starting while active returns TIMER_ALREADY_ACTIVE with the current state", (t) => {
  const harness = createHarness(t);
  const first = createProject(harness, "First project");
  const second = createProject(harness, "Second project");
  const started = harness.timer.start(first.id);

  const duplicate = harness.timer.start(second.id);

  assert.equal(duplicate.code, "TIMER_ALREADY_ACTIVE");
  assert.deepEqual(duplicate.state, started);
  assert.equal(harness.timer.getState().projectId, first.id);
  assert.equal(harness.db.prepare("SELECT COUNT(*) AS count FROM human_sessions").get().count, 1);
});

test("illegal pause, resume, and stop transitions preserve the persisted state", (t) => {
  const harness = createHarness(t);
  const project = createProject(harness);

  assert.deepEqual(harness.timer.pause(), { code: "TIMER_NOT_RUNNING", state: null });
  assert.deepEqual(harness.timer.resume(), { code: "TIMER_NOT_PAUSED", state: null });
  assert.deepEqual(harness.timer.stop(), { code: "TIMER_NOT_ACTIVE", state: null });
  harness.timer.start(project.id);
  const paused = harness.timer.pause();
  assert.deepEqual(harness.timer.pause(), { code: "TIMER_NOT_RUNNING", state: paused });
  const resumed = harness.timer.resume();
  assert.deepEqual(harness.timer.resume(), { code: "TIMER_NOT_PAUSED", state: resumed });
  assert.equal(harness.timer.getState().status, "running");
});

test("stopping persists completion notes", (t) => {
  const harness = createHarness(t);
  const project = createProject(harness);
  harness.timer.start(project.id);

  const completed = harness.timer.stop({ notes: "Implemented persistence" });

  assert.equal(completed.notes, "Implemented persistence");
  assert.equal(
    harness.db.prepare("SELECT notes FROM human_sessions WHERE id = ?").get(completed.id).notes,
    "Implemented persistence"
  );
});

test("a completed session frees the active timer slot for a new session", (t) => {
  const harness = createHarness(t);
  const first = createProject(harness, "First completed project");
  const second = createProject(harness, "Second active project");

  const completed = harness.timer.start(first.id);
  harness.timer.stop();
  const reopened = harness.timer.start(second.id);

  assert.notEqual(reopened.id, completed.id);
  assert.equal(reopened.projectId, second.id);
  assert.equal(harness.db.prepare("SELECT COUNT(*) AS count FROM human_sessions").get().count, 2);
});

test("elapsed and effective durations remain monotonic across persisted transitions", (t) => {
  const harness = createHarness(t);
  const project = createProject(harness);

  harness.timer.start(project.id);
  harness.clock.advance(10_000);
  const beforePause = harness.timer.getState();
  const paused = harness.timer.pause();
  harness.clock.advance(20_000);
  const duringPause = harness.timer.getState();
  const resumed = harness.timer.resume();
  harness.clock.advance(5_000);
  const afterResume = harness.timer.getState();

  assert.deepEqual(
    [beforePause.elapsedMs, paused.elapsedMs, duringPause.elapsedMs, resumed.elapsedMs, afterResume.elapsedMs],
    [10_000, 10_000, 10_000, 30_000, 35_000]
  );
  assert.deepEqual(
    [beforePause.effectiveMs, paused.effectiveMs, duringPause.effectiveMs, resumed.effectiveMs, afterResume.effectiveMs],
    [10_000, 10_000, 10_000, 10_000, 15_000]
  );
});

test("resuming closes the open interval and persists its aggregate pause duration", (t) => {
  const harness = createHarness(t);
  const project = createProject(harness);

  const started = harness.timer.start(project.id);
  harness.clock.advance(10_000);
  harness.timer.pause();
  harness.clock.advance(20_000);
  harness.timer.resume();
  const pause = harness.db.prepare(
    "SELECT started_at, ended_at FROM human_pause_intervals WHERE human_session_id = ?"
  ).get(started.id);
  const session = harness.db.prepare(
    "SELECT status, paused_at, accumulated_pause_ms FROM human_sessions WHERE id = ?"
  ).get(started.id);

  assert.deepEqual(pause, { started_at: 1_800_000_010_000, ended_at: 1_800_000_030_000 });
  assert.deepEqual(session, { status: "running", paused_at: null, accumulated_pause_ms: 20_000 });
});

test("changes publish committed serializable states", (t) => {
  const harness = createHarness(t);
  const project = createProject(harness);
  const changes = [];
  const timer = createHumanTimer({
    db: harness.db,
    now: harness.clock.now,
    createId: (() => {
      let nextId = 0;
      return () => `published-${++nextId}`;
    })(),
    projectRepository: harness.projectRepository,
    onChange: (state) => {
      assert.deepEqual(state, JSON.parse(JSON.stringify(state)));
      assert.equal(harness.db.prepare("SELECT status FROM human_sessions WHERE id = ?").get(state.id).status, state.status);
      changes.push(state.status);
    },
  });

  timer.start(project.id);
  timer.pause();
  timer.resume();
  timer.stop();

  assert.deepEqual(changes, ["running", "paused", "running", "completed"]);
});
