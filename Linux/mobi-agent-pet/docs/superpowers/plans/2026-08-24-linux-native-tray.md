# Linux Native Tray Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Electron's unreliable temporary-file Linux tray path with an AgentLog-owned Ayatana AppIndicator helper while preserving the approved menu, attention state, fallback behavior, and single-application experience.

**Architecture:** The Electron main process owns a serializable tray menu model and command router. A Linux-only supervisor starts a small GTK3/Ayatana helper over private JSON Lines pipes, selects exactly one tray backend, and exposes redacted health. Electron Tray remains the fallback; the pet context menu remains inside Electron.

**Tech Stack:** Electron 41, Node.js CommonJS, Node test runner, C11, GTK3, libayatana-appindicator3, json-glib, GDBus, electron-builder, Vitest/React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-24-linux-native-tray-design.md`

## Development Handoff Scope - 2026-09-14

The user approved deferring the external desktop matrix to pre-release work.
Task 9 is now tracked as local development acceptance plus remaining release
validation. The local fixes and package probes may be handed off without
claiming that untested desktop rows passed or blocking unrelated feature work.
See `docs/verification/2026-09-14-linux-tray-local-handoff.md` for current
evidence and remaining checks. Original release requirements below are retained.

## Global Constraints

- Linux x64 is the only new native build target in this plan.
- Keep one user-facing application, one desktop launcher, and no helper desktop entry.
- Keep the pet right-click menu in `runtime/clawd/src/menu.js`; only the system tray uses the new backend abstraction.
- Never write GNOME `custom-icons`, install a Shell extension, restart a panel, or depend on a user-specific path.
- Never activate the native helper and Electron Tray at the same time.
- Keep project recording, timing, summaries, Agent integrations, and pet rendering alive when tray setup fails.
- Treat helper stdout as an untrusted bounded protocol. Do not send callbacks, paths other than the packaged icon root, settings objects, or shell commands.
- Use stable error codes in diagnostics. Do not expose helper stderr, D-Bus unique names, home paths, or temporary paths.
- Remove the diagnostic `custom-icons` override before desktop verification.
- Run each task's focused tests before its commit and run the complete verification set in Task 9.

## File Structure

Create these product-owned modules:

```text
runtime/clawd/src/
  tray-menu-model.js          # Serializable menu descriptors and command router
  tray-electron-backend.js    # Electron Tray fallback adapter
  linux-tray-protocol.js      # JSON Lines framing and message validation
  linux-tray-supervisor.js    # Helper lifecycle and backend selection
  tray-runtime.js             # One-backend facade consumed by main/menu

native/agentlog-tray/
  Makefile                    # Reproducible C build and unit-test targets
  README.md                   # Build dependencies and protocol invocation
  src/main.c                  # GTK/AppIndicator helper
  test/protocol-test.c        # Native parser and limit tests
  test/status-notifier-host.c # Isolated D-Bus watcher fixture
  test/dbus-integration.sh    # Helper registration/activation harness

