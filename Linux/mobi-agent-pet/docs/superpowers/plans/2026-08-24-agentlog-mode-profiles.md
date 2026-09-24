# AgentLog Mode Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary rest/minimal menu wiring with three runtime-only AgentLog modes: Normal, Background, and Automatic.

**Architecture:** Add one focused runtime-mode module as the source of truth for active mode, per-run Automatic authorization, and effective behavior policy. `main.js` applies that policy at existing sound, tray, bubble, HUD, roam, updater, pet-state, and permission boundaries; `menu.js` only renders state and requests transitions. Persisted preferences remain untouched.

**Tech Stack:** Electron, CommonJS, Node.js built-in test runner, existing AgentLog/Clawd settings and permission runtimes.

**Spec:** `docs/superpowers/specs/2026-08-21-agentlog-mode-profiles-design.md`

## Global Constraints

- Every application launch begins in Normal Mode.
- Mode selection and Automatic authorization are memory-only and are never written to preferences.
- Normal Mode follows saved preferences without overrides.
- Background Mode is silent, keeps recording/timing/summaries active, and leaves permission decisions in the Agent's native UI.
- Automatic Mode is silent except for pet work/completion animation and uses effective `unattended` permission handling only for new requests.
- Automatic Mode requires confirmation once per application run; declining or failing confirmation leaves the previous mode active.
- Existing permission requests are never retroactively approved after a mode switch.
- Only one disabled Custom Mode entry and one disabled Edit Custom Mode entry remain in this phase.
- Linux is the only target platform for this phase.
- Existing staged or unstaged user changes must remain intact. Use path-limited commits such as `git commit --only <paths>`.

---

### Task 1: Runtime Mode Policy And Authorization

**Files:**
- Create: `runtime/clawd/src/app-mode.js`
- Create: `runtime/clawd/test/app-mode.test.js`

**Interfaces:**
- Produces: `APP_MODE`, `isAppMode(value)`, `resolveAppModePolicy(mode, snapshot)`, and `createAppModeRuntime(options)`.
- `createAppModeRuntime({ applyMode })` returns `getMode()`, `isAutomaticAuthorized()`, and `setMode(targetMode, { confirmed })`.
- `setMode` returns `{ status: "ok", mode }`, `{ status: "confirmation-required", mode }`, or `{ status: "error", mode, message }`.
- `applyMode(targetMode, previousMode, options)` is asynchronous. A rejected transition is rolled back with `options.rollback === true`.

- [ ] **Step 1: Write the failing policy tests**

~~~js
"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  APP_MODE,
  createAppModeRuntime,
  resolveAppModePolicy,
} = require("../src/app-mode");

describe("app mode policy", () => {
  it("keeps Normal Mode free of overrides", () => {
    const policy = resolveAppModePolicy(APP_MODE.NORMAL, {
      permissionAutomationMode: "auto-tools",
    });
    assert.deepStrictEqual(policy, {
      muteSound: false,
      suppressTrayFlash: false,
      suppressPermissionBubbles: false,
      suppressNotificationBubbles: false,
      suppressUpdateBubbles: false,
      suppressSessionHud: false,
      freezePet: false,
      allowWorkAnimations: true,
      allowNotificationAnimation: true,
      allowCompletionAnimation: true,
      permissionAutomationMode: "auto-tools",
    });
  });

  it("makes Background Mode silent without granting permissions", () => {
    const policy = resolveAppModePolicy(APP_MODE.BACKGROUND, {
      permissionAutomationMode: "unattended",
    });
    assert.equal(policy.permissionAutomationMode, "off");
    assert.equal(policy.freezePet, true);
    assert.equal(policy.allowWorkAnimations, false);
    assert.equal(policy.allowNotificationAnimation, false);
    assert.equal(policy.allowCompletionAnimation, false);
    assert.equal(policy.muteSound, true);
    assert.equal(policy.suppressTrayFlash, true);
  });

  it("makes Automatic Mode quiet while retaining pet activity", () => {
    const policy = resolveAppModePolicy(APP_MODE.AUTOMATIC, {
      permissionAutomationMode: "off",
    });
    assert.equal(policy.permissionAutomationMode, "unattended");
    assert.equal(policy.freezePet, false);
    assert.equal(policy.allowWorkAnimations, true);
    assert.equal(policy.allowNotificationAnimation, false);
    assert.equal(policy.allowCompletionAnimation, true);
    assert.equal(policy.suppressPermissionBubbles, true);
    assert.equal(policy.suppressNotificationBubbles, true);
  });
});

