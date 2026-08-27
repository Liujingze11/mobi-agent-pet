"use strict";

const assert = require("node:assert");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const { createLinuxTraySupervisor } = require("../src/linux-tray-supervisor");

const ICON_THEME_ROOT = "/opt/agentlog/tray/icons/hicolor";

async function settle() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.tasks = new Map();
    this.scheduledDelays = [];
  }

  setTimeout = (handler, delay) => {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, { at: this.now + delay, handler, delay });
    this.scheduledDelays.push(delay);
    return id;
  };

  clearTimeout = (id) => {
    this.tasks.delete(id);
  };

  async tick(milliseconds) {
    const target = this.now + milliseconds;
    while (true) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!due) break;
      const [id, task] = due;
      this.tasks.delete(id);
      this.now = task.at;
      task.handler();
      await settle();
    }
    this.now = target;
    await settle();
  }

  pendingDelays() {
    return [...this.tasks.values()].map((task) => task.at - this.now).sort((a, b) => a - b);
  }
}

class FakeChild extends EventEmitter {
  constructor({ exitOnShutdown = true, exitOnKill = true, killReturnsFalse = false } = {}) {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.writes = [];
    this.kills = [];
    this.exited = false;
    this.stdinEnded = false;
    this.exitOnShutdown = exitOnShutdown;
    this.exitOnKill = exitOnKill;
    this.killReturnsFalse = killReturnsFalse;
    this.stdin = new EventEmitter();
    this.stdin.write = (chunk) => {
      const message = JSON.parse(Buffer.from(chunk).toString("utf8"));
      this.writes.push(message);
      if (message.type === "shutdown" && this.exitOnShutdown) {
        queueMicrotask(() => this.exit(0, null));
      }
      return true;
    };
    this.stdin.end = () => {
      this.stdinEnded = true;
    };
  }

  send(message) {
    this.stdout.emit("data", Buffer.from(`${JSON.stringify(message)}\n`, "utf8"));
  }

  sendRaw(value) {
    this.stdout.emit("data", Buffer.from(value, "utf8"));
  }

  endStdout() {
    this.stdout.emit("end");
  }

  exit(code = 0, signal = null) {
    if (this.exited) return;
    this.exited = true;
    this.emit("exit", code, signal);
  }

  kill(signal) {
    this.kills.push(signal);
    if (this.exitOnKill) queueMicrotask(() => this.exit(null, signal));
    return !this.killReturnsFalse;
  }
}

function makeRouter(ids, executed) {
  const allowed = new Set(ids);
  return {
    has: (id) => allowed.has(id),
    execute(id) {
      executed.push(id);
      return true;
    },
  };
}

function makeSnapshot(label, ids = ["settings.open"], executed = []) {
  return {
    items: ids.map((id) => ({ kind: "command", id, label })),
    commands: makeRouter(ids, executed),
  };
}

