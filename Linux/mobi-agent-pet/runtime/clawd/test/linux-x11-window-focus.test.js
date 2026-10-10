"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  findProcessWindow,
  focusLinuxX11Window,
} = require("../src/linux-x11-window-focus");

const processes = new Map([
  [23820, { name: "claude", parentPid: 23600 }],
  [23600, { name: "bash", parentPid: 3961 }],
  [3961, { name: "code", parentPid: 3536 }],
  [3536, { name: "code", parentPid: 2288 }],
  [2288, { name: "gnome-shell", parentPid: 1879 }],
]);

test("locates the editor window owning a recovered Claude terminal", () => {
  const window = findProcessWindow({ sourcePid: 23820, pidChain: [23820, 23600, 3961] }, {
    readProcess: (pid) => processes.get(pid) || null,
    windows: [
      { id: 0x140002b, pid: 133097 },
      { id: 0x600004, pid: 3536 },
    ],
  });
  assert.deepStrictEqual(window, { id: 0x600004, pid: 3536 });
});

test("never selects GNOME Shell or an unrelated window", () => {
  const window = findProcessWindow({ sourcePid: 2288 }, {
    readProcess: (pid) => processes.get(pid) || null,
    windows: [
      { id: 1, pid: 2288 },
      { id: 2, pid: 133097 },
    ],
  });
  assert.strictEqual(window, null);
});

test("locates an independent terminal window using process ancestry", () => {
  const terminalProcesses = new Map([
    [410, { name: "zsh", parentPid: 400 }],
    [400, { name: "gnome-terminal-server", parentPid: 1 }],
  ]);
  assert.deepStrictEqual(findProcessWindow({ sourcePid: 410 }, {
    readProcess: (pid) => terminalProcesses.get(pid) || null,
    windows: [{ id: 0x800001, pid: 400 }],
  }), { id: 0x800001, pid: 400 });
});

test("locates a Cursor window using the same process path", () => {
  const cursorProcesses = new Map([
    [510, { name: "claude", parentPid: 500 }],
    [500, { name: "bash", parentPid: 490 }],
    [490, { name: "cursor", parentPid: 480 }],
    [480, { name: "cursor", parentPid: 1 }],
  ]);
  assert.deepStrictEqual(findProcessWindow({ sourcePid: 510, pidChain: [510, 500, 490] }, {
    readProcess: (pid) => cursorProcesses.get(pid) || null,
    windows: [{ id: 0x900001, pid: 480 }],
  }), { id: 0x900001, pid: 480 });
});

test("sends an X11 activation request for the matched window", () => {
  let activated = null;
  const result = focusLinuxX11Window({ sourcePid: 23820, pidChain: [23820, 23600, 3961] }, {
    readProcess: (pid) => processes.get(pid) || null,
    x11: {
      listWindows: () => [{ id: 0x600004, pid: 3536 }],
      activateWindow: (id) => { activated = id; return true; },
    },
  });
  assert.strictEqual(activated, 0x600004);
  assert.deepStrictEqual(result, { submitted: true, windowId: 0x600004 });
});
