"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  TRAY_STATUS_ICONS,
  hasPendingTrayQuestion,
  resolveTrayStatus,
  shouldPulseTrayForAgentEvent,
  createTrayStatusLightController,
} = require("../src/tray-status-light");

class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.tasks = new Map();
  }

  setInterval = (handler, delay) => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + delay, handler, delay, repeat: true });
    return id;
  };

  clearInterval = (id) => {
    this.tasks.delete(id);
  };

  setTimeout = (handler, delay) => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + delay, handler, delay, repeat: false });
    return id;
  };

  clearTimeout = (id) => {
    this.tasks.delete(id);
  };

  tick(milliseconds) {
    const target = this.now + milliseconds;
    while (true) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!due) break;
      const [id, task] = due;
      this.now = task.at;
      if (task.repeat) task.at += task.delay;
      else this.tasks.delete(id);
      task.handler();
    }
    this.now = target;
  }
}

test("maps agent lifecycle states to the three light statuses", () => {
  assert.equal(resolveTrayStatus({ state: "idle" }), "idle");
  assert.equal(resolveTrayStatus({ state: "thinking" }), "working");
  assert.equal(resolveTrayStatus({ state: "working" }), "working");
  assert.equal(resolveTrayStatus({ state: "mini-working" }), "working");
  assert.equal(resolveTrayStatus({ state: "error" }), "error");
  assert.equal(resolveTrayStatus({ state: "error", hasPendingPermission: true }), "error");
  assert.equal(resolveTrayStatus({ state: "notification", hasPendingPermission: true }), "question");
  assert.equal(resolveTrayStatus({ state: "idle", hasPendingPermission: true }), "question");
  assert.equal(resolveTrayStatus({ state: "working", enabled: false }), "idle");
  assert.equal(resolveTrayStatus({ state: "idle", hasPendingPermission: true, enabled: false }), "idle");
});

test("treats native agent questions as pending yellow-light work", () => {
  assert.equal(hasPendingTrayQuestion([]), false);
  assert.equal(hasPendingTrayQuestion([null]), false);
  assert.equal(hasPendingTrayQuestion([{ isCodexUserInputNotify: true }]), true);
  assert.equal(hasPendingTrayQuestion([{ isCodexNotify: true }]), true);
  assert.equal(hasPendingTrayQuestion([{ isKimiNotify: true }]), true);
});

test("only fresh response events renew the green reminder", () => {
  assert.equal(shouldPulseTrayForAgentEvent({ state: "thinking", event: "UserPromptSubmit" }), true);
  assert.equal(shouldPulseTrayForAgentEvent({ state: "working", event: "PostToolUse" }), true);
  assert.equal(shouldPulseTrayForAgentEvent({ state: "working", event: "event_msg:agent_message" }), true);
  assert.equal(shouldPulseTrayForAgentEvent({ state: "working", event: "event_msg:token_count" }), false);
  assert.equal(shouldPulseTrayForAgentEvent({ state: "working", event: "Stop" }), false);
  assert.equal(shouldPulseTrayForAgentEvent({ state: "working", event: "SessionStart" }), false);
  assert.equal(shouldPulseTrayForAgentEvent({ state: "working", event: "PostToolUse", opts: { preserveState: true } }), false);
  assert.equal(shouldPulseTrayForAgentEvent({ state: "idle", event: "PostToolUse" }), false);
});

test("a visual working state alone does not start a green reminder", () => {
  const icons = [];
  const controller = createTrayStatusLightController({ setIcon: (icon) => icons.push(icon) });

  controller.setStatus("working");
  assert.deepEqual(icons, []);

  controller.activity("working");
  assert.deepEqual(icons, [TRAY_STATUS_ICONS.working]);
  controller.stop();
});

test("blinks the active live status on and off", () => {
  const clock = new FakeClock();
  const icons = [];
  const controller = createTrayStatusLightController({
    setIcon: (icon) => icons.push(icon),
    timers: clock,
    statusIntervalMs: 100,
  });

  controller.activity("working");
  clock.tick(100);
  clock.tick(100);

  assert.deepEqual(icons, [
    TRAY_STATUS_ICONS.working,
    TRAY_STATUS_ICONS.idle,
    TRAY_STATUS_ICONS.working,
  ]);
});

test("does not reset the blink phase for repeated updates of the same status", () => {
  const clock = new FakeClock();
  const icons = [];
  const controller = createTrayStatusLightController({
    setIcon: (icon) => icons.push(icon),
    timers: clock,
    statusIntervalMs: 100,
  });

  controller.activity("working");
  clock.tick(100);
  controller.setStatus("working");
  clock.tick(100);

  assert.deepEqual(icons, [
    TRAY_STATUS_ICONS.working,
    TRAY_STATUS_ICONS.idle,
    TRAY_STATUS_ICONS.working,
  ]);
});

