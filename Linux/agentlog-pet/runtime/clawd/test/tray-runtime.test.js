"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createTrayRuntime,
  resolveLinuxTrayResources,
} = require("../src/tray-runtime");

function snapshot(label) {
  return {
    items: [{ kind: "item", id: label, label }],
    commands: { has: () => true, execute: () => true },
  };
}

function createBackend(kind) {
  let active = false;
  let menuOpened = () => {};
  const events = [];
  return {
    kind,
    events,
    start(nextSnapshot) {
      active = true;
      events.push(["start", nextSnapshot]);
    },
    replaceMenu(nextSnapshot) {
      events.push(["replace", nextSnapshot]);
    },
    setAttention(activeAttention) {
      events.push(["attention", activeAttention]);
    },
    stop() {
      active = false;
      events.push(["stop"]);
    },
    isActive: () => active,
    getHealth: () => ({ status: active ? "native" : "starting", code: null }),
    getNativeTray: () => ({ kind }),
    onMenuOpened(handler) {
      menuOpened = handler;
    },
    openMenu() {
      menuOpened();
    },
  };
}

function createHarness(platform) {
  const created = [];
  const runtime = createTrayRuntime({
    platform,
    app: { isPackaged: false, getAppPath: () => "/repo/app" },
    path,
    process: { resourcesPath: "/resources", env: {} },
    createLinuxTraySupervisor(options) {
      const backend = createBackend("linux");
      created.push({ kind: "linux", backend, options });
      return backend;
    },
    createElectronTrayBackend(options) {
      const backend = createBackend("electron");
      created.push({ kind: "electron", backend, options });
      return backend;
    },
    Tray: function Tray() {},
    Menu: {},
    nativeImage: {
      createFromPath() {
        return {
          resize() { return this; },
          isEmpty: () => false,
        };
      },
    },
    spawn: () => {},
    fs: { existsSync: () => true },
  });
  return { runtime, created };
}

test("resolves Linux tray resources from app resources only when packaged", () => {
  const development = resolveLinuxTrayResources({
    app: { isPackaged: false, getAppPath: () => "/repo/app" },
    path,
    process: { resourcesPath: "/bundle/resources" },
  });
  const packaged = resolveLinuxTrayResources({
    app: { isPackaged: true, getAppPath: () => "/repo/app" },
    path,
    process: { resourcesPath: "/bundle/resources" },
  });

  assert.deepEqual(development, {
    helperPath: "/repo/app/build/tray/bin/agentlog-tray",
    iconThemeRoot: "/repo/app/build/tray/icons/hicolor",
  });
  assert.deepEqual(packaged, {
    helperPath: "/bundle/resources/tray/bin/agentlog-tray",
    iconThemeRoot: "/bundle/resources/tray/icons/hicolor",
  });
});

test("uses one Linux supervisor and replaces its active menu snapshot", async () => {
  const { runtime, created } = createHarness("linux");
  const initial = snapshot("Initial");
  const updated = snapshot("Updated");

  await runtime.start(initial);
  await runtime.start(initial);
  await runtime.replaceMenu(updated);

  assert.equal(created.filter((entry) => entry.kind === "linux").length, 1);
  assert.equal(created.filter((entry) => entry.kind === "electron").length, 1);
  assert.deepEqual(created.find((entry) => entry.kind === "linux").backend.events, [
    ["start", initial],
    ["replace", initial],
    ["replace", updated],
  ]);
});

test("uses the Electron backend outside Linux and clears it on stop", async () => {
  const { runtime, created } = createHarness("win32");

  await runtime.start(snapshot("Initial"));
  await runtime.stop();
  await runtime.stop();

  assert.equal(created.length, 1);
  assert.equal(created[0].kind, "electron");
  assert.deepEqual(created[0].backend.events.map(([event]) => event), ["start", "stop"]);
  assert.equal(runtime.getNativeTray(), null);
});

test("waits for a backend to stop before creating a replacement", async () => {
  const { runtime, created } = createHarness("linux");
  await runtime.start(snapshot("Initial"));
  const first = created.find((entry) => entry.kind === "linux").backend;
  let releaseStop;
  first.stop = () => new Promise((resolve) => { releaseStop = resolve; });

  const stopping = runtime.stop();
  const restarting = runtime.start(snapshot("Replacement"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(created.filter((entry) => entry.kind === "linux").length, 1);
  releaseStop();
  await Promise.all([stopping, restarting]);
  assert.equal(created.filter((entry) => entry.kind === "linux").length, 2);
});

test("forwards menu opening to the registered attention reset handler", async () => {
  const { runtime, created } = createHarness("linux");
  let opened = 0;
  runtime.onMenuOpened(() => { opened += 1; });

  await runtime.start(snapshot("Initial"));
  created.find((entry) => entry.kind === "linux").backend.openMenu();

  assert.equal(opened, 1);
});

test("does not create a backend when attention changes before startup", async () => {
  const { runtime, created } = createHarness("linux");

  await runtime.setAttention(true);
  await runtime.setAttention(false);

  assert.equal(created.length, 0);
});

test("exposes a Linux native tray only while the Electron fallback is active", async () => {
  const { runtime, created } = createHarness("linux");

  await runtime.start(snapshot("Initial"));
  assert.equal(runtime.getNativeTray(), null);
  const fallback = created.find((entry) => entry.kind === "electron").backend;
  await fallback.start(snapshot("Fallback"));
  assert.deepEqual(runtime.getNativeTray(), { kind: "electron" });
});

test("main delegates tray attention without directly mutating a tray icon", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");

  assert.doesNotMatch(source, /\btray\.setImage\(/);
  assert.match(source, /_menu\.setTrayAttention\(active\)/);
});
