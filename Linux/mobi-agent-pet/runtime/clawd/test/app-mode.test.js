"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  APP_MODE,
  createAppModeController,
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
      suppressSessionHud: false,
      freezePet: false,
      hidePet: false,
      allowWorkAnimations: true,
      allowNotificationAnimation: true,
      allowCompletionAnimation: true,
      forceCompletionAnimation: false,
      permissionAutomationMode: "auto-tools",
    });
  });

  it("makes Background Mode silent without granting permissions", () => {
    const policy = resolveAppModePolicy(APP_MODE.BACKGROUND, {
      permissionAutomationMode: "unattended",
    });
    assert.equal(policy.permissionAutomationMode, "off");
    assert.equal(policy.freezePet, true);
    assert.equal(policy.hidePet, true);
    assert.equal(policy.allowWorkAnimations, false);
    assert.equal(policy.allowNotificationAnimation, false);
    assert.equal(policy.allowCompletionAnimation, false);
    assert.equal(policy.forceCompletionAnimation, false);
    assert.equal(policy.muteSound, true);
    assert.equal(policy.suppressTrayFlash, true);
  });

  it("makes Automatic Mode quiet while retaining pet activity", () => {
    const policy = resolveAppModePolicy(APP_MODE.AUTOMATIC, {
      permissionAutomationMode: "off",
    });
    assert.equal(policy.permissionAutomationMode, "unattended");
    assert.equal(policy.freezePet, false);
    assert.equal(policy.hidePet, false);
    assert.equal(policy.allowWorkAnimations, true);
    assert.equal(policy.allowNotificationAnimation, false);
    assert.equal(policy.allowCompletionAnimation, true);
    assert.equal(policy.forceCompletionAnimation, true);
    assert.equal(policy.suppressPermissionBubbles, true);
    assert.equal(policy.suppressNotificationBubbles, true);
  });
});

