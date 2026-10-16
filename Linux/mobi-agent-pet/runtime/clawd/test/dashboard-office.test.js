"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const office = require("../src/dashboard-office");

test("the office only uses four actions and holds work actions for at least twenty seconds", () => {
  assert.deepEqual(office.ACTIONS.map(action => action.id), ["typing", "mouse", "phone", "coffee"]);
  assert.equal(office.getFrame(19000, "working").action, "typing");
  assert.equal(office.getFrame(37000, "working").action, "mouse");
  assert.ok(office.ACTIONS.filter(action => action.id !== "coffee").every(action => action.duration >= 20000));
});

test("session states select work, waiting, completion and idle behavior", () => {
  assert.equal(office.deriveMode([{ state: "working", badge: "running" }]), "working");
  assert.equal(office.deriveMode([{ state: "attention", badge: "running" }]), "waiting");
  assert.equal(office.deriveMode([{ state: "complete", badge: "done" }]), "complete");
  assert.equal(office.deriveMode([]), "idle");
});

test("coffee finishes once and does not repeat while waiting; brief state changes do not interrupt", () => {
  const dom = new JSDOM('<div id="scene"></div>');
  let now = 0;
  const scene = office.create({ container: dom.window.document.getElementById("scene"), now: () => now, autoStart: false });
  try {
    scene.setActive(true);
    scene.setSessions([{ state: "working" }]);
    now = 10000; scene.tick();
    scene.setSessions([{ state: "attention" }]);
    now += 1000; scene.tick();
    assert.equal(scene.getState().action, "typing");
    now += 1000; scene.tick();
    assert.equal(scene.getState().action, "coffee");
    now += 5500; scene.tick();
    assert.equal(scene.getState().action, "mouse");
    now += 30000; scene.tick();
    assert.equal(scene.getState().action, "mouse");
    scene.setSessions([{ state: "complete" }]);
    now += 3000; scene.tick();
    assert.equal(scene.getState().action, "mouse", "coffee has a long cooldown across state changes");
  } finally { scene.destroy(); dom.window.close(); }
});

test("typing fills the editor and the terminal keeps changing during the other actions", () => {
  const start = office.getScreen(0, "typing");
  const later = office.getScreen(3500, "typing");
  assert.ok(later.code.length > start.code.length);
  assert.notEqual(office.getScreen(400, "phone").terminal, office.getScreen(3400, "phone").terminal);
});

test("leaving the overview freezes the scene and resuming preserves its place", () => {
  const dom = new JSDOM('<div id="scene"></div>');
  let now = 0;
  const scene = office.create({ container: dom.window.document.getElementById("scene"), now: () => now, autoStart: false });
  try {
    scene.setActive(true);
    now = 3000;
    scene.tick();
    const before = scene.getState();
    scene.setActive(false);
    now = 60000;
    scene.tick();
    assert.deepEqual(scene.getState(), before);
    scene.setActive(true);
    scene.tick();
    assert.deepEqual(scene.getState(), before);
    now += 1000;
    scene.tick();
    assert.equal(scene.getState().elapsed, before.elapsed + 1000);
  } finally {
    scene.destroy();
    dom.window.close();
  }
});

test("theme refreshes preserve animation and select the matching Mobi artwork", () => {
  const dom = new JSDOM('<div id="scene"></div>');
  let now = 2000;
  const scene = office.create({ container: dom.window.document.getElementById("scene"), now: () => now, autoStart: false });
  try {
    scene.setActive(true);
    now += 1200;
    scene.tick();
    const before = scene.getState();
    scene.setTheme({ themeId: "mobi-b", imageUrl: "file:///pet.svg" });
    scene.setTheme({ themeId: "mobi-b", imageUrl: "file:///pet.svg" });
    assert.deepEqual(scene.getState(), before);
    assert.match(dom.window.document.querySelector(".office-actor img").src, /actor-mobi-b/);
    scene.setTheme({ themeId: "custom", imageUrl: "file:///custom.svg" });
    assert.equal(dom.window.document.querySelector(".office-custom-pet").src, "file:///custom.svg");
  } finally {
    scene.destroy();
    dom.window.close();
  }
});

test("reduced motion uses a stable typing pose and static editor", () => {
  const dom = new JSDOM('<div id="scene"></div>');
  let now = 0;
  const scene = office.create({ container: dom.window.document.getElementById("scene"), now: () => now, autoStart: false, reducedMotion: true });
  try {
    scene.setActive(true);
    const before = scene.getState();
    now = 18000;
    scene.tick();
    assert.deepEqual(scene.getState(), before);
    assert.equal(dom.window.document.querySelector(".office-code").textContent, office.CODE);
  } finally {
    scene.destroy();
    dom.window.close();
  }
});

test("toggling reduced motion during a coffee sip preserves valid timeline frames", () => {
  const dom = new JSDOM('<div id="scene"></div>');
  let changed, now = 0;
  dom.window.matchMedia = () => ({ matches: false, addEventListener(_name, listener) { changed = listener; }, removeEventListener() {} });
  const scene = office.create({ container: dom.window.document.getElementById("scene"), now: () => now, autoStart: false });
  try {
    scene.setActive(true);
    scene.setSessions([{state: "working"}]);
    now = 30000; scene.tick();
    scene.setSessions([{state: "attention"}]);
    now = 32000; scene.tick();
    assert.equal(scene.getState().action, "coffee");
    changed({ matches: true });
    now = 33000; scene.tick();
    assert.doesNotThrow(() => changed({ matches: false }));
    assert.ok(scene.getState().frame >= 0 && scene.getState().frame < 4);
  } finally { scene.destroy(); dom.window.close(); }
});

test("an unavailable custom pet falls back to built-in art and recovers when its URL changes", () => {
  const dom = new JSDOM('<div id="scene"></div>');
  const scene = office.create({ container: dom.window.document.getElementById("scene"), autoStart: false });
  try {
    scene.setTheme({ themeId: "custom", imageUrl: "file:///missing.svg" });
    const custom = dom.window.document.querySelector(".office-custom-pet");
    custom.dispatchEvent(new dom.window.Event("error"));
    assert.equal(custom.hidden, true);
    assert.equal(dom.window.document.querySelector(".office-actor").hidden, false);
    scene.setTheme({ themeId: "custom", imageUrl: "file:///available.svg" });
    assert.equal(custom.src, "file:///available.svg");
    assert.equal(custom.hidden, false);
  } finally { scene.destroy(); dom.window.close(); }
});
