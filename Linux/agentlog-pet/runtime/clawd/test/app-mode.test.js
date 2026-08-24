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

  it("rejects invalid modes without applying them", async () => {
    let applyCount = 0;
    const runtime = createAppModeRuntime({
      applyMode: async () => { applyCount += 1; },
    });
    const result = await runtime.setMode("invalid");
    assert.equal(result.status, "error");
    assert.equal(result.mode, APP_MODE.NORMAL);
    assert.match(result.message, /invalid app mode/i);
    assert.equal(applyCount, 0);
  });

  it("rolls back a rejected transition and restores the previous state", async () => {
    const calls = [];
    const runtime = createAppModeRuntime({
      applyMode: async (next, previous, options) => {
        calls.push([next, previous, options]);
        if (!options.rollback) throw new Error("transition failed");
      },
    });
    const result = await runtime.setMode(APP_MODE.BACKGROUND);
    assert.equal(result.status, "error");
    assert.equal(result.mode, APP_MODE.NORMAL);
    assert.equal(runtime.getMode(), APP_MODE.NORMAL);
    assert.equal(runtime.isAutomaticAuthorized(), false);
    assert.deepStrictEqual(calls, [
      [APP_MODE.BACKGROUND, APP_MODE.NORMAL, { rollback: false }],
      [APP_MODE.NORMAL, APP_MODE.BACKGROUND, { rollback: true }],
    ]);
  });

  it("does not retain authorization after the first Automatic transition fails", async () => {
    const runtime = createAppModeRuntime({
      applyMode: async (next, previous, options) => {
        if (!options.rollback) throw new Error("automatic failed");
      },
    });
    const result = await runtime.setMode(APP_MODE.AUTOMATIC, { confirmed: true });
    assert.equal(result.status, "error");
    assert.equal(runtime.getMode(), APP_MODE.NORMAL);
    assert.equal(runtime.isAutomaticAuthorized(), false);
    assert.equal(
      (await runtime.setMode(APP_MODE.AUTOMATIC)).status,
      "confirmation-required"
    );
  });

  it("serializes concurrent transitions around the committed result", async () => {
    let releaseFirst;
    let firstEntered;
    const calls = [];
    const runtime = createAppModeRuntime({
      applyMode: async (next, previous, options) => {
        calls.push([next, previous, options]);
        if (next === APP_MODE.AUTOMATIC && !options.rollback) {
          await new Promise((resolve) => {
            releaseFirst = resolve;
            firstEntered();
          });
          throw new Error("first transition failed");
        }
      },
    });
    const entered = new Promise((resolve) => { firstEntered = resolve; });
    const first = runtime.setMode(APP_MODE.AUTOMATIC, { confirmed: true });
    await entered;

    let secondSettled = false;
    const second = runtime.setMode(APP_MODE.BACKGROUND).then((result) => {
      secondSettled = true;
      return result;
    });
    await Promise.resolve();
    assert.equal(secondSettled, false);

    releaseFirst();
    assert.equal((await first).status, "error");
    assert.deepStrictEqual(await second, {
      status: "ok",
      mode: APP_MODE.BACKGROUND,
    });
    assert.equal(runtime.getMode(), APP_MODE.BACKGROUND);
    assert.equal(runtime.isAutomaticAuthorized(), false);
    assert.deepStrictEqual(calls, [
      [APP_MODE.AUTOMATIC, APP_MODE.NORMAL, { rollback: false }],
      [APP_MODE.NORMAL, APP_MODE.AUTOMATIC, { rollback: true }],
      [APP_MODE.BACKGROUND, APP_MODE.NORMAL, { rollback: false }],
    ]);
  });

  it("keeps the queue usable after rejection and no-op decisions", async () => {
    let shouldReject = true;
    const runtime = createAppModeRuntime({
      applyMode: async (next, previous, options) => {
        if (shouldReject && !options.rollback) {
          shouldReject = false;
          throw new Error("rejected transition");
        }
      },
    });

    const [rejected, invalid, confirmation, applied] = await Promise.all([
      runtime.setMode(APP_MODE.BACKGROUND),
      runtime.setMode("invalid"),
      runtime.setMode(APP_MODE.AUTOMATIC),
      runtime.setMode(APP_MODE.BACKGROUND),
    ]);
    assert.equal(rejected.status, "error");
    assert.equal(invalid.status, "error");
    assert.equal(confirmation.status, "confirmation-required");
    assert.deepStrictEqual(applied, {
      status: "ok",
      mode: APP_MODE.BACKGROUND,
    });
    assert.equal(runtime.getMode(), APP_MODE.BACKGROUND);
  });
});