function createHarness(options = {}) {
  const clock = new FakeClock();
  const children = [];
  const fallbackEvents = [];
  let fallbackActive = false;
  let fallbackMenuOpened = () => {};
  let fallbackStartFailures = options.fallbackStartFailures || 0;
  let currentSnapshot = options.snapshot || makeSnapshot("Settings");

  function nativeRunning() {
    return children.some((child) => !child.exited && !child.killReturnsFalse);
  }

  function assertOneBackend() {
    assert.ok(!(nativeRunning() && fallbackActive), "only one tray backend may be active");
  }

  const fallback = {
    async start(snapshot) {
      assert.strictEqual(nativeRunning(), false, "native helper must stop before fallback starts");
      fallbackEvents.push({ type: "start", snapshot });
      if (fallbackStartFailures > 0) {
        fallbackStartFailures -= 1;
        throw new Error("fallback unavailable");
      }
      fallbackActive = true;
      assertOneBackend();
    },
    replaceMenu(snapshot) {
      fallbackEvents.push({ type: "replace-menu", snapshot });
    },
    setAttention(active) {
      fallbackEvents.push({ type: "attention", active });
    },
    async stop() {
      fallbackEvents.push({ type: "stop" });
      fallbackActive = false;
      assertOneBackend();
    },
    isActive() {
      return fallbackActive;
    },
    onMenuOpened(handler) {
      fallbackMenuOpened = handler;
    },
    openMenu() {
      fallbackMenuOpened();
    },
  };

  const spawnCalls = [];
  const spawn = (file, args, spawnOptions) => {
    assert.strictEqual(fallbackActive, false, "fallback must stop before native helper spawns");
    if (options.spawnError) throw options.spawnError;
    const childOptions = typeof options.childOptions === "function"
      ? options.childOptions(children.length)
      : options.childOptions;
    const child = new FakeChild(childOptions);
    children.push(child);
    spawnCalls.push({ file, args, options: spawnOptions });
    assertOneBackend();
    return child;
  };

  const supervisor = createLinuxTraySupervisor({
    spawn,
    helperPath: "/opt/agentlog/tray/bin/agentlog-tray",
    iconThemeRoot: ICON_THEME_ROOT,
    sessionType: options.sessionType || "wayland",
    fallback,
    timers: clock,
    getMenuSnapshot: async () => currentSnapshot,
  });

  return {
    supervisor,
    clock,
    children,
    fallback,
    fallbackEvents,
    spawnCalls,
    assertOneBackend,
    setSnapshot(snapshot) {
      currentSnapshot = snapshot;
    },
  };
}

async function emit(harness, child, message) {
  child.send(message);
  await settle();
  harness.assertOneBackend();
}

async function becomeNative(harness, child = harness.children.at(-1)) {
  await emit(harness, child, { version: 1, type: "ready", backend: "ayatana" });
  assert.deepStrictEqual(harness.supervisor.getHealth(), { status: "starting", code: null });
  await emit(harness, child, {
    version: 1,
    type: "host-status",
    watcher: true,
    registered: true,
  });
  assert.deepStrictEqual(harness.supervisor.getHealth(), { status: "native", code: null });
}

test("maps inactive lifecycle health to the public starting status", async () => {
  const harness = createHarness();

  assert.deepStrictEqual(harness.supervisor.getHealth(), { status: "starting", code: null });
  await harness.supervisor.start(makeSnapshot("Settings"));
  await becomeNative(harness);
  await harness.supervisor.stop();

  assert.deepStrictEqual(harness.supervisor.getHealth(), { status: "starting", code: null });
});

test("starts native only after separate ready and registered messages and owns revisions", async () => {
  const harness = createHarness();
  const initial = makeSnapshot("Settings");

  await harness.supervisor.start(initial);
  harness.assertOneBackend();

  assert.deepStrictEqual(harness.supervisor.getHealth(), { status: "starting", code: null });
  assert.strictEqual(harness.children.length, 1);
  assert.deepStrictEqual(harness.spawnCalls[0], {
    file: "/opt/agentlog/tray/bin/agentlog-tray",
    args: [],
    options: { stdio: ["pipe", "pipe", "ignore"], shell: false },
  });
  assert.deepStrictEqual(harness.children[0].writes[0], {
    version: 1,
    type: "init",
    revision: 0,
    productId: "com.agentlog.pet",
    tooltip: "AgentLog Pet",
    iconThemeRoot: ICON_THEME_ROOT,
    icon: "agentlog-pet",
    items: initial.items,
  });

  await becomeNative(harness);

  const replacement = makeSnapshot("Preferences", ["settings.preferences"]);
  await harness.supervisor.replaceMenu(replacement);
  await harness.supervisor.setAttention(true);
  harness.assertOneBackend();

  assert.deepStrictEqual(harness.children[0].writes.slice(1), [
    { version: 1, type: "replace-menu", revision: 1, items: replacement.items },
    { version: 1, type: "set-icon", revision: 1, icon: "agentlog-pet-attention" },
  ]);
  await harness.supervisor.stop();
});

