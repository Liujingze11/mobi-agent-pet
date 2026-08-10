"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const test = require("node:test");

const { createManagerWindowController } = require("../../runtime/agentlog/manager/window.cjs");

class FakeBrowserWindow extends EventEmitter {
  static instances = [];

  static reset() {
    FakeBrowserWindow.instances = [];
  }

  constructor(options) {
    super();
    this.options = options;
    this.destroyed = false;
    this.hideCalls = 0;
    this.showCalls = 0;
    this.focusCalls = 0;
    this.loadFileCalls = [];
    FakeBrowserWindow.instances.push(this);
  }

  loadFile(filePath) {
    this.loadFileCalls.push(filePath);
  }

  show() {
    this.showCalls += 1;
  }

  hide() {
    this.hideCalls += 1;
  }

  focus() {
    this.focusCalls += 1;
  }

  isDestroyed() {
    return this.destroyed;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit("closed");
  }
}

function createController() {
  FakeBrowserWindow.reset();
  return createManagerWindowController({
    app: {},
    BrowserWindow: FakeBrowserWindow,
    preloadPath: "/app/runtime/agentlog/manager/preload.cjs",
    rendererPath: "/app/dist/manager/index.html",
  });
}

test("show creates one secure manager window and waits for ready-to-show", () => {
  const controller = createController();

  const first = controller.show();

  assert.equal(FakeBrowserWindow.instances.length, 1);
  assert.equal(first.options.width, 1180);
  assert.equal(first.options.height, 760);
  assert.equal(first.options.minWidth, 900);
  assert.equal(first.options.minHeight, 620);
  assert.equal(first.options.title, "AgentLog Pet");
  assert.equal(first.options.show, false);
  assert.equal(first.options.backgroundColor, "#171918");
  assert.deepEqual(first.options.webPreferences, {
    preload: "/app/runtime/agentlog/manager/preload.cjs",
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  });
  assert.deepEqual(first.loadFileCalls, ["/app/dist/manager/index.html"]);
  assert.equal(first.showCalls, 0);
  assert.equal(first.focusCalls, 0);

  first.emit("ready-to-show");

  assert.equal(first.showCalls, 1);
  assert.equal(first.focusCalls, 1);
  assert.equal(controller.getWindow(), first);
});

test("show reuses one manager window and close hides it", () => {
  const controller = createController();
  const first = controller.show();
  first.emit("ready-to-show");
  const closeEvent = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };

  first.emit("close", closeEvent);

  assert.equal(closeEvent.defaultPrevented, true);
  assert.equal(first.hideCalls, 1);
  assert.equal(controller.show(), first);
  assert.equal(first.showCalls, 2);
  assert.equal(first.focusCalls, 2);
  assert.equal(FakeBrowserWindow.instances.length, 1);
});

test("destroy only tears down the living manager window once", () => {
  const controller = createController();
  const first = controller.show();
  first.emit("ready-to-show");

  controller.destroy();
  controller.destroy();

  assert.equal(first.destroyed, true);
  assert.equal(first.hideCalls, 0);
  assert.equal(controller.getWindow(), null);
  assert.equal(controller.show(), null);
  assert.equal(FakeBrowserWindow.instances.length, 1);
});

test("show replaces a manager window that Electron already destroyed", () => {
  const controller = createController();
  const first = controller.show();
  first.destroy();

  const replacement = controller.show();

  assert.notEqual(replacement, first);
  assert.equal(FakeBrowserWindow.instances.length, 2);
  assert.equal(replacement.loadFileCalls[0], path.join("/app", "dist", "manager", "index.html"));
});