describe("app mode runtime authorization", () => {
  it("starts Normal and requires one confirmation per run", async () => {
    const applied = [];
    const runtime = createAppModeRuntime({
      applyMode: async (next, previous) => applied.push([next, previous]),
    });
    assert.equal(runtime.getMode(), APP_MODE.NORMAL);
    assert.deepStrictEqual(
      await runtime.setMode(APP_MODE.AUTOMATIC),
      { status: "confirmation-required", mode: APP_MODE.NORMAL }
    );
    assert.equal(runtime.isAutomaticAuthorized(), false);
    assert.equal((await runtime.setMode(APP_MODE.AUTOMATIC, { confirmed: true })).status, "ok");
    await runtime.setMode(APP_MODE.NORMAL);
    assert.equal((await runtime.setMode(APP_MODE.AUTOMATIC)).status, "ok");
    assert.equal(runtime.isAutomaticAuthorized(), true);
    assert.deepStrictEqual(applied, [
      [APP_MODE.AUTOMATIC, APP_MODE.NORMAL],
      [APP_MODE.NORMAL, APP_MODE.AUTOMATIC],
      [APP_MODE.AUTOMATIC, APP_MODE.NORMAL],
    ]);
  });
});
~~~

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node --test runtime/clawd/test/app-mode.test.js`

Expected: FAIL with `Cannot find module '../src/app-mode'`.

- [ ] **Step 3: Implement the pure runtime module**

Use these exact mode identifiers and policy keys:

~~~js
const APP_MODE = Object.freeze({
  NORMAL: "normal",
  BACKGROUND: "background",
  AUTOMATIC: "automatic",
});

function resolveAppModePolicy(mode, snapshot = {}) {
  const savedPermissionMode = ["off", "auto-tools", "unattended"].includes(
    snapshot.permissionAutomationMode
  ) ? snapshot.permissionAutomationMode : "off";
  const quiet = mode === APP_MODE.BACKGROUND || mode === APP_MODE.AUTOMATIC;
  return {
    muteSound: quiet,
    suppressTrayFlash: quiet,
    suppressPermissionBubbles: quiet,
    suppressNotificationBubbles: quiet,
    suppressUpdateBubbles: quiet,
    suppressSessionHud: quiet,
    freezePet: mode === APP_MODE.BACKGROUND,
    allowWorkAnimations: mode !== APP_MODE.BACKGROUND,
    allowNotificationAnimation: mode === APP_MODE.NORMAL,
    allowCompletionAnimation: mode !== APP_MODE.BACKGROUND,
    permissionAutomationMode: mode === APP_MODE.AUTOMATIC
      ? "unattended"
      : (mode === APP_MODE.BACKGROUND ? "off" : savedPermissionMode),
  };
}
~~~

`setMode` must validate the target, short-circuit unchanged modes, keep authorization memory-only, and restore both mode and authorization state if `applyMode` fails.

- [ ] **Step 4: Add rollback and invalid-mode tests**

Test that an invalid target returns `status: "error"`, a rejected `applyMode` keeps the previous mode, rollback is invoked, and a failed first Automatic transition does not retain authorization.

- [ ] **Step 5: Run the focused test**

Run: `node --test runtime/clawd/test/app-mode.test.js`

Expected: all app-mode tests PASS.

- [ ] **Step 6: Commit only this task's files**

~~~bash
git commit --only runtime/clawd/src/app-mode.js runtime/clawd/test/app-mode.test.js \
  -m "feat: add runtime app mode policy"
~~~

---

### Task 2: Apply Quiet-Mode Overrides At Runtime Boundaries

**Files:**
- Modify: `runtime/clawd/src/app-mode.js`
- Modify: `runtime/clawd/src/main.js`
- Modify: `runtime/clawd/src/roam.js`
- Modify: `runtime/clawd/src/state.js`
- Modify: `runtime/clawd/test/roam.test.js`
- Modify: `runtime/clawd/test/state.test.js`
- Create: `runtime/clawd/test/app-mode-main.test.js`

**Interfaces:**
- Consumes: `createAppModeRuntime` and `resolveAppModePolicy` from Task 1.
- Produces from `app-mode.js`: `resolveEffectiveSoundMuted(savedMuted, policy)`, `resolveEffectiveTrayFlashEnabled(savedEnabled, policy)`, and `resolveEffectiveBubblePolicy(basePolicy, suppressed)`.
- Produces in `main.js`: `getActiveAppMode()`, `getEffectiveAppModePolicy()`, and asynchronous `setActiveAppMode(mode, options)`.
- Adds to roam context: `isModeMovementAllowed(): boolean`.

- [ ] **Step 1: Write failing effective-policy boundary tests**

Add the three named pure effective-value helpers to `app-mode.js`; use `app-mode-main.test.js` for the main-process dependency wiring. Assert:

~~~js
assert.equal(resolveEffectiveSoundMuted(false, { muteSound: true }), true);
assert.equal(resolveEffectiveTrayFlashEnabled(true, { suppressTrayFlash: true }), false);
assert.deepStrictEqual(
  resolveEffectiveBubblePolicy({ enabled: true, autoCloseMs: 6000 }, true),
  { enabled: false, autoCloseMs: 0 }
);
~~~

Also assert that Normal Mode returns every saved value unchanged.

- [ ] **Step 2: Run the focused test and verify missing wiring fails**

Run: `node --test runtime/clawd/test/app-mode-main.test.js`

Expected: FAIL because effective mode helpers are not wired.

- [ ] **Step 3: Instantiate the runtime mode source in `main.js`**

Create it immediately after settings-controller initialization so it always starts Normal:

~~~js
const {
  APP_MODE,
  createAppModeRuntime,
  resolveAppModePolicy,
} = require("./app-mode");

function getEffectiveAppModePolicy(mode = _appModeRuntime.getMode()) {
  return resolveAppModePolicy(mode, _settingsController.getSnapshot());
}
~~~

Do not add an app-mode field to `prefs.js` or call `_settingsController.applyUpdate` during mode changes.

- [ ] **Step 4: Gate sound, tray, and bubbles**

Update `playSound` and `flashTaskbar` to check the effective policy before saved preference checks. Wrap `getRuntimeBubblePolicy(kind)` so each suppressed category returns `{ enabled: false, autoCloseMs: 0 }`.

Do not change saved `soundMuted`, `flashTaskbarOnComplete`, or bubble policy values.

- [ ] **Step 5: Gate updates and the complete HUD**

Pass effective quiet-state getters to `_updaterCtx`. Pass `false` for both effective `sessionHudEnabled` and `sessionHudShowQuota` while `suppressSessionHud` is true, then call `syncSessionHudVisibility()` during transitions so existing HUD and quota surfaces close immediately.

- [ ] **Step 6: Stop free roam in Background Mode**

Add this gate inside `roam.js:isRoamAllowed()`:

~~~js
if (typeof ctx.isModeMovementAllowed === "function"
    && !ctx.isModeMovementAllowed()) {
  return false;
}
~~~

Wire it from `_roamCtx` as `() => !getEffectiveAppModePolicy().freezePet`. Add a test proving active roam cancels when this getter changes from true to false.

- [ ] **Step 7: Suppress non-completion pet alerts in Automatic Mode**

Wire a state-context predicate for `allowNotificationAnimation`. When Automatic receives a `notification` or `mini-alert` visual request, resolve back to the current work/idle state without showing the permission/waiting animation. Do not suppress `attention` or `mini-happy`, because those are completion animations. Add state tests proving Automatic keeps `working` and `attention` visuals but suppresses `notification`; Background continues through the sleeping/DND path.

- [ ] **Step 8: Implement quiet-surface transition cleanup**

When entering Background or Automatic Mode, run these existing effects in order:

1. `stopTrayFlash()`
2. `_perm.dismissPermissionsForDnd()` to close AgentLog-owned pending surfaces without a decision
3. `hideUpdateBubble()`
4. `syncSessionHudVisibility()`
5. `_roam.cancelRoam()`

Background then calls `enableDoNotDisturb()` to enter the sleeping state. Automatic and Normal call `disableDoNotDisturb()` when needed, then resolve the current pet state. A failed transition invokes the previous mode's effects through Task 1 rollback.

- [ ] **Step 9: Run affected subsystem tests**

~~~bash
node --test \
  runtime/clawd/test/app-mode.test.js \
  runtime/clawd/test/app-mode-main.test.js \
  runtime/clawd/test/roam.test.js \
  runtime/clawd/test/state.test.js \
  runtime/clawd/test/session-hud.test.js \
  runtime/clawd/test/update-bubble-autoclose.test.js
~~~

Expected: all selected tests PASS.

- [ ] **Step 10: Commit only this task's files**

~~~bash
git commit --only \
  runtime/clawd/src/app-mode.js \
  runtime/clawd/src/main.js \
  runtime/clawd/src/roam.js \
  runtime/clawd/src/state.js \
  runtime/clawd/test/roam.test.js \
  runtime/clawd/test/state.test.js \
  runtime/clawd/test/app-mode-main.test.js \
  -m "feat: apply runtime mode overrides"
~~~

---

### Task 3: Automatic Permission Safety And Request Boundary

**Files:**
- Modify: `runtime/clawd/src/main.js`
- Modify: `runtime/clawd/test/permission-auto-approve.test.js`
- Modify: `runtime/clawd/test/server-route-permission.test.js`
- Modify: `runtime/clawd/test/app-mode-main.test.js`

**Interfaces:**
- Consumes: `getEffectiveAppModePolicy()` and `setActiveAppMode()` from Task 2.
- Existing permission interface remains `getPermissionAutomationMode(): "off" | "auto-tools" | "unattended"`.
- Background routing continues through existing DND/native-fallback branches.

- [ ] **Step 1: Write failing non-persistence tests**

Add an integration assertion that switching Automatic on and off never invokes `_settingsController.applyCommand("setPermissionAutomationMode", ...)` and leaves the snapshot's `permissionAutomationMode` unchanged.

- [ ] **Step 2: Run permission tests and verify the integration assertion fails**

~~~bash
node --test \
  runtime/clawd/test/app-mode-main.test.js \
  runtime/clawd/test/permission-auto-approve.test.js \
  runtime/clawd/test/server-route-permission.test.js
~~~

Expected: the new mode integration assertion FAILS before wiring.

- [ ] **Step 3: Feed effective mode to the permission chokepoint**

Change `_permCtx.getPermissionAutomationMode` to return:

~~~js
getEffectiveAppModePolicy().permissionAutomationMode
~~~

Do not modify the persisted Settings permission automation menu. Automatic Mode temporarily reuses the tested `unattended` wire behavior without saving it.

- [ ] **Step 4: Prove existing requests are not retroactively approved**

Before committing Automatic Mode, dismiss existing AgentLog-owned entries with the no-decision path. Seed one pending request, switch modes, and assert its allow reply is never called. Create a second request after the switch and assert the unattended path approves it.

- [ ] **Step 5: Prove Background Mode uses native fallback**

Exercise Claude/Codex and one opencode-family route with Background active. Assert no AgentLog bubble is created and no allow/deny decision is sent; preserve each route's existing native terminal/chat fallback response.

- [ ] **Step 6: Run focused permission regression tests**

Run the command from Step 2.

Expected: all selected tests PASS.

- [ ] **Step 7: Commit only permission integration files**

~~~bash
git commit --only \
  runtime/clawd/src/main.js \
  runtime/clawd/test/app-mode-main.test.js \
  runtime/clawd/test/permission-auto-approve.test.js \
  runtime/clawd/test/server-route-permission.test.js \
  -m "feat: scope automatic permissions to runtime mode"
~~~

---

### Task 4: Mode Menu, Chinese Copy, And Confirmation

**Files:**
- Modify: `runtime/clawd/src/menu.js`
- Modify: `runtime/clawd/src/i18n.js`
- Modify: `runtime/clawd/src/main.js`
- Modify: `runtime/clawd/test/menu-hide-pet.test.js`
- Modify: `runtime/clawd/test/menu-display.test.js`
- Modify: `runtime/clawd/test/i18n.test.js`

**Interfaces:**
- Consumes from `_menuCtx`: `getAppMode()`, `isAutomaticModeAuthorized()`, and `setAppMode(mode, options)`.
- `setAppMode` resolves to Task 1 result shapes.
- Produces identical Mode submenu state for tray and pet context menus.

- [ ] **Step 1: Replace menu expectations with final labels**

Assert this exact Simplified Chinese order:

~~~js
[
  "常规模式",
  "后台模式",
  "自动模式",
  "自定义模式",
  "编辑自定义模式…",
]
~~~

Assert Background and Automatic are not inferred from mini-mode state, and Custom/Edit remain disabled.

- [ ] **Step 2: Add failing confirmation-flow tests**

Mock `dialog.showMessageBox` and verify:

- First Automatic click receives `confirmation-required`, shows one warning, and retries with `{ confirmed: true }` after acceptance.
- Cancelling leaves Normal checked.
- A later Automatic click in the same run does not show the dialog again.
- An error result rebuilds menus and displays a localized error dialog.

- [ ] **Step 3: Run menu tests and verify old labels fail**

~~~bash
node --test \
  runtime/clawd/test/menu-hide-pet.test.js \
  runtime/clawd/test/menu-display.test.js \
  runtime/clawd/test/i18n.test.js
~~~

Expected: FAIL on the old Rest/Minimal labels and missing Automatic confirmation behavior.

- [ ] **Step 4: Make `menu.js` render runtime mode state**

Remove `getCurrentAppMode()` inference from DND and mini mode. Remove `activateAppMode()` calls to mini/DND functions. Build radio items from `ctx.getAppMode()` and route clicks through `ctx.setAppMode()`.

The Automatic warning uses `dialog.showMessageBox` with a confirm button and cancel button. Set both `defaultId` and `cancelId` to the safe cancel choice.

- [ ] **Step 5: Add translations in every supported dictionary**

Use these Simplified Chinese strings:

~~~js
appModeNormal: "常规模式",
appModeBackground: "后台模式",
appModeAutomatic: "自动模式",
appModeAutomaticConfirmTitle: "启用自动模式？",
appModeAutomaticConfirmDetail: "AgentLog 将在本次运行期间自动批准新的 Agent 权限请求。已有请求不会被处理，退出应用后授权自动失效。",
appModeAutomaticConfirm: "启用自动模式",
~~~

Add equivalent English, Traditional Chinese, Korean, and Japanese keys so dictionaries remain structurally identical. Remove menu use of `appModeRest` and `appModeMinimal`; retain unrelated legacy sleep and mini-mode strings used elsewhere.

- [ ] **Step 6: Wire `_menuCtx`**

Expose `getAppMode`, `isAutomaticModeAuthorized`, and `setAppMode`. Keep the separate persisted permission automation menu because it configures Normal Mode.

- [ ] **Step 7: Run menu and i18n tests**

Run the command from Step 3.

Expected: all selected tests PASS.

- [ ] **Step 8: Commit only menu and copy files**

~~~bash
git commit --only \
  runtime/clawd/src/menu.js \
  runtime/clawd/src/i18n.js \
  runtime/clawd/src/main.js \
  runtime/clawd/test/menu-hide-pet.test.js \
  runtime/clawd/test/menu-display.test.js \
  runtime/clawd/test/i18n.test.js \
  -m "feat: add background and automatic mode menu"
~~~

---

### Task 5: Startup Reset, Patch Manifest, And Verification

**Files:**
- Modify: `runtime/clawd/AGENTLOG_UPSTREAM.json`
- Modify: `test/agentlog/upstream-pin.test.cjs`
- Modify: `runtime/clawd/test/app-mode.test.js`
- Modify: `runtime/clawd/test/app-mode-main.test.js`

**Interfaces:**
- Consumes all mode runtime and menu interfaces from Tasks 1-4.
- Produces a pinned list of every upstream runtime file customized by AgentLog.

- [ ] **Step 1: Add startup and shutdown lifecycle tests**

Assert a newly created runtime always reports Normal, including after a previous runtime instance authorized and entered Automatic. Assert cleanup drops authorization and never writes an app-mode key to the preferences file.

- [ ] **Step 2: Add restoration tests**

Start from saved preferences with sound off, tray flash on, bubbles on, HUD on, and permission automation `auto-tools`. Enter Background, then Normal, and assert effective values return to those exact saved values. Repeat Automatic to Normal.

- [ ] **Step 3: Update both upstream patch lists**

Add newly created or modified upstream files to `runtime/clawd/AGENTLOG_UPSTREAM.json` and `test/agentlog/upstream-pin.test.cjs` in identical sorted positions:

~~~text
src/app-mode.js
src/roam.js
src/state.js
test/app-mode-main.test.js
test/app-mode.test.js
test/menu-hide-pet.test.js
test/permission-auto-approve.test.js
test/roam.test.js
test/server-route-permission.test.js
test/state.test.js
~~~

Keep existing entries and do not remove unrelated patched-file records.

- [ ] **Step 4: Run formatting and focused mode tests**

~~~bash
git diff --check
node --test \
  runtime/clawd/test/app-mode.test.js \
  runtime/clawd/test/app-mode-main.test.js \
  runtime/clawd/test/menu-hide-pet.test.js \
  runtime/clawd/test/menu-display.test.js \
  runtime/clawd/test/permission-auto-approve.test.js \
  runtime/clawd/test/server-route-permission.test.js \
  runtime/clawd/test/roam.test.js \
  runtime/clawd/test/state.test.js \
  runtime/clawd/test/session-hud.test.js \
  runtime/clawd/test/i18n.test.js
~~~

Expected: no diff errors and all selected tests PASS.

- [ ] **Step 5: Run complete Linux verification**

~~~bash
npm run test:phase2
npm run smoke:linux
~~~

Expected: root tests, manager tests, manager typecheck, manager build, upstream tests, and Linux smoke all exit 0. Platform-specific skips are acceptable; failures are not.

- [ ] **Step 6: Restart and inspect the native application**

Stop the existing development process gracefully, start one new `npm run dev` process, and verify:

- Exactly one Electron main process owns the application.
- Mode displays 常规模式, 后台模式, 自动模式 in order.
- Background rests the pet and removes visible alerts.
- Automatic asks once, preserves pet work/completion actions, and emits no sound, flash, bubbles, update prompts, or HUD.
- Restart returns the checked mode to 常规模式.

- [ ] **Step 7: Commit only final tests and manifests**

~~~bash
git commit --only \
  runtime/clawd/AGENTLOG_UPSTREAM.json \
  test/agentlog/upstream-pin.test.cjs \
  runtime/clawd/test/app-mode.test.js \
  runtime/clawd/test/app-mode-main.test.js \
  -m "test: verify runtime mode lifecycle"
~~~