test("falls back after the two-second startup timeout and malformed helper output", async () => {
  const timeoutHarness = createHarness();
  await timeoutHarness.supervisor.start(makeSnapshot("Settings"));

  await timeoutHarness.clock.tick(1999);
  assert.deepStrictEqual(timeoutHarness.supervisor.getHealth(), { status: "starting", code: null });
  await timeoutHarness.clock.tick(1);
  timeoutHarness.assertOneBackend();
  assert.deepStrictEqual(timeoutHarness.supervisor.getHealth(), {
    status: "electron-fallback",
    code: "native-startup-timeout",
  });
  assert.strictEqual(timeoutHarness.fallback.isActive(), true);
  assert.deepStrictEqual(timeoutHarness.clock.pendingDelays(), [250]);
  await timeoutHarness.supervisor.stop();

  const malformedHarness = createHarness();
  await malformedHarness.supervisor.start(makeSnapshot("Settings"));
  malformedHarness.children[0].sendRaw("{not-json}\n");
  await settle();
  malformedHarness.assertOneBackend();
  assert.deepStrictEqual(malformedHarness.supervisor.getHealth(), {
    status: "electron-fallback",
    code: "native-protocol-error",
  });
  await malformedHarness.supervisor.stop();
});

test("restarts unexpected exits after 250, 1000, and 3000 ms then keeps fallback", async () => {
  const harness = createHarness();
  await harness.supervisor.start(makeSnapshot("Settings"));
  await becomeNative(harness);

  const delays = [250, 1000, 3000];
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    harness.children.at(-1).exit(1, null);
    await settle();
    harness.assertOneBackend();
    assert.deepStrictEqual(harness.supervisor.getHealth(), {
      status: "electron-fallback",
      code: "native-helper-exited",
    });
    assert.deepStrictEqual(harness.clock.pendingDelays(), [delays[attempt]]);

    await harness.clock.tick(delays[attempt] - 1);
    assert.strictEqual(harness.children.length, attempt + 1);
    await harness.clock.tick(1);
    harness.assertOneBackend();
    assert.strictEqual(harness.children.length, attempt + 2);
    assert.strictEqual(harness.fallback.isActive(), false);
    await becomeNative(harness);
  }

  harness.children.at(-1).exit(1, null);
  await settle();
  harness.assertOneBackend();
  assert.strictEqual(harness.children.length, 4);
  assert.deepStrictEqual(harness.clock.pendingDelays(), []);
  assert.deepStrictEqual(harness.supervisor.getHealth(), {
    status: "electron-fallback",
    code: "native-helper-exited",
  });
  assert.deepStrictEqual(
    harness.clock.scheduledDelays.filter((delay) => delays.includes(delay)),
    delays
  );
  await harness.supervisor.stop();
});

test("enters failed when restart budget and Electron fallback are both unavailable", async () => {
  const harness = createHarness({ fallbackStartFailures: 4 });
  await harness.supervisor.start(makeSnapshot("Settings"));

  for (const delay of [250, 1000, 3000]) {
    harness.children.at(-1).exit(1, null);
    await settle();
    await harness.clock.tick(delay);
    harness.assertOneBackend();
  }
  harness.children.at(-1).exit(1, null);
  await settle();

  assert.deepStrictEqual(harness.supervisor.getHealth(), {
    status: "failed",
    code: "tray-backends-unavailable",
  });
  assert.strictEqual(harness.fallback.isActive(), false);
  assert.deepStrictEqual(harness.clock.pendingDelays(), []);
  await harness.supervisor.stop();
});

test("uses Electron for an X11 no-host result and reports no-host on Wayland", async () => {
  const x11 = createHarness({ sessionType: "x11" });
  let x11Opened = 0;
  x11.supervisor.onMenuOpened(() => { x11Opened += 1; });
  await x11.supervisor.start(makeSnapshot("Settings"));
  await emit(x11, x11.children[0], { version: 1, type: "ready", backend: "ayatana" });
  await emit(x11, x11.children[0], {
    version: 1,
    type: "host-status",
    watcher: true,
    registered: false,
  });
  assert.deepStrictEqual(x11.supervisor.getHealth(), {
    status: "electron-fallback",
    code: "status-notifier-host-missing",
  });
  x11.fallback.openMenu();
  assert.strictEqual(x11Opened, 1);
  await x11.supervisor.stop();

  const wayland = createHarness({ sessionType: "wayland" });
  await wayland.supervisor.start(makeSnapshot("Settings"));
  await emit(wayland, wayland.children[0], { version: 1, type: "ready", backend: "ayatana" });
  await emit(wayland, wayland.children[0], {
    version: 1,
    type: "host-status",
    watcher: false,
    registered: false,
  });
  assert.deepStrictEqual(wayland.supervisor.getHealth(), {
    status: "no-host",
    code: "status-notifier-host-missing",
  });
  assert.strictEqual(wayland.fallback.isActive(), false);
  await wayland.supervisor.stop();
});

