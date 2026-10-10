const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");

// Load default theme for test ctx
const themeLoader = require("../src/theme-loader");
themeLoader.init(path.join(__dirname, "..", "src"));
const _defaultTheme = themeLoader.loadTheme("clawd");

function makeCtx() {
  return {
    theme: _defaultTheme,
    doNotDisturb: false,
    miniTransitioning: false,
    miniMode: false,
    mouseOverPet: false,
    idlePaused: false,
    forceEyeResend: false,
    mouseStillSince: Date.now(),
    playSound() {},
    sendToRenderer() {},
    syncHitWin() {},
    sendToHitWin() {},
    miniPeekIn() {},
    miniPeekOut() {},
    buildContextMenu() {},
    buildTrayMenu() {},
    pendingPermissions: [],
    resolvePermissionEntry() {},
    t: (k) => k,
    focusTerminalWindow() {},
  };
}

describe("display_svg session hints (updateSession path)", () => {
  let api;
  const pid = process.pid;

  beforeEach(() => {
    api = require("../src/state")(makeCtx());
  });

  function baseOpts(overrides = {}) {
    return {
      cwd: "/tmp",
      editor: "cursor",
      agentPid: pid,
      agentId: "cursor-agent",
      ...overrides,
    };
  }

  it("uses allowlisted display_svg for working state", () => {
    api.updateSession("c1", "working", "PreToolUse", baseOpts({ displayHint: "clawd-working-building.svg" }));
    assert.strictEqual(api.getSvgOverride("working"), "clawd-working-typing.svg");
  });

  it("falls back to getWorkingSvg when no hint", () => {
    api.updateSession("c1", "working", "PreToolUse", baseOpts());
    assert.strictEqual(api.getSvgOverride("working"), "clawd-working-typing.svg");
  });

  it("ignores non-allowlisted svg and falls back", () => {
    api.updateSession("c1", "working", "PreToolUse", baseOpts({ displayHint: "evil.svg" }));
    assert.strictEqual(api.getSvgOverride("working"), "clawd-working-typing.svg");
  });

  it("picks the most recently updated session among working sessions", async () => {
    api.updateSession("a", "working", "PreToolUse", baseOpts({ cwd: "/a", displayHint: "clawd-working-building.svg" }));
    await new Promise((r) => setTimeout(r, 5));
    api.updateSession("b", "working", "PostToolUse", baseOpts({ cwd: "/b", displayHint: "clawd-idle-reading.svg" }));
    assert.strictEqual(api.getSvgOverride("working"), "clawd-working-typing.svg");
  });

  it("clears hint when display_svg is null", () => {
    api.updateSession("c1", "working", "PreToolUse", baseOpts({ displayHint: "clawd-working-building.svg" }));
    assert.strictEqual(api.getSvgOverride("working"), "clawd-working-typing.svg");
    api.updateSession("c1", "working", "PostToolUse", baseOpts({ displayHint: null }));
    assert.strictEqual(api.getSvgOverride("working"), "clawd-working-typing.svg");
  });

  it("applies thinking hint for thinking state", () => {
    api.updateSession("c1", "thinking", "AfterAgentThought", baseOpts({ displayHint: "clawd-working-thinking.svg" }));
    assert.strictEqual(api.getSvgOverride("thinking"), "clawd-working-typing.svg");
  });
});

// #509: user-selected default idle visual flows through state.js
describe("default idle visual (getIdleVisualChoice ctx hook)", () => {
  it("getSvgOverride('idle') returns the user choice when set", () => {
    const ctx = makeCtx();
    ctx.getIdleVisualChoice = () => "clawd-idle-reading.svg";
    const api = require("../src/state")(ctx);
    assert.strictEqual(api.getSvgOverride("idle"), "clawd-idle-follow.svg");
  });

  it("getSvgOverride('idle') falls back to the follow sprite when unset", () => {
    const ctx = makeCtx();
    ctx.getIdleVisualChoice = () => null;
    const api = require("../src/state")(ctx);
    assert.strictEqual(api.getSvgOverride("idle"), "clawd-idle-follow.svg");

    const apiNoHook = require("../src/state")(makeCtx());
    assert.strictEqual(apiNoHook.getSvgOverride("idle"), "clawd-idle-follow.svg");
  });

  it("applyState('idle') with no override rests on the user choice", () => {
    const ctx = makeCtx();
    ctx.getIdleVisualChoice = () => "clawd-idle-reading.svg";
    const api = require("../src/state")(ctx);
    api.applyState("idle");
    assert.strictEqual(api.getCurrentSvg(), "clawd-idle-follow.svg");
  });

  it("applyState('idle') without the hook keeps today's behavior", () => {
    const api = require("../src/state")(makeCtx());
    api.applyState("idle");
    assert.strictEqual(api.getCurrentSvg(), "clawd-idle-follow.svg");
  });

  it("an explicit svgOverride still wins over the user choice", () => {
    const ctx = makeCtx();
    ctx.getIdleVisualChoice = () => "clawd-idle-reading.svg";
    const api = require("../src/state")(ctx);
    api.applyState("idle", "clawd-idle-bubble.svg");
    assert.strictEqual(api.getCurrentSvg(), "clawd-idle-follow.svg");
  });
});