describe("app mode runtime authorization", () => {
  it("does not apply Automatic permission policy to a request captured in Normal", async () => {
    const runtime = createAppModeRuntime();
    const requestContext = runtime.capturePermissionRequest();

    await runtime.setMode(APP_MODE.AUTOMATIC, { confirmed: true });

    assert.equal(
      runtime.resolvePermissionAutomationMode(requestContext, "off"),
      "off"
    );
  });

  it("invalidates an Automatic request as soon as Automatic exits", async () => {
    const runtime = createAppModeRuntime();
    await runtime.setMode(APP_MODE.AUTOMATIC, { confirmed: true });
    const requestContext = runtime.capturePermissionRequest();
    assert.equal(
      runtime.resolvePermissionAutomationMode(requestContext, "off"),
      "unattended"
    );

    await runtime.setMode(APP_MODE.NORMAL);

    assert.equal(
      runtime.resolvePermissionAutomationMode(requestContext, "off"),
      "off"
    );
  });

  it("uses a distinct generation when Automatic is re-entered", async () => {
    const runtime = createAppModeRuntime();
    await runtime.setMode(APP_MODE.AUTOMATIC, { confirmed: true });
    const firstAutomaticRequest = runtime.capturePermissionRequest();

    await runtime.setMode(APP_MODE.NORMAL);
    await runtime.setMode(APP_MODE.AUTOMATIC);
    const secondAutomaticRequest = runtime.capturePermissionRequest();

    assert.notEqual(
      secondAutomaticRequest.generation,
      firstAutomaticRequest.generation
    );
    assert.equal(
      runtime.isAutomaticPermissionRequestCurrent(firstAutomaticRequest),
      false
    );
    assert.equal(
      runtime.isAutomaticPermissionRequestCurrent(secondAutomaticRequest),
      true
    );
    assert.equal(
      runtime.resolvePermissionAutomationMode(firstAutomaticRequest, "off"),
      "off"
    );
    assert.equal(
      runtime.resolvePermissionAutomationMode(secondAutomaticRequest, "off"),
      "unattended"
    );
  });

  it("keeps Normal saved automation behavior on a Normal ingress ticket", () => {
    const runtime = createAppModeRuntime();
    const requestContext = runtime.capturePermissionRequest();

    assert.equal(
      runtime.resolvePermissionAutomationMode(requestContext, "auto-tools"),
      "auto-tools"
    );
    assert.equal(
      runtime.resolvePermissionAutomationMode(requestContext, "unattended"),
      "unattended"
    );
  });

  it("keeps the request automation resolver usable as a detached callback", async () => {
    const runtime = createAppModeRuntime();
    await runtime.setMode(APP_MODE.AUTOMATIC, { confirmed: true });
    const requestContext = runtime.capturePermissionRequest();
    const resolvePermissionAutomationMode = runtime.resolvePermissionAutomationMode;

    assert.equal(
      resolvePermissionAutomationMode(requestContext, "off"),
      "unattended"
    );
  });

  it("starts each runtime Normal and unauthorized after a prior Automatic run", async () => {
    const previousRuntime = createAppModeRuntime();
    assert.deepStrictEqual(
      await previousRuntime.setMode(APP_MODE.AUTOMATIC, { confirmed: true }),
      { status: "ok", mode: APP_MODE.AUTOMATIC }
    );
    assert.equal(previousRuntime.isAutomaticAuthorized(), true);

    const restartedRuntime = createAppModeRuntime();
    assert.equal(restartedRuntime.getMode(), APP_MODE.NORMAL);
    assert.equal(restartedRuntime.isAutomaticAuthorized(), false);
    assert.deepStrictEqual(
      await restartedRuntime.setMode(APP_MODE.AUTOMATIC),
      { status: "confirmation-required", mode: APP_MODE.NORMAL }
    );
  });

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

describe("app mode controller pet visibility", () => {
  function createPetController({ initialHidden = false, effects = {} } = {}) {
    const calls = { hide: 0, show: 0 };
    let hidden = initialHidden;
    return {
      calls,
      isHidden: () => hidden,
      controller: createAppModeController({
        ...effects,
        hidePet: () => { calls.hide += 1; hidden = true; },
        showPet: () => { calls.show += 1; hidden = false; },
        isPetHidden: () => hidden,
      }),
    };
  }

  it("hides the pet when Background is entered", async () => {
    const { controller, calls, isHidden } = createPetController();
    const result = await controller.setActiveAppMode(APP_MODE.BACKGROUND);
    assert.deepStrictEqual(result, { status: "ok", mode: APP_MODE.BACKGROUND });
    assert.equal(calls.hide, 1);
    assert.equal(calls.show, 0);
    assert.equal(isHidden(), true);
  });

  it("restores the pet when leaving Background if it was visible on entry", async () => {
    const { controller, calls, isHidden } = createPetController();
    await controller.setActiveAppMode(APP_MODE.BACKGROUND);
    await controller.setActiveAppMode(APP_MODE.NORMAL);
    assert.equal(calls.hide, 1);
    assert.equal(calls.show, 1);
    assert.equal(isHidden(), false);
  });

  it("keeps the pet hidden when leaving Background if it was manually hidden before entry", async () => {
    const { controller, calls, isHidden } = createPetController({ initialHidden: true });
    await controller.setActiveAppMode(APP_MODE.BACKGROUND);
    await controller.setActiveAppMode(APP_MODE.NORMAL);
    assert.equal(calls.hide, 1);
    assert.equal(calls.show, 0);
    assert.equal(isHidden(), true);
  });

  it("restores the pet when a failed Background transition rolls back", async () => {
    let failOnce = true;
    const { controller, calls, isHidden } = createPetController({
      effects: {
        enableDoNotDisturb: () => {
          if (failOnce) {
            failOnce = false;
            throw new Error("do not disturb failed");
          }
        },
      },
    });
    const result = await controller.setActiveAppMode(APP_MODE.BACKGROUND);
    assert.equal(result.status, "error");
    assert.equal(controller.getActiveAppMode(), APP_MODE.NORMAL);
    assert.equal(calls.hide, 1);
    assert.equal(calls.show, 1);
    assert.equal(isHidden(), false);
  });

  it("leaves pet visibility untouched in Automatic mode", async () => {
    const { controller, calls } = createPetController();
    await controller.setActiveAppMode(APP_MODE.AUTOMATIC, { confirmed: true });
    assert.equal(calls.hide, 0);
    assert.equal(calls.show, 0);
  });
});