test("applies a no-host result that arrives before the helper is ready", async () => {
  const harness = createHarness({ sessionType: "wayland" });
  await harness.supervisor.start(makeSnapshot("Settings"));

  await emit(harness, harness.children[0], {
    version: 1,
    type: "host-status",
    watcher: false,
    registered: false,
  });
  assert.deepStrictEqual(harness.supervisor.getHealth(), { status: "starting", code: null });

  await emit(harness, harness.children[0], { version: 1, type: "ready", backend: "ayatana" });
  assert.deepStrictEqual(harness.supervisor.getHealth(), {
    status: "no-host",
    code: "status-notifier-host-missing",
  });
  assert.strictEqual(harness.fallback.isActive(), false);
  assert.deepStrictEqual(harness.clock.pendingDelays(), []);
  await harness.supervisor.stop();
});

test("debounces host loss, cancels it on recovery, and ignores stale child events", async () => {
  const harness = createHarness({ sessionType: "wayland" });
  await harness.supervisor.start(makeSnapshot("Settings"));
  const first = harness.children[0];
  await becomeNative(harness, first);

  await emit(harness, first, {
    version: 1,
    type: "host-status",
    watcher: true,
    registered: false,
  });
  await harness.clock.tick(249);
  assert.deepStrictEqual(harness.supervisor.getHealth(), { status: "native", code: null });
  await emit(harness, first, {
    version: 1,
    type: "host-status",
    watcher: true,
    registered: true,
  });
  await harness.clock.tick(1);
  assert.deepStrictEqual(harness.supervisor.getHealth(), { status: "native", code: null });

  first.exit(1, null);
  await settle();
  await harness.clock.tick(250);
  const second = harness.children[1];
  await becomeNative(harness, second);

  first.sendRaw("{not-json}\n");
  first.send({ version: 1, type: "host-status", watcher: false, registered: false });
  first.send({ version: 1, type: "ready", backend: "stale" });
  await settle();
  harness.assertOneBackend();
  assert.deepStrictEqual(harness.supervisor.getHealth(), { status: "native", code: null });

  await emit(harness, second, {
    version: 1,
    type: "host-status",
    watcher: false,
    registered: false,
  });
  await harness.clock.tick(250);
  harness.assertOneBackend();
  assert.deepStrictEqual(harness.supervisor.getHealth(), {
    status: "no-host",
    code: "status-notifier-host-missing",
  });
  await harness.supervisor.stop();
});

test("handles current stdin EPIPE and ignores stale stdin errors", async () => {
  const harness = createHarness();
  await harness.supervisor.start(makeSnapshot("Settings"));
  const first = harness.children[0];
  await becomeNative(harness, first);

  const epipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
  assert.doesNotThrow(() => first.stdin.emit("error", epipe));
  await settle();
  harness.assertOneBackend();
  assert.deepStrictEqual(harness.supervisor.getHealth(), {
    status: "electron-fallback",
    code: "native-helper-error",
  });

  await harness.clock.tick(250);
  const second = harness.children[1];
  await becomeNative(harness, second);
  assert.doesNotThrow(() => first.stdin.emit("error", epipe));
  await settle();
  harness.assertOneBackend();
  assert.deepStrictEqual(harness.supervisor.getHealth(), { status: "native", code: null });
  await harness.supervisor.stop();
});