test("click acknowledges the current reminder until a new response arrives", () => {
  const clock = new FakeClock();
  const icons = [];
  const controller = createTrayStatusLightController({
    setIcon: (icon) => icons.push(icon),
    timers: clock,
    statusIntervalMs: 100,
  });

  controller.activity("working");
  controller.acknowledge();
  controller.setStatus("working");
  clock.tick(100);
  assert.deepEqual(icons, [TRAY_STATUS_ICONS.working, TRAY_STATUS_ICONS.idle]);

  controller.activity("working");
  clock.tick(100);

  assert.deepEqual(icons, [
    TRAY_STATUS_ICONS.working,
    TRAY_STATUS_ICONS.idle,
    TRAY_STATUS_ICONS.working,
    TRAY_STATUS_ICONS.idle,
  ]);
});

test("acknowledging a pending question stays quiet through status refreshes", () => {
  const clock = new FakeClock();
  const icons = [];
  const controller = createTrayStatusLightController({
    setIcon: (icon) => icons.push(icon),
    timers: clock,
    statusIntervalMs: 100,
  });

  controller.setStatus("question");
  controller.acknowledge();
  controller.setStatus("question");
  clock.tick(500);

  assert.deepEqual(icons, [TRAY_STATUS_ICONS.question, TRAY_STATUS_ICONS.idle]);
});

test("green reminder expires after output goes quiet and does not restart from stale state", () => {
  const clock = new FakeClock();
  const icons = [];
  const controller = createTrayStatusLightController({
    setIcon: (icon) => icons.push(icon),
    timers: clock,
    statusIntervalMs: 100,
    activityTimeoutMs: 250,
  });

  controller.activity("working");
  clock.tick(250);
  const countAfterQuiet = icons.length;
  assert.equal(icons.at(-1), TRAY_STATUS_ICONS.idle);
  controller.setStatus("working");
  clock.tick(1000);
  assert.equal(icons.length, countAfterQuiet);

  controller.activity("working");
  assert.equal(icons.at(-1), TRAY_STATUS_ICONS.working);
});

test("new activity renews the green reminder's quiet deadline", () => {
  const clock = new FakeClock();
  const icons = [];
  const controller = createTrayStatusLightController({
    setIcon: (icon) => icons.push(icon),
    timers: clock,
    statusIntervalMs: 100,
    activityTimeoutMs: 250,
  });

  controller.activity("working");
  clock.tick(200);
  controller.activity("working");
  clock.tick(200);
  assert.equal(controller.getPhase(), "blinking");
  clock.tick(50);
  assert.equal(controller.getPhase(), "quiet");
  assert.equal(icons.at(-1), TRAY_STATUS_ICONS.idle);
});

test("acknowledging a completion prevents its remaining colors", () => {
  const clock = new FakeClock();
  const icons = [];
  const controller = createTrayStatusLightController({
    setIcon: (icon) => icons.push(icon),
    timers: clock,
    completionIntervalMs: 100,
    completionDurationMs: 300,
  });

  controller.complete();
  controller.acknowledge();
  controller.setStatus("idle");
  controller.complete();
  clock.tick(1000);
  assert.deepEqual(icons, [TRAY_STATUS_ICONS.working, TRAY_STATUS_ICONS.idle]);
  controller.activity("working");
  assert.equal(icons.at(-1), TRAY_STATUS_ICONS.working);
});

test("clicking an idle icon does not silence a future completion", () => {
  const clock = new FakeClock();
  const icons = [];
  const controller = createTrayStatusLightController({
    setIcon: (icon) => icons.push(icon),
    timers: clock,
    completionIntervalMs: 100,
    completionDurationMs: 300,
  });

  controller.acknowledge();
  controller.complete();
  assert.equal(icons.at(-1), TRAY_STATUS_ICONS.working);
});

test("cycles green, yellow, and red after completion, then turns the light off", () => {
  const clock = new FakeClock();
  const icons = [];
  const controller = createTrayStatusLightController({
    setIcon: (icon) => icons.push(icon),
    timers: clock,
    completionIntervalMs: 100,
    completionDurationMs: 300,
  });

  controller.complete();
  assert.deepEqual(icons, [TRAY_STATUS_ICONS.working]);

  clock.tick(100);
  clock.tick(100);
  clock.tick(100);

  assert.deepEqual(icons, [
    TRAY_STATUS_ICONS.working,
    TRAY_STATUS_ICONS.question,
    TRAY_STATUS_ICONS.error,
    TRAY_STATUS_ICONS.idle,
  ]);
});

test("a new live state interrupts the completion cycle", () => {
  const clock = new FakeClock();
  const icons = [];
  const controller = createTrayStatusLightController({
    setIcon: (icon) => icons.push(icon),
    timers: clock,
    completionIntervalMs: 100,
    completionDurationMs: 500,
  });

  controller.complete();
  clock.tick(100);
  controller.setStatus("error");
  clock.tick(50);

  assert.deepEqual(icons, [
    TRAY_STATUS_ICONS.working,
    TRAY_STATUS_ICONS.question,
    TRAY_STATUS_ICONS.error,
  ]);
});