assets/tray-icons/hicolor/
  16x16/status/*.png
  22x22/status/*.png
  32x32/status/*.png
  48x48/status/*.png

scripts/
  build-linux-tray-helper.cjs # Build helper and collect AppImage-side libraries
  verify-linux-tray-bundle.cjs# Verify binary, icons, protocol, and shared libraries
```

Add focused tests beside the existing Node suites:

```text
runtime/clawd/test/tray-menu-model.test.js
runtime/clawd/test/tray-electron-backend.test.js
runtime/clawd/test/linux-tray-protocol.test.js
runtime/clawd/test/linux-tray-supervisor.test.js
runtime/clawd/test/tray-runtime.test.js
test/agentlog/linux-tray-package.test.cjs
```

Modify these ownership points:

```text
runtime/clawd/src/menu.js
runtime/clawd/src/main.js
runtime/clawd/src/tray-flash-icon.js
runtime/agentlog/app-runtime.cjs
runtime/agentlog/manager/ipc.cjs
src/manager/types.ts
src/manager/pages/SettingsPage.tsx
src/manager/__tests__/App.test.tsx
test/agentlog/manager-ipc.test.cjs
scripts/build-linux.cjs
scripts/smoke-linux.cjs
package.json
README.md
runtime/clawd/docs/guides/known-limitations.zh-CN.md
```

---

## Task 1: Extract the Serializable Tray Menu and Command Router

**Interfaces**

- Produces `createTrayMenuModel(ctx, t) -> { items, commands }`.
- `items` contains only `id`, `kind`, `label`, `enabled`, `checked`, and `items`.
- `commands.execute(id)` invokes an existing parent-process action and returns `false` for an unknown ID.
- Consumes the existing `_menuCtx` action surface; it does not read Electron classes.

**Files**

- Create: `runtime/clawd/src/tray-menu-model.js`
- Create: `runtime/clawd/test/tray-menu-model.test.js`
- Modify: `runtime/clawd/src/menu.js`
- Test: `runtime/clawd/test/menu-hide-pet.test.js`

- [ ] **Step 1: Write failing model and routing tests**

Cover the exact quick-menu order and stable IDs:

```js
const EXPECTED_COMMAND_IDS = [
  "mode.normal",
  "mode.background",
  "mode.automatic",
  "agentlog.open",
  "dashboard.open",
  "pet.primary-display",
  "startup.toggle",
  "settings.open",
  "settings.agents",
  "updates.action",
  "pet.toggle",
  "app.quit",
];
```

Assert that normal/background/automatic are radio items, custom mode entries remain disabled, separators contain no `id`, localized labels come from `t`, and `JSON.stringify(items)` succeeds. Assert that executing `mode.automatic`, `startup.toggle`, `updates.action`, and `app.quit` calls the supplied parent actions exactly once. Assert that `commands.execute("unknown")` returns `false`.

- [ ] **Step 2: Run the focused test and observe the missing-module failure**

```bash
cd /home/ljz/Jingze/OPC/DevPulse_AI/Linux/agentlog-pet
node --test runtime/clawd/test/tray-menu-model.test.js
```

Expected: FAIL with `Cannot find module '../src/tray-menu-model'`.

- [ ] **Step 3: Implement the descriptor builder and closed command router**

Use a frozen descriptor vocabulary and a private handler map:

```js
"use strict";

function createCommandRouter(entries) {
  const handlers = new Map(entries);
  return Object.freeze({
    has: (id) => handlers.has(id),
    execute(id) {
      const handler = handlers.get(id);
      if (!handler) return false;
      handler();
      return true;
    },
  });
}

function createTrayMenuModel(ctx, t) {
  const update = typeof ctx.getUpdateMenuItem === "function"
    ? ctx.getUpdateMenuItem()
    : null;
  const entries = [
    ["mode.normal", () => ctx.requestAppMode("normal")],
    ["mode.background", () => ctx.requestAppMode("background")],
    ["mode.automatic", () => ctx.requestAppMode("automatic")],
    ["agentlog.open", () => ctx.openAgentLogManager()],
    ["dashboard.open", () => ctx.openDashboard()],
    ["pet.primary-display", () => ctx.bringPetToPrimaryDisplay()],
    ["startup.toggle", () => { ctx.openAtLogin = !ctx.openAtLogin; }],
    ["settings.open", () => ctx.openSettingsWindow()],
    ["settings.agents", () => ctx.openSettingsTab("agents")],
    ["updates.action", () => { if (update && update.click) update.click(); }],
    ["pet.toggle", () => ctx.togglePetVisibility()],
    ["app.quit", () => ctx.requestAppQuit()],
  ];
  return { items: buildItems(ctx, t, update), commands: createCommandRouter(entries) };
}

module.exports = { createCommandRouter, createTrayMenuModel };
```

`buildItems` must emit the approved groups from `menu.js` with one separator between non-empty groups. Do not include callback functions in the descriptor tree. Keep macOS menu-bar and Dock options on the existing Electron-only path because this plan changes Linux only.

- [ ] **Step 4: Render the Electron template from the model inside `menu.js`**

Add a local recursive conversion that binds only stable IDs:

```js
function toElectronTemplate(items, commands) {
  return items.map((item) => {
    if (item.kind === "separator") return { type: "separator" };
    const rendered = {
      label: item.label,
      enabled: item.enabled !== false,
    };
    if (item.kind === "checkbox" || item.kind === "radio") {
      rendered.type = item.kind;
      rendered.checked = item.checked === true;
    }
    if (item.kind === "submenu") {
      rendered.submenu = toElectronTemplate(item.items, commands);
    } else if (item.id) {
      rendered.click = () => commands.execute(item.id);
    }
    return rendered;
  });
}
```

Expose `requestAppMode` and `requestAppQuit` to the model through a narrow context object. Keep `buildContextMenu()` unchanged.

- [ ] **Step 5: Run menu tests**

```bash
node --test runtime/clawd/test/tray-menu-model.test.js runtime/clawd/test/menu-hide-pet.test.js
```

Expected: PASS; existing tray labels and pet context behavior remain covered.

- [ ] **Step 6: Commit the extraction**

```bash
git -C /home/ljz/Jingze/OPC/DevPulse_AI add Linux/agentlog-pet/runtime/clawd/src/tray-menu-model.js \
  Linux/agentlog-pet/runtime/clawd/src/menu.js \
  Linux/agentlog-pet/runtime/clawd/test/tray-menu-model.test.js \
  Linux/agentlog-pet/runtime/clawd/test/menu-hide-pet.test.js
git -C /home/ljz/Jingze/OPC/DevPulse_AI commit -m "refactor: extract serializable tray menu"
```

---

## Task 2: Add the Electron Tray Fallback Adapter

**Interfaces**

- Produces `createElectronTrayBackend(deps)` with `start(snapshot)`, `replaceMenu(snapshot)`, `setAttention(active)`, `stop()`, `isActive()`, and `onMenuOpened(handler)`.
- Consumes Electron `Tray`, `Menu`, `nativeImage`, normal/attention asset paths, tooltip, and command dispatch callback.
- Never owns app settings or business actions.

**Files**

- Create: `runtime/clawd/src/tray-electron-backend.js`
- Create: `runtime/clawd/test/tray-electron-backend.test.js`
- Modify: `runtime/clawd/src/menu.js`
- Modify: `runtime/clawd/src/tray-flash-icon.js`

- [ ] **Step 1: Write failing adapter tests with fake Electron classes**

Assert start creates one Tray, sets `AgentLog Pet` tooltip, renders nested radio/checkbox state, routes a click ID, emits menu-opened from click/right-click events, alternates stable-sized normal/attention images, makes repeated start idempotent, and destroys the Tray once on stop.

- [ ] **Step 2: Run the focused test and observe failure**

```bash
node --test runtime/clawd/test/tray-electron-backend.test.js
```

Expected: FAIL because `tray-electron-backend.js` does not exist.

- [ ] **Step 3: Implement the adapter state machine**

Use one private tray reference and reject operations after stop:

```js
function createElectronTrayBackend({ Tray, Menu, normalIcon, attentionIcon, tooltip, dispatch }) {
  let tray = null;
  let opened = () => {};
  return {
    start(snapshot) {
      if (tray) return;
      tray = new Tray(normalIcon);
      tray.setToolTip(tooltip);
      tray.on("click", () => opened());
      tray.on("right-click", () => opened());
      this.replaceMenu(snapshot);
    },
    replaceMenu(snapshot) {
      if (!tray) return;
      tray.setContextMenu(Menu.buildFromTemplate(render(snapshot.items, dispatch)));
    },
    setAttention(active) {
      if (tray) tray.setImage(active ? attentionIcon : normalIcon);
    },
    onMenuOpened(handler) { opened = handler; },
    isActive() { return tray !== null; },
    stop() {
      if (!tray) return;
      tray.destroy();
      tray = null;
    },
    getNativeTray() { return tray; },
  };
}
```

Make `loadTrayNormalIcon` and `loadTrayFlashIcon` the sole Electron image loaders. Their output sizes must match in the existing `tray-flash-icon.test.js`.

- [ ] **Step 4: Make `menu.js` delegate Electron tray ownership to the adapter**

`createTray`, `destroyTray`, and `buildTrayMenu` remain exported for the settings effect router, but call adapter methods. Preserve `getTray()` during this task for existing `main.js` callers.

- [ ] **Step 5: Run focused and regression tests**

```bash
node --test runtime/clawd/test/tray-electron-backend.test.js \
  runtime/clawd/test/tray-flash-icon.test.js \
  runtime/clawd/test/menu-hide-pet.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the fallback adapter**

```bash
git -C /home/ljz/Jingze/OPC/DevPulse_AI add Linux/agentlog-pet/runtime/clawd/src/tray-electron-backend.js \
  Linux/agentlog-pet/runtime/clawd/src/menu.js \
  Linux/agentlog-pet/runtime/clawd/src/tray-flash-icon.js \
  Linux/agentlog-pet/runtime/clawd/test/tray-electron-backend.test.js
git -C /home/ljz/Jingze/OPC/DevPulse_AI commit -m "refactor: isolate Electron tray fallback"
```

---

## Task 3: Implement the Bounded JSON Lines Protocol

**Interfaces**

- Produces `encodeMessage(message) -> Buffer` and `createLineDecoder(options) -> { push(chunk), end() }`.
- Produces `validateParentMessage(value)` and `validateHelperMessage(value)` returning frozen normalized objects or throwing `TrayProtocolError(code)`.
- Uses protocol version `1`, maximum line size `65536` bytes, depth `3`, menu items `64`, label length `160`, and command ID length `80`.

**Files**

- Create: `runtime/clawd/src/linux-tray-protocol.js`
- Create: `runtime/clawd/test/linux-tray-protocol.test.js`

- [ ] **Step 1: Write failing framing and validation tests**

Cover split UTF-8 chunks, multiple lines in one chunk, final incomplete input, malformed JSON, oversized lines, unknown message types, wrong protocol versions, stale/negative revisions, menu depth/item/label limits, duplicate command IDs, and forbidden descriptor keys such as `click` and `path`.

- [ ] **Step 2: Run the focused test and observe failure**

```bash
node --test runtime/clawd/test/linux-tray-protocol.test.js
```

Expected: FAIL because the protocol module does not exist.

- [ ] **Step 3: Implement byte-bounded framing before JSON parsing**

```js
const LIMITS = Object.freeze({
  lineBytes: 65536,
  menuDepth: 3,
  menuItems: 64,
  labelChars: 160,
  commandIdChars: 80,
});

function encodeMessage(message) {
  const line = Buffer.from(`${JSON.stringify(message)}\n`, "utf8");
  if (line.length > LIMITS.lineBytes) throw new TrayProtocolError("line-too-large");
  return line;
}
```

The decoder stores `Buffer` chunks, searches for byte `0x0a`, rejects a buffered line before it exceeds the limit, parses only complete UTF-8 lines, and reports `incomplete-line` from `end()`.

- [ ] **Step 4: Implement explicit message schemas**

Accept only:

```js
const PARENT_TYPES = new Set(["init", "replace-menu", "set-icon", "shutdown"]);
const HELPER_TYPES = new Set(["ready", "host-status", "menu-opened", "command", "error", "stopped"]);
const ICON_NAMES = new Set(["agentlog-pet", "agentlog-pet-attention"]);
const ITEM_KINDS = new Set(["command", "checkbox", "radio", "submenu", "separator"]);
```

Copy accepted primitive fields into new objects; never return the input object unchanged. Require safe integer revisions from `0` through `Number.MAX_SAFE_INTEGER`.

- [ ] **Step 5: Run the protocol tests**

```bash
node --test runtime/clawd/test/linux-tray-protocol.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the protocol**

```bash
git -C /home/ljz/Jingze/OPC/DevPulse_AI add Linux/agentlog-pet/runtime/clawd/src/linux-tray-protocol.js \
  Linux/agentlog-pet/runtime/clawd/test/linux-tray-protocol.test.js
git -C /home/ljz/Jingze/OPC/DevPulse_AI commit -m "feat: define Linux tray helper protocol"
```

---

## Task 4: Build the Native Ayatana AppIndicator Helper

**Interfaces**

- Executable path in development: `native/agentlog-tray/build/agentlog-tray`.
- Packaged path: `process.resourcesPath/tray/bin/agentlog-tray`.
- Reads protocol v1 JSON Lines from stdin and writes helper messages to stdout.
- Uses stderr only for bounded developer logs; the parent never exposes it to diagnostics.

**Files**

- Create: `native/agentlog-tray/src/main.c`
- Create: `native/agentlog-tray/test/protocol-test.c`
- Create: `native/agentlog-tray/test/status-notifier-host.c`
- Create: `native/agentlog-tray/test/dbus-integration.sh`
- Create: `native/agentlog-tray/Makefile`
- Create: `native/agentlog-tray/README.md`
- Create: `scripts/build-linux-tray-helper.cjs`

- [ ] **Step 1: Add native parser tests before helper behavior**

Use GLib's test runner to verify protocol version, icon allowlist, revision bounds, descriptor limits, duplicate IDs, stale `replace-menu`, and shutdown parsing. Compile the same validation functions into the test binary by defining `AGENTLOG_TRAY_TEST` to omit `main()`.

- [ ] **Step 2: Add deterministic Makefile targets**

```make
PKGS := gtk+-3.0 ayatana-appindicator3-0.1 json-glib-1.0
CFLAGS += -std=c11 -Wall -Wextra -Werror -O2 $(shell pkg-config --cflags $(PKGS))
LDLIBS += $(shell pkg-config --libs $(PKGS))

all: build/agentlog-tray

build/agentlog-tray: src/main.c
	@mkdir -p build
	$(CC) $(CFLAGS) -Wl,-rpath,'$$ORIGIN/../lib' -o $@ $< $(LDLIBS)

build/protocol-test: src/main.c test/protocol-test.c
	@mkdir -p build
	$(CC) $(CFLAGS) -DAGENTLOG_TRAY_TEST -o $@ $^ $(LDLIBS)

build/status-notifier-host: test/status-notifier-host.c
	@mkdir -p build
	$(CC) $(CFLAGS) -o $@ $< $(LDLIBS)

test: build/protocol-test
	./build/protocol-test

clean:
	rm -rf build
```

- [ ] **Step 3: Run the native test target and observe the first failure**

```bash
make -C native/agentlog-tray test
```

Expected before implementation: compile failure for missing validator symbols. If development headers are absent, install `build-essential pkg-config libgtk-3-dev libayatana-appindicator3-dev libjson-glib-dev` in the build environment, then rerun the same command.

- [ ] **Step 4: Implement validated input and parent-owned lifetime**

The helper state must be explicit:

```c
typedef struct {
  guint64 menu_revision;
  guint64 icon_revision;
  AppIndicator *indicator;
  GtkWidget *menu;
  gchar *icon_theme_root;
  GHashTable *command_ids;
  GIOChannel *stdin_channel;
} AgentLogTrayState;
```

Set `prctl(PR_SET_PDEATHSIG, SIGTERM)` on Linux, compare `getppid()` before and after, attach a GLib watch to stdin, exit on EOF, and handle `shutdown` by emitting `stopped` before `gtk_main_quit()`.

- [ ] **Step 5: Implement stable AppIndicator registration and menu reconstruction**

Initialize exactly one indicator:

```c
state.indicator = app_indicator_new(
  "com.agentlog.pet.tray",
  "agentlog-pet",
  APP_INDICATOR_CATEGORY_APPLICATION_STATUS
);
app_indicator_set_icon_theme_path(state.indicator, state.icon_theme_root);
app_indicator_set_status(state.indicator, APP_INDICATOR_STATUS_ACTIVE);
app_indicator_set_menu(state.indicator, GTK_MENU(state.menu));
```

Build `GtkMenuItem`, `GtkCheckMenuItem`, radio groups, separators, and nested submenus only from normalized descriptors. Store each command ID with `g_object_set_data_full`; for a revision-7 Settings click, activation emits `{"version":1,"type":"command","revision":7,"id":"settings.open"}`. Menu map/unmap signals emit one `menu-opened` event per opening.

- [ ] **Step 6: Probe the StatusNotifier host with GDBus**

Query session-bus owner for `org.kde.StatusNotifierWatcher`, then read `IsStatusNotifierHostRegistered`. Emit:

```json
{"version":1,"type":"host-status","watcher":true,"registered":true}
```

Subscribe to owner and property changes, debounce reprobes by 250 ms, and never include a unique bus name. Emit `ready` only after GTK/AppIndicator initialization; host status follows as a separate message.

- [ ] **Step 7: Add an isolated D-Bus registration and activation harness**

`status-notifier-host.c` owns `org.kde.StatusNotifierWatcher` on `/StatusNotifierWatcher`, exposes `IsStatusNotifierHostRegistered=true`, records `RegisterStatusNotifierItem`, and invokes one registered menu command through the exported DBusMenu interface. `dbus-integration.sh` starts that fixture and the helper under an isolated session bus and virtual X server, sends an `init` menu containing `settings.open`, and asserts the helper emits `ready`, registered `host-status`, and the command event.

Add the Make target:

```make
integration-test: build/agentlog-tray build/status-notifier-host
	xvfb-run -a dbus-run-session -- ./test/dbus-integration.sh
```

The script uses a private temporary directory, has a 10-second timeout, kills both child processes on `EXIT`, and fails if the helper writes an unrecognized protocol line.

- [ ] **Step 8: Make the Node build wrapper fail clearly and record checksums**

`build-linux-tray-helper.cjs` runs `make clean all test`, verifies an ELF x86-64 executable with `file`, copies it to `build/tray/bin/agentlog-tray`, writes SHA-256 to `build/tray/SHA256SUMS`, and returns non-zero when pkg-config dependencies or expected symbols are missing. Spawn commands as argument arrays with `shell: false`.

- [ ] **Step 9: Run native verification**

```bash
make -C native/agentlog-tray clean test
make -C native/agentlog-tray integration-test
node scripts/build-linux-tray-helper.cjs --development
printf '%s\n' '{"version":1,"type":"shutdown"}' | xvfb-run -a native/agentlog-tray/build/agentlog-tray
```

Expected: native tests PASS; the helper emits a bounded protocol response and exits without leaving a process.

- [ ] **Step 10: Commit the helper source and build tooling**

```bash
git -C /home/ljz/Jingze/OPC/DevPulse_AI add Linux/agentlog-pet/native/agentlog-tray \
  Linux/agentlog-pet/scripts/build-linux-tray-helper.cjs
git -C /home/ljz/Jingze/OPC/DevPulse_AI commit -m "feat: add native Linux tray helper"
```

---

## Task 5: Supervise the Helper and Select One Backend

**Interfaces**

- Produces `createLinuxTraySupervisor(deps)` with `start(snapshot)`, `replaceMenu(snapshot)`, `setAttention(active)`, `stop()`, `getHealth()`, and `onMenuOpened(handler)`.
- Consumes a spawn function, helper/icon paths, session type, fallback backend, command dispatcher, timers, and protocol codec.
- Health is `{ status, code }`, where status is `starting`, `native`, `electron-fallback`, `no-host`, or `failed`.

**Files**

- Create: `runtime/clawd/src/linux-tray-supervisor.js`
- Create: `runtime/clawd/test/linux-tray-supervisor.test.js`

- [ ] **Step 1: Write state-machine tests with a fake child process**

Use fake stdin/stdout streams and fake timers. Cover: native ready plus registered host; two-second startup timeout; malformed helper output; helper exit and delays of 250/1000/3000 ms; three-restart budget; X11 no-host fallback; Wayland no-host without Electron fallback; host loss and recovery debounce; stale command rejection; menu-opened callback; graceful shutdown followed by SIGTERM timeout; and helper EOF.

At every transition assert:

```js
assert.ok(!(nativeRunning && fallback.isActive()), "only one tray backend may be active");
```

- [ ] **Step 2: Run the focused test and observe failure**

```bash
node --test runtime/clawd/test/linux-tray-supervisor.test.js
```

Expected: FAIL because the supervisor module does not exist.

- [ ] **Step 3: Implement the finite states and health codes**

```js
const STATES = Object.freeze({
  STOPPED: "stopped",
  STARTING: "starting",
  NATIVE: "native",
  FALLBACK: "electron-fallback",
  NO_HOST: "no-host",
  FAILED: "failed",
});

const RESTART_DELAYS_MS = Object.freeze([250, 1000, 3000]);
const STARTUP_TIMEOUT_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 750;
```

Centralize transitions in `transition(next, code)`. `startFallback()` must await `stopNative()` first. `spawnNative()` must stop an active fallback before spawning. All child listeners carry a generation number so late events from a previous process cannot alter current state.

- [ ] **Step 4: Implement revisions and command authority**

Increment menu and icon revisions in the parent. Retain the command router paired with each current menu revision. Dispatch only when the helper command revision equals the current revision and `router.has(id)` is true. After command execution, request and send a fresh menu snapshot.

- [ ] **Step 5: Implement host policy exactly**

- Native `ready` plus `registered:true`: state `native`.
- Startup/helper failure: stop native, start Electron fallback, state `electron-fallback`, retain a safe native error code.
- X11 `registered:false`: stop native, start Electron fallback.
- Wayland `registered:false`: stop native and fallback, state `no-host`, code `status-notifier-host-missing`.
- Restart budget exhausted and fallback start fails: state `failed`, code `tray-backends-unavailable`.

- [ ] **Step 6: Run supervisor tests**

```bash
node --test runtime/clawd/test/linux-tray-supervisor.test.js \
  runtime/clawd/test/linux-tray-protocol.test.js
```

Expected: PASS with no open handles.

- [ ] **Step 7: Commit the supervisor**

```bash
git -C /home/ljz/Jingze/OPC/DevPulse_AI add Linux/agentlog-pet/runtime/clawd/src/linux-tray-supervisor.js \
  Linux/agentlog-pet/runtime/clawd/test/linux-tray-supervisor.test.js
git -C /home/ljz/Jingze/OPC/DevPulse_AI commit -m "feat: supervise Linux tray backends"
```

---

## Task 6: Integrate the Tray Runtime into the Main Process

**Interfaces**

- Produces `createTrayRuntime(deps)`, the only object allowed to own a tray backend.
- `menu.js` supplies current `{ items, commands }` snapshots.
- `main.js` calls `setAttention(true|false)` instead of calling Electron `tray.setImage()`.
- Second-instance launcher activation opens/focuses AgentLog Manager.

**Files**

- Create: `runtime/clawd/src/tray-runtime.js`
- Create: `runtime/clawd/test/tray-runtime.test.js`
- Modify: `runtime/clawd/src/menu.js`
- Modify: `runtime/clawd/src/main.js`
- Modify: `runtime/clawd/test/menu-hide-pet.test.js`
- Modify: `scripts/smoke-linux.cjs`

- [ ] **Step 1: Write failing facade and integration tests**

Assert Linux selects the supervisor, non-Linux selects Electron, repeated create is idempotent, destroy clears one backend, menu rebuild replaces the active backend snapshot, menu opening stops attention, and attention updates never create a backend. Add a source-level regression assertion that `main.js` no longer calls `tray.setImage`.

- [ ] **Step 2: Extend the smoke fixture for launcher recovery**

In smoke mode, log this line when the second instance focuses the manager:

```text
AGENTLOG_SMOKE_MANAGER_ACTIVATED
```

Make `scripts/smoke-linux.cjs` wait for the marker from the first process after the second process exits. This fails until main-process activation is changed.

- [ ] **Step 3: Run tests and observe the expected failures**

```bash
node --test runtime/clawd/test/tray-runtime.test.js
node --test test/agentlog/smoke-process.test.cjs
```

Expected: facade module missing and launcher marker absent.

- [ ] **Step 4: Implement the one-backend facade and resource resolution**

Development paths resolve from the repository. Packaged paths resolve only from `process.resourcesPath`:

```js
function resolveLinuxTrayResources({ app, path }) {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "tray")
    : path.join(app.getAppPath(), "build", "tray");
  return {
    helperPath: path.join(root, "bin", "agentlog-tray"),
    iconThemeRoot: path.join(root, "icons", "hicolor"),
  };
}
```

Expose `getNativeTray()` only for Windows-specific balloon compatibility; on Linux it returns the fallback's native Tray only when fallback is active.

- [ ] **Step 5: Replace direct tray image flashing in `main.js`**

Keep the existing duration and mode-policy checks, but toggle the runtime:

```js
function stopTrayFlash() {
  clearTrayFlashTimers();
  if (_menu && _menu.setTrayAttention) _menu.setTrayAttention(false);
}

function flashTaskbar() {
  if (!resolveEffectiveTrayFlashEnabled(
    _settingsController.get("flashTaskbarOnComplete"),
    getEffectiveAppModePolicy()
  )) return;
  startTrayFlashTimer((active) => _menu.setTrayAttention(active));
}
```

Do not attach temporary click listeners in `flashTaskbar`; register `onMenuOpened(stopTrayFlash)` once during tray initialization.

- [ ] **Step 6: Open AgentLog Manager on launcher reactivation**

In `app.on("second-instance")`, preserve import and explicit settings arguments, restore the pet as today, then call `agentLogApp.openManager()` when no settings/import argument consumed activation. In smoke mode emit the marker after the manager is opened.

- [ ] **Step 7: Start and stop the runtime with Electron lifecycle**

Start after `app.whenReady()` and after the initial menu snapshot exists. Await `trayRuntime.stop()` from `before-quit`; ensure forced process exit paths also terminate the helper. Keep settings-effect `createTray`/`destroyTray` calls mapped to runtime start/stop.

- [ ] **Step 8: Run integration tests**

```bash
node --test runtime/clawd/test/tray-runtime.test.js \
  runtime/clawd/test/menu-hide-pet.test.js \
  runtime/clawd/test/tray-flash-icon.test.js
npm run smoke:linux
```

Expected: PASS; the second instance exits and the first reports manager activation.

- [ ] **Step 9: Commit the runtime integration**

```bash
git -C /home/ljz/Jingze/OPC/DevPulse_AI add Linux/agentlog-pet/runtime/clawd/src/tray-runtime.js \
  Linux/agentlog-pet/runtime/clawd/src/menu.js \
  Linux/agentlog-pet/runtime/clawd/src/main.js \
  Linux/agentlog-pet/runtime/clawd/test/tray-runtime.test.js \
  Linux/agentlog-pet/runtime/clawd/test/menu-hide-pet.test.js \
  Linux/agentlog-pet/scripts/smoke-linux.cjs
git -C /home/ljz/Jingze/OPC/DevPulse_AI commit -m "feat: use supervised Linux tray runtime"
```

---

## Task 7: Expose Redacted Tray Diagnostics

**Interfaces**

- `app-runtime.getHealth()` adds `tray: { status, code }` through an injected provider.
- IPC permits only known status/code strings.
- Renderer type is `TrayDiagnostics`, and Settings shows one concise English row.

**Files**

- Modify: `runtime/agentlog/app-runtime.cjs`
- Modify: `runtime/agentlog/manager/ipc.cjs`
- Modify: `runtime/clawd/src/main.js`
- Modify: `src/manager/types.ts`
- Modify: `src/manager/pages/SettingsPage.tsx`
- Modify: `test/agentlog/app-runtime.test.cjs`
- Modify: `test/agentlog/manager-ipc.test.cjs`
- Modify: `src/manager/__tests__/App.test.tsx`

- [ ] **Step 1: Write failing runtime, redaction, and UI tests**

Assert defaults to `{ status: "starting", code: null }`, native/fallback/no-host/failed states pass through, unknown status becomes `failed`, arbitrary helper text and path fields are removed, and Settings renders:

```text
Native tray active
Electron tray fallback active
No tray host detected
Tray backend failed (tray-backends-unavailable)
```

- [ ] **Step 2: Run the focused tests and observe missing fields**

```bash
node --test test/agentlog/app-runtime.test.cjs test/agentlog/manager-ipc.test.cjs
npx vitest run --config vitest.manager.config.ts src/manager/__tests__/App.test.tsx
```

Expected: FAIL because health has no tray member and the UI has no Tray row.

- [ ] **Step 3: Inject health instead of importing the tray into AgentLog storage**

Add a setter at the app boundary:

```js
let trayHealthProvider = () => ({ status: "starting", code: null });

function setTrayHealthProvider(provider) {
  trayHealthProvider = typeof provider === "function"
    ? provider
    : () => ({ status: "starting", code: null });
}

function getHealth() {
  return { storage, databaseName, errorMessage, tray: trayHealthProvider() };
}
```

Register `() => trayRuntime.getHealth()` from `main.js`. Do not make storage initialization depend on tray initialization.

- [ ] **Step 4: Redact against fixed allowlists in IPC**

```js
const TRAY_STATUSES = new Set([
  "starting", "native", "electron-fallback", "no-host", "failed",
]);
const TRAY_CODES = new Set([
  "native-start-timeout",
  "native-protocol-error",
  "native-helper-missing",
  "native-helper-exited",
  "status-notifier-host-missing",
  "electron-fallback-failed",
  "tray-backends-unavailable",
]);
```

Unknown codes become `null`; unknown status becomes `failed`. Return no other tray fields.

- [ ] **Step 5: Add the typed Settings row**

```ts
export type TrayStatus =
  | "starting"
  | "native"
  | "electron-fallback"
  | "no-host"
  | "failed";

export type TrayDiagnostics = { status: TrayStatus; code: string | null };
```

Map status to visible English copy in `SettingsPage.tsx`; show the safe code only for `failed`. Keep the existing Storage and Database rows.

- [ ] **Step 6: Run diagnostics tests and typecheck**

```bash
node --test test/agentlog/app-runtime.test.cjs test/agentlog/manager-ipc.test.cjs
npx vitest run --config vitest.manager.config.ts src/manager/__tests__/App.test.tsx
npm run typecheck:manager
```

Expected: PASS.

- [ ] **Step 7: Commit diagnostics**

```bash
git -C /home/ljz/Jingze/OPC/DevPulse_AI add Linux/agentlog-pet/runtime/agentlog/app-runtime.cjs \
  Linux/agentlog-pet/runtime/agentlog/manager/ipc.cjs \
  Linux/agentlog-pet/runtime/clawd/src/main.js \
  Linux/agentlog-pet/src/manager/types.ts \
  Linux/agentlog-pet/src/manager/pages/SettingsPage.tsx \
  Linux/agentlog-pet/test/agentlog/app-runtime.test.cjs \
  Linux/agentlog-pet/test/agentlog/manager-ipc.test.cjs \
  Linux/agentlog-pet/src/manager/__tests__/App.test.tsx
git -C /home/ljz/Jingze/OPC/DevPulse_AI commit -m "feat: report tray backend diagnostics"
```

---

## Task 8: Package Stable Icons, Helper, and AppImage Libraries

**Interfaces**

- Build staging root is `build/tray/` with `bin`, `lib`, `icons/hicolor`, `NOTICE`, and `SHA256SUMS`.
- electron-builder copies the staging root to `resources/tray` for AppImage and deb.
- The helper RUNPATH is `$ORIGIN/../lib`; no global `LD_LIBRARY_PATH` is changed.

**Files**

- Create: eight PNGs under `assets/tray-icons/hicolor/`
- Create: `scripts/verify-linux-tray-bundle.cjs`
- Create: `test/agentlog/linux-tray-package.test.cjs`
- Modify: `scripts/build-linux-tray-helper.cjs`
- Modify: `scripts/build-linux.cjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `runtime/clawd/NOTICE.md`

- [ ] **Step 1: Write failing package configuration tests**

Assert `package.json` includes `build/tray -> tray`, `prebuild:linux` invokes the helper build and verifier, AppImage/deb remain x64, Debian dependencies contain GTK3/Ayatana/json-glib alternatives, all eight icons exist with exact dimensions, the helper is executable, RUNPATH is relative, and required shared libraries resolve from staging.

- [ ] **Step 2: Run the package test and observe missing resources**

```bash
node --test test/agentlog/linux-tray-package.test.cjs
```

Expected: FAIL for missing icon tree and helper resource declaration.

- [ ] **Step 3: Create normal and attention icon assets**

Derive the normal icon from `assets/brand/icons/48x48.png` and the attention icon from `runtime/clawd/assets/tray-icon-flash.png` using deterministic image resize commands. Store exact 16, 22, 32, and 48 pixel PNGs under the names `agentlog-pet.png` and `agentlog-pet-attention.png`. Do not regenerate these assets on every application launch.

Verify dimensions:

```bash
file assets/tray-icons/hicolor/*/status/*.png
```

- [ ] **Step 4: Stage a bounded shared-library closure for AppImage**

The build script copies only these SONAME families when `ldd` resolves them:

```js
const BUNDLED_SONAME_PREFIXES = [
  "libayatana-appindicator3.so",
  "libayatana-indicator3.so",
  "libdbusmenu-glib.so",
  "libdbusmenu-gtk3.so",
  "libjson-glib-1.0.so",
];
```

GTK, GLib, libc, libstdc++, X11, and system D-Bus libraries remain host dependencies. Copy real files and required SONAME symlinks into `build/tray/lib`. Confirm `readelf -d build/tray/bin/agentlog-tray` reports `RUNPATH [$ORIGIN/../lib]`.

- [ ] **Step 5: Add electron-builder resources and Debian dependencies**

Add one Linux resource:

```json
{
  "from": "build/tray",
  "to": "tray"
}
```

Set Linux dependencies to include:

```json
[
  "libgtk-3-0 | libgtk-3-0t64",
  "libayatana-appindicator3-1",
  "libjson-glib-1.0-0"
]
```

Retain electron-builder's required baseline dependencies if the generated package already includes them; inspect the final control file rather than replacing defaults blindly.

- [ ] **Step 6: Implement the bundle verifier**

Verify executable permission, ELF x86-64 architecture, protocol-v1 marker, SHA-256 entries, icon names/dimensions, RUNPATH, staged SONAMEs, notice text, and absence of absolute build/home paths. `scripts/build-linux.cjs` must run this verifier before electron-builder.

- [ ] **Step 7: Run package configuration and staging tests**

```bash
node scripts/build-linux-tray-helper.cjs
node scripts/verify-linux-tray-bundle.cjs build/tray
node --test test/agentlog/linux-tray-package.test.cjs \
  runtime/clawd/test/package-build-config.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit package resources**

```bash
git -C /home/ljz/Jingze/OPC/DevPulse_AI add Linux/agentlog-pet/assets/tray-icons \
  Linux/agentlog-pet/scripts/build-linux-tray-helper.cjs \
  Linux/agentlog-pet/scripts/verify-linux-tray-bundle.cjs \
  Linux/agentlog-pet/scripts/build-linux.cjs \
  Linux/agentlog-pet/test/agentlog/linux-tray-package.test.cjs \
  Linux/agentlog-pet/package.json \
  Linux/agentlog-pet/package-lock.json \
  Linux/agentlog-pet/.gitignore \
  Linux/agentlog-pet/runtime/clawd/NOTICE.md
git -C /home/ljz/Jingze/OPC/DevPulse_AI commit -m "build: package native Linux tray backend"
```

---

## Task 9: Verify Artifacts and Document Desktop Limits

**Interfaces**

- Produces AppImage and deb x64 artifacts under `Linux/`.
- Produces a dated verification report under `docs/verification/`.
- Leaves no GNOME per-user icon override and no helper process after exit.

**Files**

- Modify: `scripts/smoke-linux.cjs`
- Modify: `README.md`
- Modify: `runtime/clawd/docs/guides/known-limitations.zh-CN.md`
- Create: `docs/verification/2026-08-24-linux-native-tray.md`

- [ ] **Step 1: Remove the diagnostic GNOME override before testing**

```bash
gsettings reset org.gnome.shell.extensions.appindicator custom-icons
gsettings get org.gnome.shell.extensions.appindicator custom-icons
```

Expected: the second command shows the schema default, with no AgentLog-specific absolute path.

- [ ] **Step 2: Run the complete automated suite**

```bash
npm run test:phase2
npm run build:linux
npm run smoke:linux
```

Expected: all Node, manager, typecheck, build, upstream, and smoke commands PASS.

- [ ] **Step 3: Inspect both artifacts**

```bash
find Linux -maxdepth 1 -type f -printf '%f\n' | sort
dpkg-deb -I Linux/AgentLog-Pet-0.1.0-x64.deb
dpkg-deb -c Linux/AgentLog-Pet-0.1.0-x64.deb | rg 'tray/(bin|lib|icons)'
```

Expected: AppImage and deb exist; deb metadata includes dependencies; helper and all stable icons are packaged.

- [ ] **Step 4: Verify the running native backend on the current Linux desktop**

Launch the package with an isolated HOME, then confirm diagnostics reports `native`, the StatusNotifier item exposes `agentlog-pet` or `agentlog-pet-attention`, and its icon theme path is inside the mounted/installed package rather than `/tmp/org.chromium.*`. Open every menu command, switch all three modes, trigger completion attention, open the menu to stop attention, hide the pet, relaunch the desktop entry, and confirm the manager opens.

- [ ] **Step 5: Verify failure behavior**

Run development-only fault injection for helper startup timeout, process kill, malformed output, X11 no-host, and Wayland no-host. Confirm no duplicate indicator, maximum three restarts, correct diagnostics, working manager/pet/project features, and no remaining `agentlog-tray` process after application exit.

- [ ] **Step 6: Execute and record the clean-profile matrix**

Record package type, desktop/session, first launch, application restart, panel restart, attention switch, menu rebuild, helper recovery, launcher recovery, and clean shutdown for:

| Distribution/Desktop | Session | Package |
| --- | --- | --- |
| Ubuntu 22.04 / GNOME 42 | X11 | Debian and AppImage |
| Ubuntu 22.04 / GNOME 42 | Wayland | Debian and AppImage |
| Ubuntu 24.04 / GNOME 46 | Wayland | Debian and AppImage |
| KDE Plasma 6 | Wayland | AppImage |
| XFCE 4 | X11 | AppImage |

Do not mark this task complete until every row has evidence in `docs/verification/2026-08-24-linux-native-tray.md`.

- [ ] **Step 7: Document the user-facing behavior**

README states that AgentLog uses the desktop's standard tray host and remains accessible from the launcher when a desktop intentionally has none. The Chinese known-limitations guide explains Wayland/no-host behavior without asking users to edit GNOME settings.

- [ ] **Step 8: Confirm repository and process cleanliness**

```bash
git status --short
pgrep -af 'agentlog-tray|AgentLog Pet' || true
rg -n 'custom-icons|org\.chromium.*status_icon' runtime scripts src package.json
```

Expected: only intended documentation/report changes remain; no orphan helper; no production code mutates `custom-icons` or relies on Chromium temporary tray files.

- [ ] **Step 9: Commit verification and documentation**

```bash
git -C /home/ljz/Jingze/OPC/DevPulse_AI add Linux/agentlog-pet/README.md \
  Linux/agentlog-pet/runtime/clawd/docs/guides/known-limitations.zh-CN.md \
  Linux/agentlog-pet/docs/verification/2026-08-24-linux-native-tray.md \
  Linux/agentlog-pet/scripts/smoke-linux.cjs
git -C /home/ljz/Jingze/OPC/DevPulse_AI commit -m "docs: verify Linux native tray support"
```

## Completion Gate

Before claiming completion, verify all of the following:

- [ ] Every task commit exists and contains only its stated scope.
- [ ] `npm run test:phase2`, `npm run build:linux`, and `npm run smoke:linux` pass from a clean checkout with documented native build dependencies.
- [ ] Native and fallback adapters render the same approved quick-menu model.
- [ ] Exactly one backend owns a tray icon during startup, restart, fallback, and shutdown.
- [ ] Normal and attention icons use stable packaged names and paths.
- [ ] Launcher reactivation opens the manager when the tray is absent and the pet is hidden.
- [ ] Settings diagnostics exposes only the allowlisted tray status and code.
- [ ] AppImage and deb contain the helper, icons, libraries, notice, and checksums.
- [ ] The complete clean-profile desktop matrix is recorded with no GNOME override.
- [ ] No orphan helper process survives AgentLog exit.

## Execution Choice

1. **Subagent-Driven Development (recommended):** Execute one task at a time with a fresh implementation worker and a review checkpoint after every commit.
2. **Inline Execution:** Execute the same checklist in this session, preserving the RED/GREEN test order and per-task commits.
