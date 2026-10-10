"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveRecoveredClaudeFocus } = require("../src/session-recovered-focus");

function procStat(pid, name, parentPid, startTicks) {
  const fields = Array(20).fill("0");
  fields[0] = "S";
  fields[1] = String(parentPid);
  fields[19] = String(startTicks);
  return `${pid} (${name}) ${fields.join(" ")}`;
}

function fakeProc(entries) {
  return (file) => {
    if (!Object.hasOwn(entries, file)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
    return entries[file];
  };
}

test("recovered Claude in a VS Code terminal locates its live shell without using GNOME Shell", () => {
  const readFileSync = fakeProc({
    "/proc/23820/stat": procStat(23820, "claude", 23600, 777),
    "/proc/23600/stat": procStat(23600, "bash", 3961, 600),
    "/proc/3961/stat": procStat(3961, "code", 2288, 500),
    "/proc/2288/stat": procStat(2288, "gnome-shell", 1879, 100),
  });
  assert.deepStrictEqual(resolveRecoveredClaudeFocus({
    agentId: "claude-code", pid: 23820, processStartIdentity: "linux:777",
  }, { platform: "linux", readFileSync }), {
    sourcePid: 23820,
    editor: "code",
    pidChain: [23820, 23600, 3961],
  });
});

test("recovered Claude rejects a reused agent PID", () => {
  const readFileSync = fakeProc({
    "/proc/23820/stat": procStat(23820, "claude", 23600, 778),
    "/proc/23600/stat": procStat(23600, "bash", 3961, 600),
    "/proc/3961/stat": procStat(3961, "code", 2288, 500),
  });
  assert.strictEqual(resolveRecoveredClaudeFocus({
    agentId: "claude-code", pid: 23820, processStartIdentity: "linux:777",
  }, { platform: "linux", readFileSync }), null);
});

test("recovered Claude does not mistake GNOME Shell for an editor terminal", () => {
  const readFileSync = fakeProc({
    "/proc/23820/stat": procStat(23820, "claude", 23600, 777),
    "/proc/23600/stat": procStat(23600, "bash", 2288, 600),
    "/proc/2288/stat": procStat(2288, "gnome-shell", 1879, 100),
  });
  assert.strictEqual(resolveRecoveredClaudeFocus({
    agentId: "claude-code", pid: 23820, processStartIdentity: "linux:777",
  }, { platform: "linux", readFileSync }), null);
});

test("recovered Claude in an independent terminal keeps a window focus path", () => {
  const readFileSync = fakeProc({
    "/proc/510/stat": procStat(510, "claude", 500, 777),
    "/proc/500/stat": procStat(500, "zsh", 490, 600),
    "/proc/490/stat": procStat(490, "gnome-terminal-server", 1, 500),
  });
  assert.deepStrictEqual(resolveRecoveredClaudeFocus({
    agentId: "claude-code", pid: 510, processStartIdentity: "linux:777",
  }, { platform: "linux", readFileSync }), {
    sourcePid: 510,
    editor: null,
    pidChain: [510, 500, 490],
  });
});
