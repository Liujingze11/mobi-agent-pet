"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { stopChild, stopPid } = require("../../scripts/smoke-process.cjs");

test("stopChild waits for process exit before allowing temporary-home cleanup", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.killCalls = [];
  child.kill = (signal) => {
    child.killCalls.push(signal);
    return true;
  };

  let settled = false;
  const stopped = stopChild(child).then(() => {
    settled = true;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(child.killCalls, ["SIGTERM"]);
  assert.equal(settled, false);

  child.exitCode = 0;
  child.emit("exit", 0);
  await stopped;
  assert.equal(settled, true);
});

test("stopChild does nothing when the process has already exited", async () => {
  const child = new EventEmitter();
  child.exitCode = 0;
  child.kill = () => {
    throw new Error("kill must not be called");
  };

  await stopChild(child);
});

test("stopPid waits for the ready payload process to stop", async () => {
  let running = true;
  const signals = [];
  const kill = (pid, signal) => {
    if (signal === "SIGTERM") {
      signals.push([pid, signal]);
      return;
    }
    if (signal === 0 && running) return;
    const error = new Error("process not found");
    error.code = "ESRCH";
    throw error;
  };

  let settled = false;
  const stopped = stopPid(4242, { kill, pollMs: 1 }).then(() => {
    settled = true;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(signals, [[4242, "SIGTERM"]]);
  assert.equal(settled, false);

  running = false;
  await stopped;
  assert.equal(settled, true);
});