test("rejects stale and unknown commands, dispatches current commands, and forwards menu-opened", async () => {
  const oldExecutions = [];
  const currentExecutions = [];
  const freshExecutions = [];
  const harness = createHarness();
  const initial = makeSnapshot("Old", ["old.command"], oldExecutions);
  const current = makeSnapshot("Current", ["current.command"], currentExecutions);
  const fresh = makeSnapshot("Fresh", ["fresh.command"], freshExecutions);
  let opened = 0;
  harness.supervisor.onMenuOpened(() => { opened += 1; });

  await harness.supervisor.start(initial);
  await becomeNative(harness);
  await harness.supervisor.replaceMenu(current);
  harness.setSnapshot(fresh);

  await emit(harness, harness.children[0], {
    version: 1,
    type: "command",
    revision: 0,
    id: "old.command",
  });
  await emit(harness, harness.children[0], {
    version: 1,
    type: "command",
    revision: 1,
    id: "unknown.command",
  });
  assert.deepStrictEqual(oldExecutions, []);
  assert.deepStrictEqual(currentExecutions, []);

  await emit(harness, harness.children[0], {
    version: 1,
    type: "command",
    revision: 1,
    id: "current.command",
  });
  assert.deepStrictEqual(currentExecutions, ["current.command"]);
  assert.deepStrictEqual(harness.children[0].writes.at(-1), {
    version: 1,
    type: "replace-menu",
    revision: 2,
    items: fresh.items,
  });

  await emit(harness, harness.children[0], { version: 1, type: "menu-opened" });
  assert.strictEqual(opened, 1);
  await harness.supervisor.stop();
});

test("treats clean helper stdout EOF as failure and falls back", async () => {
  const harness = createHarness();
  await harness.supervisor.start(makeSnapshot("Settings"));
  await becomeNative(harness);

  harness.children[0].endStdout();
  await settle();
  harness.assertOneBackend();

  assert.deepStrictEqual(harness.supervisor.getHealth(), {
    status: "electron-fallback",
    code: "native-helper-eof",
  });
  await harness.supervisor.stop();
});

test("shuts down gracefully and sends SIGTERM only after the 750 ms deadline", async () => {
  const graceful = createHarness();
  await graceful.supervisor.start(makeSnapshot("Settings"));
  await becomeNative(graceful);
  await graceful.supervisor.stop();
  assert.deepStrictEqual(graceful.children[0].writes.at(-1), { version: 1, type: "shutdown" });
  assert.strictEqual(graceful.children[0].stdinEnded, true);
  assert.deepStrictEqual(graceful.children[0].kills, []);
  graceful.assertOneBackend();

  const forced = createHarness({ childOptions: { exitOnShutdown: false, exitOnKill: true } });
  await forced.supervisor.start(makeSnapshot("Settings"));
  await becomeNative(forced);
  const stopping = forced.supervisor.stop();
  await settle();
  await forced.clock.tick(749);
  assert.deepStrictEqual(forced.children[0].kills, []);
  await forced.clock.tick(1);
  await stopping;

  assert.deepStrictEqual(forced.children[0].writes.at(-1), { version: 1, type: "shutdown" });
  assert.strictEqual(forced.children[0].stdinEnded, true);
  assert.deepStrictEqual(forced.children[0].kills, ["SIGTERM"]);
  assert.strictEqual(forced.fallback.isActive(), false);
  forced.assertOneBackend();
});

test("falls back when a failed helper spawn cannot emit an exit event", async () => {
  const harness = createHarness({
    childOptions: { exitOnShutdown: false, exitOnKill: false, killReturnsFalse: true },
  });
  const starting = harness.supervisor.start(makeSnapshot("Settings"));
  await settle();

  harness.children[0].emit("error", new Error("spawn ENOENT"));
  await settle();
  await harness.clock.tick(750);
  await starting;

  assert.deepStrictEqual(harness.supervisor.getHealth(), {
    status: "electron-fallback",
    code: "native-helper-error",
  });
  assert.deepStrictEqual(harness.children[0].kills, ["SIGTERM"]);
  await harness.supervisor.stop();
});
