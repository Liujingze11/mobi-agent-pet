"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HIT_RENDERER = path.join(__dirname, "..", "src", "hit-renderer.js");
const SOURCE = fs.readFileSync(HIT_RENDERER, "utf8").replace(/\r\n/g, "\n");

class FakeArea {
  constructor() {
    this.style = {};
    this.classList = {
      _set: new Set(),
      add: (c) => this.classList._set.add(c),
      remove: (c) => this.classList._set.delete(c),
    };
    this.offsetWidth = 200;
    this.listeners = new Map();
  }
  addEventListener(event, cb) { this.listeners.set(event, cb); }
  setPointerCapture() {}
}

function createHarness({ isMac = false, sendState = {} } = {}) {
  const apiCalls = [];
  const apiHandlers = {};
  const area = new FakeArea();

  const fakeDocument = {
    getElementById(id) { return id === "hit-area" ? area : null; },
    addEventListener(event, cb) {
      if (!fakeDocument._listeners) fakeDocument._listeners = new Map();
      fakeDocument._listeners.set(event, cb);
    },
    _dispatch(event, payload) {
      const cb = fakeDocument._listeners && fakeDocument._listeners.get(event);
      if (cb) cb(payload);
    },
  };

  const timers = [];
  let timerId = 0;
  let now = 1000;
  const context = {
    MobiPetInputPolicy: require("../src/pet-input-policy"),
    Date: { now: () => now },
    document: fakeDocument,
    window: {
      hitPlatform: { isMac, platform: isMac ? "darwin" : "win32" },
      hitThemeConfig: { reactions: {
        double: { file: "flail.svg", duration: 3500 },
        annoyed: { file: "annoyed.svg", duration: 3500 },
        clickLeft: { file: "left.svg", duration: 2500 },
        clickRight: { file: "right.svg", duration: 2500 },
      } },
      hitAPI: {
        onThemeConfig: (cb) => { apiHandlers.themeConfig = cb; },
        dragLock: (v, gestureId) => { apiHandlers.gestureId = gestureId; apiCalls.push(["dragLock", v]); },
        onDragStarted: cb => { apiHandlers.dragStarted = cb; },
        dragMove: () => apiCalls.push(["dragMove"]),
        dragEnd: () => apiCalls.push(["dragEnd"]),
        showContextMenu: () => apiCalls.push(["showContextMenu"]),
        focusTerminal: () => apiCalls.push(["focusTerminal"]),
        exitMiniMode: () => apiCalls.push(["exitMiniMode"]),
        showDashboard: () => apiCalls.push(["showDashboard"]),
        revealSessionHud: () => apiCalls.push(["revealSessionHud"]),
        startDragReaction: (direction) => apiCalls.push(["startDragReaction", direction]),
        endDragReaction: () => apiCalls.push(["endDragReaction"]),
        playClickReaction: (svg, d) => apiCalls.push(["playClickReaction", svg, d]),
        onStateSync: (cb) => { apiHandlers.stateSync = cb; },
        onCancelReaction: (cb) => { apiHandlers.cancelReaction = cb; },
        // Drop bridge (#459): fake files carry .path; "" mimics webUtils
        // returning nothing for non-filesystem Files.
        getPathForFile: (file) => (file && file.path) || "",
        dropPaths: (paths) => apiCalls.push(["dropPaths", paths]),
        onDropAccepted: (cb) => { apiHandlers.dropAccepted = cb; },
      },
      addEventListener: () => {},
    },
    setTimeout: (cb, ms) => {
      const t = { id: ++timerId, cb, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimeout: (t) => { if (t) t.cleared = true; },
    requestAnimationFrame: (cb) => context.setTimeout(cb, 16),
    cancelAnimationFrame: (t) => context.clearTimeout(t),
    console: { warn() {} },
  };
  context.globalThis = context;

  vm.runInNewContext(SOURCE, context);

  // Apply initial state if provided
  if (apiHandlers.stateSync && Object.keys(sendState).length) {
    apiHandlers.stateSync(sendState);
  } else if (apiHandlers.stateSync) {
    // Default: idle, non-mini, non-DND
    apiHandlers.stateSync({ currentState: "idle", miniMode: false, dndEnabled: false });
  }

  function pointerup({ button = 0, ctrlKey = false, metaKey = false, clientX = 100, clientY = 100, screenX = clientX, screenY = clientY } = {}) {
    fakeDocument._dispatch("pointerup", { button, ctrlKey, metaKey, clientX, clientY, screenX, screenY });
  }

  function pointerdown({ button = 0, pointerId = 1, clientX = 100, clientY = 100, screenX = clientX, screenY = clientY } = {}) {
    const cb = area.listeners.get("pointerdown");
    if (cb) cb({ button, pointerId, clientX, clientY, screenX, screenY });
  }

  function pointermove({ clientX = 100, clientY = 100, screenX = clientX, screenY = clientY } = {}) {
    fakeDocument._dispatch("pointermove", { clientX, clientY, screenX, screenY });
  }

  function fireTimer(predicate) {
    const t = timers.find((x) => !x.cleared && predicate(x));
    if (!t) return false;
    t.cleared = true;
    t.cb();
    return true;
  }

  return { apiCalls, apiHandlers, pointerdown, pointermove, pointerup, fireTimer, timers, area, context, advanceTime: ms => { now += ms; } };
}

describe("hit-renderer input layer", () => {
  it("native double-click reveals the task HUD in idle, working, waiting and roam states", () => {
    for (const currentState of ["idle", "working", "waiting", "roam"]) {
      const h = createHarness({ sendState: { currentState } });
      h.context.document._dispatch("dblclick", { button: 0, ctrlKey: false, metaKey: false, preventDefault() {} });
      assert.strictEqual(h.apiCalls.filter((call) => call[0] === "revealSessionHud").length, 1, currentState);
      assert.ok(!h.apiCalls.some((call) => call[0] === "showContextMenu"));
    }
  });

  it("a double-click survives the held-state cancellation messages produced by both clicks", () => {
    const h = createHarness();
    for (let i = 0; i < 2; i++) {
      h.pointerdown({});
      h.apiHandlers.stateSync({ currentState: "held" });
      h.apiHandlers.cancelReaction();
      h.pointerup({});
      h.apiHandlers.stateSync({ currentState: "working" });
      h.apiHandlers.cancelReaction();
    }
    h.context.document._dispatch("dblclick", { button: 0, preventDefault() {} });
    assert.strictEqual(h.apiCalls.filter((call) => call[0] === "revealSessionHud").length, 1);
  });

  it("double-click does not reveal cards during DND or modified dashboard clicks", () => {
    for (const sendState of [{ dndEnabled: true }]) {
      const h = createHarness({ sendState });
      h.context.document._dispatch("dblclick", { button: 0, preventDefault() {} });
      assert.ok(!h.apiCalls.some((call) => call[0] === "revealSessionHud"));
    }
    for (const modifier of ["ctrlKey", "metaKey"]) {
      const h = createHarness();
      h.context.document._dispatch("dblclick", { button: 0, [modifier]: true, preventDefault() {} });
      assert.ok(!h.apiCalls.some((call) => call[0] === "revealSessionHud"));
    }
  });

  it("release movement still counts as a drag when no pointermove was delivered", () => {
    const h = createHarness();
    h.pointerdown({ clientX: 100, clientY: 100 });
    h.pointerup({ clientX: 130, clientY: 120 });
    assert.ok(h.apiCalls.some((call) => call[0] === "dragEnd"));
    h.context.document._dispatch("dblclick", { button: 0, preventDefault() {} });
    assert.ok(!h.apiCalls.some((call) => call[0] === "revealSessionHud"));
  });

  it("plain single click does not reveal the session HUD or focus a terminal", () => {
    const h = createHarness();
    h.pointerup({});
    const names = h.apiCalls.map((c) => c[0]);
    assert.ok(!names.includes("revealSessionHud"), "must not reveal the session HUD");
    assert.ok(!names.includes("focusTerminal"), "must not call focusTerminal");
  });

  it("plain single click does not open the context menu after release and the click window", () => {
    const h = createHarness();
    h.pointerdown({});
    h.pointerup({});
    h.fireTimer((t) => t.ms === 400);
    assert.ok(!h.apiCalls.some((call) => call[0] === "showContextMenu"),
      "single click must not open the context menu");
  });

  it("right-click suppresses menus while dragging still completes normally", () => {
    const h = createHarness();
    let prevented = false;
    h.context.document._dispatch("contextmenu", { preventDefault() { prevented = true; } });
    assert.ok(prevented, "the browser context menu must also be suppressed");
    assert.strictEqual(h.apiCalls.filter((call) => call[0] === "showContextMenu").length, 0);
    h.pointerdown({ clientX: 100, clientY: 100 });
    h.pointermove({ clientX: 130, clientY: 120 });
    h.pointerup({ clientX: 130, clientY: 120 });
    assert.ok(h.apiCalls.some((call) => call[0] === "dragEnd"));
    assert.strictEqual(h.apiCalls.filter((call) => call[0] === "showContextMenu").length, 0);
  });

  it("the legacy click accumulator cannot play unassigned reactions or open the menu", () => {
    const h = createHarness();
    h.pointerup({});
    h.pointerup({});
    h.fireTimer((t) => t.ms === 400);
    assert.ok(!h.apiCalls.some((call) => call[0] === "playClickReaction"),
      "double click cannot play unassigned theme reactions");
    assert.ok(!h.apiCalls.some((call) => call[0] === "showContextMenu"),
      "double click should not open the single-click menu");
  });

  it("Ctrl+click on non-mac opens Dashboard, does NOT call reveal", () => {
    const h = createHarness({ isMac: false });
    h.pointerup({ ctrlKey: true });
    const names = h.apiCalls.map((c) => c[0]);
    assert.ok(names.includes("showDashboard"), "should open Dashboard");
    assert.ok(!names.includes("revealSessionHud"), "must not reveal HUD on Ctrl+click");
  });

  it("Cmd+click on mac opens Dashboard", () => {
    const h = createHarness({ isMac: true });
    h.pointerup({ metaKey: true });
    const names = h.apiCalls.map((c) => c[0]);
    assert.ok(names.includes("showDashboard"));
    assert.ok(!names.includes("revealSessionHud"));
  });

  it("Ctrl+click on mac does NOT open Dashboard and does NOT reveal (system right-click)", () => {
    const h = createHarness({ isMac: true });
    h.pointerup({ ctrlKey: true });
    const names = h.apiCalls.map((c) => c[0]);
    assert.ok(!names.includes("showDashboard"), "mac Ctrl+click must not trigger Dashboard");
    assert.ok(!names.includes("revealSessionHud"), "mac Ctrl+click must not reveal HUD");
  });


  it("miniMode + Ctrl+click goes to Dashboard, does NOT exit mini (preserves pre-v5 behavior)", () => {
    const h = createHarness({ isMac: false });
    h.apiHandlers.stateSync({ miniMode: true });
    h.pointerup({ ctrlKey: true });
    const names = h.apiCalls.map((c) => c[0]);
    assert.ok(names.includes("showDashboard"), "Ctrl+click in mini should still open Dashboard");
    assert.ok(!names.includes("exitMiniMode"), "Ctrl+click in mini must NOT exit mini");
  });

  it("single clicks in working state do not open the menu or reveal the session HUD", () => {
    const h = createHarness();
    h.apiHandlers.stateSync({ currentState: "working" });
    h.pointerup({});
    h.fireTimer((t) => t.ms === 400);
    const names = h.apiCalls.map((c) => c[0]);
    assert.ok(!names.includes("showContextMenu"));
    assert.ok(!names.includes("revealSessionHud"));
    assert.ok(!names.includes("focusTerminal"));
  });

  it("DND + double click does NOT play reaction (canPlayReactionNow fresh-read)", () => {
    const h = createHarness();
    h.apiHandlers.stateSync({ dndEnabled: true });
    h.pointerup({});
    h.pointerup({});
    // Fire the reaction timer
    h.fireTimer((t) => t.ms === 400);
    const names = h.apiCalls.map((c) => c[0]);
    assert.ok(!names.includes("playClickReaction"), "DND must gate reaction playback");
  });

  it("Ctrl+click resets click accumulator (no stale double-click)", () => {
    const h = createHarness({ isMac: false });
    h.pointerup({});            // plain click 1 — accumulates
    h.pointerup({ ctrlKey: true }); // Ctrl+click should reset
    h.pointerup({});            // plain click 2 — must be a fresh first click
    // Fire the reset timer (single-click path schedules 400ms reset)
    h.fireTimer((t) => t.ms === 400);
    const names = h.apiCalls.map((c) => c[0]);
    // No double-click reaction should fire from "1 + reset + 1"
    assert.ok(!names.includes("playClickReaction"),
      "Ctrl+click between plain clicks should not produce a double-click reaction");
  });

  it("cancel-reaction clears reactionTimer + accumulator", () => {
    const h = createHarness();
    h.pointerup({});
    h.pointerup({});  // clickCount=2, sets reactionTimer
    h.apiHandlers.cancelReaction();
    // Subsequent timer fire should be no-op (cleared)
    const before = h.apiCalls.length;
    h.fireTimer((t) => t.ms === 400);
    assert.strictEqual(h.apiCalls.length, before,
      "after cancelReaction, no new reaction should fire");
  });

  it("updates the drag reaction when horizontal direction changes", () => {
    const h = createHarness();
    h.pointerdown({ clientX: 100, clientY: 100 });
    h.pointermove({ clientX: 90, clientY: 100 });
    h.pointermove({ clientX: 80, clientY: 100 });
    h.pointermove({ clientX: 95, clientY: 100 });

    assert.ok(h.apiCalls.some(call => call[0] === "dragLock" && call[1] === true));
    assert.deepStrictEqual(h.apiCalls.filter(call => call[0] === "startDragReaction"), []);
  });});

describe("hit-renderer OS file drop (#459)", () => {
  function makeDragEvent({ types = ["Files"], files = [] } = {}) {
    return {
      prevented: false,
      preventDefault() { this.prevented = true; },
      dataTransfer: { types, files, dropEffect: "" },
    };
  }

  it("macOS registers no drop machinery at all: no listeners, no affordance, no accept handler", () => {
    const h = createHarness({ isMac: true });
    assert.strictEqual(h.area.listeners.get("dragover"), undefined);
    assert.strictEqual(h.area.listeners.get("drop"), undefined);
    assert.strictEqual(h.apiHandlers.dropAccepted, undefined);
  });

  it("dragover with files shows the copy affordance outside mini mode", () => {
    const h = createHarness();
    const evt = makeDragEvent();
    h.area.listeners.get("dragover")(evt);
    assert.strictEqual(evt.prevented, true);
    assert.strictEqual(evt.dataTransfer.dropEffect, "copy");
  });

  it("dragover gives no affordance for non-file drags", () => {
    const h = createHarness();
    const textEvt = makeDragEvent({ types: ["text/plain"] });
    h.area.listeners.get("dragover")(textEvt);
    assert.strictEqual(textEvt.prevented, false);
  });

  it("drop resolves paths through the preload bridge, filtering non-filesystem Files", () => {
    const h = createHarness();
    const evt = makeDragEvent({ files: [{ path: "" }, { path: "/proj/dir" }, { path: "/other" }] });
    h.area.listeners.get("drop")(evt);
    assert.strictEqual(evt.prevented, true);
    // Array.from: the paths array is born in the vm realm — copy it into the
    // host realm so deepStrictEqual's prototype check passes.
    const dropCalls = h.apiCalls
      .filter((c) => c[0] === "dropPaths")
      .map((c) => [c[0], Array.from(c[1])]);
    assert.deepStrictEqual(dropCalls, [["dropPaths", ["/proj/dir", "/other"]]]);
  });

  it("drop sends nothing when every File lacks a filesystem path", () => {
    const h = createHarness();
    const evt = makeDragEvent({ files: [{ path: "" }] });
    h.area.listeners.get("drop")(evt);
    assert.deepStrictEqual(h.apiCalls.filter((c) => c[0] === "dropPaths"), []);
  });


  it("accepted drops cannot play unassigned reaction assets", () => {
    const h=createHarness();h.apiHandlers.dropAccepted();h.apiHandlers.dropAccepted();
    assert.deepStrictEqual(h.apiCalls.filter(c=>c[0] === "playClickReaction"), []);
  });

  it("accepted drop stays silent for drag-only themes (Cloudling) or a busy pet", () => {
    const noReact = createHarness();
    noReact.apiHandlers.themeConfig({ reactions: { drag: { file: "drag.svg" } } });
    noReact.apiHandlers.dropAccepted();
    assert.deepStrictEqual(noReact.apiCalls.filter((c) => c[0] === "playClickReaction"), []);

    const busy = createHarness({ sendState: { currentState: "working", miniMode: false, dndEnabled: false } });
    busy.apiHandlers.dropAccepted();
    assert.deepStrictEqual(busy.apiCalls.filter((c) => c[0] === "playClickReaction"), []);
  });
});

it('pointer press lifts the pet before movement and releases after an Agent state update',()=>{
  const h=createHarness();h.pointerdown({});
  assert.ok(h.apiCalls.some(c=>c[0]==='dragLock' && c[1]===true),'press should lift without crossing the drag threshold');
  h.apiHandlers.cancelReaction();h.pointerup({});
  assert.ok(h.apiCalls.some(c=>c[0]==='dragLock' && c[1]===false),'state changes while held must not strand the lift');
});


it('two clicks with small hand jitter open the HUD without a native dblclick event',()=>{
 const h=createHarness();
 h.pointerdown({clientX:100});h.pointermove({clientX:105});h.pointerup({clientX:105});
 h.apiHandlers.cancelReaction();h.advanceTime(120);
 h.pointerdown({clientX:105});h.pointermove({clientX:101});h.pointerup({clientX:101});
 assert.ok(!h.apiCalls.some(call=>call[0]==='dragEnd'));
 assert.equal(h.apiCalls.filter(call=>call[0]==='revealSessionHud').length,1);
 h.context.document._dispatch('dblclick',{button:0,preventDefault(){}});
 assert.equal(h.apiCalls.filter(call=>call[0]==='revealSessionHud').length,1,'native event must not duplicate the fallback');
});
it('input-window repositioning does not turn stationary screen clicks into drags',()=>{
 const h=createHarness();
 h.pointerdown({clientX:100,screenX:600});h.pointerup({clientX:132,screenX:600});h.advanceTime(120);
 h.pointerdown({clientX:80,screenX:600});h.pointerup({clientX:110,screenX:600});
 assert.ok(!h.apiCalls.some(call=>call[0]==='dragEnd'));
 assert.equal(h.apiCalls.filter(call=>call[0]==='revealSessionHud').length,1);
});
it('a drag or cancellation breaks the click pair and slow clicks stay single',()=>{
 const h=createHarness();h.pointerdown({});h.pointerup({});h.advanceTime(100);
 h.pointerdown({});h.pointermove({clientX:130});h.pointerup({clientX:130});
 h.pointerdown({clientX:130});h.pointerup({clientX:130});assert.equal(h.apiCalls.filter(call=>call[0]==='revealSessionHud').length,0);
 h.advanceTime(600);h.pointerdown({});h.area.listeners.get('pointercancel')();h.pointerdown({});h.pointerup({});assert.equal(h.apiCalls.filter(call=>call[0]==='revealSessionHud').length,0);
 h.advanceTime(600);h.pointerdown({});h.pointerup({});assert.equal(h.apiCalls.filter(call=>call[0]==='revealSessionHud').length,0);
});
it('double-click fallback retains DND and modified-click behavior',()=>{
 for(const sendState of [{dndEnabled:true}]){const h=createHarness({sendState});h.pointerdown({});h.pointerup({});h.advanceTime(100);h.pointerdown({});h.pointerup({});assert.ok(!h.apiCalls.some(call=>call[0]==='revealSessionHud'));}
 for(const modifier of ['ctrlKey','metaKey']){const h=createHarness();h.pointerdown({});h.pointerup({[modifier]:true});h.advanceTime(100);h.pointerdown({});h.pointerup({[modifier]:true});assert.ok(!h.apiCalls.some(call=>call[0]==='revealSessionHud'));}
});
it('an excluded modifier click interrupts the HUD double-click pair',()=>{
 const h=createHarness();h.pointerdown({});h.pointerup({});h.advanceTime(100);h.pointerdown({});h.pointerup({metaKey:true});h.advanceTime(100);h.pointerdown({});h.pointerup({});assert.equal(h.apiCalls.filter(call=>call[0]==='revealSessionHud').length,0);
});
it('entering DND clears a pending HUD pair without clearing ordinary held updates',()=>{
 for(const field of ['dndEnabled']){
  const h=createHarness();h.pointerdown({});h.pointerup({});h.advanceTime(100);h.apiHandlers.stateSync({[field]:true});h.apiHandlers.stateSync({[field]:false});h.advanceTime(100);h.pointerdown({});h.pointerup({});assert.equal(h.apiCalls.filter(call=>call[0]==='revealSessionHud').length,0,field);
 }
});

it('main-confirmed out-and-back dragging cannot become a second click',()=>{
 const h=createHarness();h.pointerdown({});h.pointerup({});h.advanceTime(100);h.pointerdown({});
 h.apiHandlers.dragStarted({gestureId:h.apiHandlers.gestureId});h.pointerup({});
 h.context.document._dispatch('dblclick',{button:0,preventDefault(){}});
 assert.ok(h.apiCalls.some(call=>call[0]==='dragEnd'));assert.equal(h.apiCalls.filter(call=>call[0]==='revealSessionHud').length,0);
});
it('a late drag result for an old gesture cannot cancel new clicks',()=>{
 const h=createHarness();h.pointerdown({});const old=h.apiHandlers.gestureId;h.pointerup({});h.advanceTime(100);h.pointerdown({});h.apiHandlers.dragStarted({gestureId:old});h.pointerup({});
 assert.equal(h.apiCalls.filter(call=>call[0]==='revealSessionHud').length,1);assert.ok(!h.apiCalls.some(call=>call[0]==='dragEnd'));
});

it('old mini sync flags cannot block ordinary pickup, drag or task card clicks',()=>{
 const h=createHarness({sendState:{currentState:'idle',miniMode:true,dndEnabled:false}});
 h.pointerdown({clientX:100,clientY:100});h.pointermove({clientX:140,clientY:130});h.pointerup({clientX:140,clientY:130});
 assert.ok(h.apiCalls.some(call=>call[0]==='dragLock'&&call[1]===true));assert.ok(h.apiCalls.some(call=>call[0]==='dragEnd'));
 h.advanceTime(600);h.pointerdown({clientX:140});h.pointerup({clientX:140});h.advanceTime(100);h.pointerdown({clientX:140});h.pointerup({clientX:140});
 assert.equal(h.apiCalls.filter(call=>call[0]==='revealSessionHud').length,1);assert.ok(!h.apiCalls.some(call=>call[0]==='exitMiniMode'));
});