it('action frames update the click geometry without changing Agent state or restarting its lifecycle',()=>{
  const ctx=makeCtx(), sync=[];ctx.sendToHitWin=(channel,payload)=>sync.push([channel,payload]);
  const plan=require('../src/pet-action-plan').defaultPlan(ctx.theme);
  plan.states.working.actions.push({file:'clawd-sleeping.svg',enabled:true,durationMs:5000});
  ctx.theme={...ctx.theme,_userOverrides:{actionPlan:plan}};
  const api=require('../src/state')(ctx);api.applyState('working');
  api.setActionVisual('clawd-sleeping.svg');
  assert.strictEqual(api.getCurrentState(),'working');
  assert.strictEqual(api.getCurrentSvg(),'clawd-sleeping.svg');
  assert.deepStrictEqual(api.getCurrentHitBox(),ctx.theme.hitBoxes.sleeping);
  assert.strictEqual(sync.at(-1)[0],'hit-state-sync');api.cleanup();
});


it('completion sequence finishes native actions instead of old manual short durations', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 100000 });
  const ctx = makeCtx();
  const plan = require('../src/pet-action-plan').defaultPlan(ctx.theme);
  plan.states.complete = { mode: 'sequence', actions: [
    { file: ctx.theme.states.complete[0], enabled: true, durationMs: 2000 },
    { file: ctx.theme.states.idle[0], enabled: true, durationMs: 3000 },
  ] };
  ctx.theme = { ...ctx.theme, actionDurations: { [ctx.theme.states.complete[0]]: 4000, [ctx.theme.states.idle[0]]: 6000 }, _userOverrides: { actionPlan: plan } };
  const api = require('../src/state')(ctx);
  try {
    api.applyState('attention');
    t.mock.timers.tick(9999);
    assert.strictEqual(api.getCurrentState(), 'complete');
    t.mock.timers.tick(1);
    assert.strictEqual(api.getCurrentState(), 'idle');
  } finally { api.cleanup(); }
});

it('random completion uses native timing even if a stale renderer reports a short duration', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 100000 });
  const ctx = makeCtx();
  const plan = require('../src/pet-action-plan').defaultPlan(ctx.theme);
  plan.states.complete = { mode: 'random', actions: [
    { file: ctx.theme.states.complete[0], enabled: true, durationMs: 2000 },
    { file: ctx.theme.states.idle[0], enabled: true, durationMs: 6000 },
  ] };
  ctx.theme = { ...ctx.theme, actionDurations: { [ctx.theme.states.complete[0]]: 4000, [ctx.theme.states.idle[0]]: 6000 }, _userOverrides: { actionPlan: plan } };
  const api = require('../src/state')(ctx);
  try {
    api.applyState('attention');
    api.reportPetActionFrame({...api.getPetStateSnapshot(),file:ctx.theme.states.complete[0],returnAfterMs:2000});
    t.mock.timers.tick(3999);
    assert.strictEqual(api.getCurrentState(), 'complete');
    t.mock.timers.tick(1);
    assert.strictEqual(api.getCurrentState(), 'idle');
  } finally { api.cleanup(); }
});


it('empty completion inherits idle sequence duration before returning', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 100000 });
  const ctx = makeCtx();
  const plan = require('../src/pet-action-plan').defaultPlan(ctx.theme);
  plan.states.complete.actions = [];
  plan.states.idle = { mode: 'sequence', actions: [
    { file: ctx.theme.states.complete[0], enabled: true, durationMs: 2000 },
    { file: ctx.theme.states.idle[0], enabled: true, durationMs: 6000 },
  ] };
  ctx.theme = { ...ctx.theme, actionDurations: { [ctx.theme.states.complete[0]]: 4000, [ctx.theme.states.idle[0]]: 6000 }, _userOverrides: { actionPlan: plan } };
  const api = require('../src/state')(ctx);
  try {
    api.applyState('attention');
    t.mock.timers.tick(9999);
    assert.strictEqual(api.getCurrentState(), 'complete');
    t.mock.timers.tick(1);
    assert.strictEqual(api.getCurrentState(), 'idle');
  } finally { api.cleanup(); }
});
