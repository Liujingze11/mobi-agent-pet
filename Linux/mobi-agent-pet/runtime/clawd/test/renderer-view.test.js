"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const RENDERER = path.join(__dirname, "..", "src", "renderer.js");
const ACCESSORY_LAYOUT = path.join(__dirname, "..", "src", "pet-accessory-layout.js");
const PRELOAD = path.join(__dirname, "..", "src", "preload.js");
const MAIN = path.join(__dirname, "..", "src", "main.js");

function readNormalized(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function matchSource(source, pattern, message) {
  const match = source.match(pattern);
  assert.ok(match, message || `missing pattern ${pattern}`);
  return match;
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.isConnected = false;
    this.className = "";
    this.id = "";
    this.data = "";
    this.src = "";
    this.contentDocument = null;
    this.contentWindow = {};
    this.listeners = new Map();
    this.offsetLeft = 0;
    this.offsetTop = 0;
    this.offsetWidth = 220;
    this._offsetHeight = 220;
    this.clientWidth = 220;
    this.clientHeight = 220;
    this.classList = {
      toggle: (name, force) => {
        const names = new Set(String(this.className).split(/\s+/).filter(Boolean));
        const enabled = force === undefined ? !names.has(name) : !!force;
        if (enabled) names.add(name);
        else names.delete(name);
        this.className = [...names].join(" ");
        return enabled;
      },
      contains: (name) => String(this.className).split(/\s+/).includes(name),
      add: (...namesToAdd) => {
        const names = new Set(String(this.className).split(/\s+/).filter(Boolean));
        namesToAdd.forEach((name) => names.add(name));
        this.className = [...names].join(" ");
      },
      remove: (...namesToRemove) => {
        const names = new Set(String(this.className).split(/\s+/).filter(Boolean));
        namesToRemove.forEach((name) => names.delete(name));
        this.className = [...names].join(" ");
      },
    };
  }

  get offsetHeight() {
    return this._offsetHeight;
  }

  set offsetHeight(value) {
    this._offsetHeight = value;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "data") this.data = String(value);
    if (name === "src") this.src = String(value);
  }

  getAttribute(name) {
    if (name === "data") return this.data || this.attributes.get(name) || "";
    if (name === "src") return this.src || this.attributes.get(name) || "";
    return this.attributes.get(name) || "";
  }

  appendChild(child) {
    child.parentNode = this;
    child.offsetParent = this;
    child.isConnected = true;
    this.children.push(child);
    return child;
  }

  remove() {
    this.isConnected = false;
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }
  }

  addEventListener(event, callback) {
    this.listeners.set(event, callback);
  }

  querySelectorAll(selector = "object, img.clawd-img") {
    const descendants = [];
    const visit = (node) => {
      for (const child of node.children) {
        descendants.push(child);
        visit(child);
      }
    };
    visit(this);
    return descendants.filter((child) => {
      if (selector.includes("object.clawd-object")
          && child.tagName === "OBJECT"
          && child.classList.contains("clawd-object")) return true;
      if (selector.includes("object") && !selector.includes("object.clawd-object")
          && child.tagName === "OBJECT") return true;
      if (selector.includes("img.clawd-img")
          && child.tagName === "IMG"
          && child.classList.contains("clawd-img")) return true;
      return false;
    });
  }
}

function createRendererHarness(options = {}) {
  const timers = [];
  const audioInstances = [];
  const electronCalls = [];
  const electronHandlers = {};
  const container = new FakeElement("div");
  container.id = "pet-container";
  container.isConnected = true;
  const facingStage = new FakeElement("div");
  facingStage.id = "pet-facing-stage";
  const motionStage = new FakeElement("div");
  motionStage.id = "pet-motion-stage";
  const assetDirectionStage = new FakeElement("div");
  assetDirectionStage.id = "pet-asset-direction-stage";
  const mediaLayer = new FakeElement("div");
  mediaLayer.id = "pet-media-layer";
  const accessoryLayer = new FakeElement("div");
  accessoryLayer.id = "pet-accessory-layer";
  const accessory = new FakeElement("img");
  accessory.id = "clawd-accessory";
  accessory.className = "clawd-accessory";
  const effectStage = new FakeElement("div");
  effectStage.id = "pet-effect-stage";
  const particleLayer = new FakeElement("div");
  particleLayer.id = "pet-particle-layer";
  const clawd = new FakeElement("object");
  clawd.id = "clawd";
  clawd.className = "clawd-object";
  clawd.offsetLeft = -99;
  clawd.offsetTop = -55;
  clawd.clientWidth = 418;
  clawd.clientHeight = 286;
  clawd.offsetWidth = 418;
  clawd.offsetHeight = 286;
  // index.html ships the object tag without data; tests that don't care get a
  // pre-displayed file so the initial-frame swap stays out of their way.
  clawd.data = Object.prototype.hasOwnProperty.call(options, "initialObjectData")
    ? options.initialObjectData
    : "../assets/svg/current.svg";
  clawd.style.opacity = "0";
  container.appendChild(facingStage);
  facingStage.appendChild(motionStage);
  motionStage.appendChild(assetDirectionStage);
  assetDirectionStage.appendChild(mediaLayer);
  assetDirectionStage.appendChild(accessoryLayer);
  mediaLayer.appendChild(clawd);
  accessoryLayer.appendChild(accessory);
  container.appendChild(effectStage);
  effectStage.appendChild(particleLayer);

  const elementsById = new Map([
    ["pet-container", container],
    ["pet-facing-stage", facingStage],
    ["pet-motion-stage", motionStage],
    ["pet-asset-direction-stage", assetDirectionStage],
    ["pet-media-layer", mediaLayer],
    ["pet-accessory-layer", accessoryLayer],
    ["pet-effect-stage", effectStage],
    ["pet-particle-layer", particleLayer],
    ["clawd", clawd],
    ["clawd-accessory", accessory],
  ]);
  const documentListeners = new Map();

  const document = {
    hidden: false,
    getElementById(id) {
      return elementsById.get(id) || null;
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    addEventListener(event, callback) {
      documentListeners.set(event, callback);
    },
  };
  const electronAPI = new Proxy({}, {
    get(_target, prop) {
      const name = String(prop);
      if (name.startsWith("on")) {
        return (callback) => { electronHandlers[name] = callback; };
      }
      return (...args) => { electronCalls.push({ name, args }); };
    },
  });
  const windowListeners = new Map();
  const context = {
    document,
    window: {
      themeConfig: {
        assetsPath: "../assets/svg",
        eyeTracking: { states: ["idle"] },
        petTintSupported: true,
        // Matches the pre-displayed file above, so tests that don't care about
        // the #509 idle choice keep resting on the "follow" sprite.
        idleFollowSvg: "current.svg",
        ...(options.themeConfig || {}),
      },
      electronAPI,
      getComputedStyle: (el) => ({ opacity: el.style.opacity || "1" }),
      addEventListener(event, callback) {
        windowListeners.set(event, callback);
      },
    },
    console: { warn() {} },
    setTimeout(callback, ms) {
      const timer = { callback, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
    requestAnimationFrame(callback) {
      return context.setTimeout(callback, 16);
    },
    cancelAnimationFrame(timer) {
      context.clearTimeout(timer);
    },
    Audio: function FakeAudio(url) {
      this.url = url;
      this.volume = 1;
      this.currentTime = 0;
      this.loadCalls = 0;
      this.playCalls = 0;
      this.pauseCalls = 0;
      this.load = () => { this.loadCalls++; };
      this.play = () => { this.playCalls++; return Promise.resolve(); };
      this.pause = () => { this.pauseCalls++; };
      audioInstances.push(this);
    },
  };
  context.globalThis = context;

  const source = `${readNormalized(path.join(__dirname, "../src/pet-states.js"))}
${readNormalized(path.join(__dirname, "../src/pet-action-plan.js"))}
${readNormalized(ACCESSORY_LAYOUT)}
${readNormalized(RENDERER)}
globalThis.__rendererTest = {
  swapToFile,
  displayStateFile,
  recoverFromSystemWake,
  attachEyeTracking,
  isEyeTrackingReady,
  setCurrentState(value) { currentState = value; },
  setLayeredTrackingForTest(document) {
    _trackingLayers = { test: { wrappers: [], maxOffset: 1, ease: 1, x: 0, y: 0 } };
    _layeredTrackingObj = clawdEl;
    _layeredTrackingDocument = document;
  },
  getPetMediaElements,
  normalizePetTintPayload,
  applyPetTintToAllMedia,
  normalizeAccessoryPayload,
  refreshAccessoryLayout,
  get pendingNext() { return pendingNext; },
  get pendingSvgFile() { return pendingSvgFile; },
  get activeSwapToken() { return activeSwapToken; },
  get clawdEl() { return clawdEl; },
  get currentDisplayedState() { return currentDisplayedState; },
  get accessoryAssetLoadTimer() { return _accessoryAssetLoadTimer; },
  get accessoryAssetSettled() { return _accessoryAssetSettled; },
  get eyeTarget() { return eyeTarget; },
};`;
  vm.runInNewContext(source, context);

  return {
    context,
    container,
    mediaLayer,
    accessoryLayer,
    assetDirectionStage,
    accessory,
    clawd,
    timers,
    audioInstances,
    electronCalls,
    electronHandlers,
    api: context.__rendererTest,
    activeTimers: () => timers.filter((timer) => !timer.cleared),
    documentListeners,
    windowListeners,
  };
}

function drainActiveTimers(harness, predicate, limit = 100) {
  let count = 0;
  while (count < limit) {
    const timer = harness.activeTimers().find(predicate);
    if (!timer) return count;
    timer.cleared = true;
    timer.callback();
    count++;
  }
  return count;
}

function attachFakeSvgDocument(objectEl, { withEyes = false } = {}) {
  const root = new FakeElement("svg");
  const elements = new Map();
  const svgDoc = {
    defaultView: {},
    documentElement: root,
    createElementNS(_namespace, tagName) {
      const element = new FakeElement(tagName);
      element.ownerDocument = svgDoc;
      return element;
    },
    getElementById(id) {
      if (elements.has(id)) return elements.get(id);
      return root.children.find((child) => child.id === id) || null;
    },
  };
  root.ownerDocument = svgDoc;
  root.pauseCalls = 0;
  root.unpauseCalls = 0;
  root.pauseAnimations = () => { root.pauseCalls++; };
  root.unpauseAnimations = () => { root.unpauseCalls++; };
  if (withEyes) {
    const eyes = new FakeElement("g");
    eyes.id = "eyes-js";
    eyes.ownerDocument = svgDoc;
    elements.set("eyes-js", eyes);
  }
  objectEl.contentDocument = svgDoc;
  return { root, svgDoc, elements };
}

describe("renderer system wake recovery", () => {







  it("unpauses the current SVG and reattaches eye tracking after system wake", () => {
    const harness = createRendererHarness();
    const svg = attachFakeSvgDocument(harness.clawd, { withEyes: true });
    harness.api.setCurrentState("idle");


    harness.electronHandlers.onSystemWake({ id: "wake-test-1", trigger: "resume", attempt: 0 });
    const replacementObject = harness.api.pendingNext;
    assert.ok(replacementObject);
    attachFakeSvgDocument(replacementObject, { withEyes: true });
    replacementObject.listeners.get("load")();

    assert.equal(svg.root.unpauseCalls, 1);
    assert.ok(harness.api.eyeTarget);
    const report = harness.electronCalls.find((call) => call.name === "reportSystemWakeStatus");
    assert.deepEqual(report.args[0], {
      id: "wake-test-1",
      result: "resumed",
      eyeTrackingReady: true,
      eyeTargetWasCurrentDocument: false,
      objectReloaded: true,
      eyeTargetRebound: true,
    });
  });

  it("waits for async eye attach before reporting wake recovery", () => {
    const harness = createRendererHarness();
    attachFakeSvgDocument(harness.clawd, { withEyes: true });
    harness.api.setCurrentState("idle");

    harness.electronHandlers.onSystemWake({ id: "wake-async-1", trigger: "resume", attempt: 0 });
    const replacementObject = harness.api.pendingNext;
    assert.ok(replacementObject);

    replacementObject.listeners.get("load")();
    assert.equal(
      harness.electronCalls.filter((call) => call.name === "reportSystemWakeStatus").length,
      0
    );

    const freshSvg = attachFakeSvgDocument(replacementObject, { withEyes: true });
    drainActiveTimers(harness, (timer) => timer.ms === 16 && !timer.cleared);

    assert.strictEqual(harness.api.eyeTarget.ownerDocument, freshSvg.svgDoc);
    const report = harness.electronCalls.find((call) => call.name === "reportSystemWakeStatus");
    assert.deepEqual(report.args[0], {
      id: "wake-async-1",
      result: "resumed",
      eyeTrackingReady: true,
      eyeTargetWasCurrentDocument: false,
      objectReloaded: true,
      eyeTargetRebound: true,
    });
  });


  it("replies to duplicate wake ids without running recovery twice", () => {
    const harness = createRendererHarness();
    const svg = attachFakeSvgDocument(harness.clawd, { withEyes: true });
    const payload = { id: "wake-test-3", trigger: "resume", attempt: 0 };
    harness.api.setCurrentState("idle");

    harness.electronHandlers.onSystemWake(payload);
    const replacementObject = harness.api.pendingNext;
    const swapToken = harness.api.activeSwapToken;
    harness.electronHandlers.onSystemWake({ ...payload, attempt: 1 });

    assert.equal(svg.root.unpauseCalls, 1);
    assert.strictEqual(harness.api.pendingNext, replacementObject);
    assert.equal(harness.api.activeSwapToken, swapToken);
    assert.equal(
      harness.electronCalls.filter((call) => call.name === "reportSystemWakeStatus").length,
      0
    );

    attachFakeSvgDocument(replacementObject, { withEyes: true });
    replacementObject.listeners.get("load")();
    harness.electronHandlers.onSystemWake({ ...payload, attempt: 2 });
    assert.equal(
      harness.electronCalls.filter((call) => call.name === "reportSystemWakeStatus").length,
      2
    );
  });

  it("replays only the latest wake id after an object reload finishes", () => {
    const harness = createRendererHarness();
    attachFakeSvgDocument(harness.clawd, { withEyes: true });
    harness.api.setCurrentState("idle");

    harness.electronHandlers.onSystemWake({ id: "wake-first", trigger: "resume", attempt: 0 });
    const firstObject = harness.api.pendingNext;
    const firstSwapToken = harness.api.activeSwapToken;

    harness.electronHandlers.onSystemWake({ id: "wake-second", trigger: "unlock-screen", attempt: 0 });
    harness.electronHandlers.onSystemWake({ id: "wake-third", trigger: "resume", attempt: 0 });
    assert.strictEqual(harness.api.pendingNext, firstObject);
    assert.equal(harness.api.activeSwapToken, firstSwapToken);

    attachFakeSvgDocument(firstObject, { withEyes: true });
    firstObject.listeners.get("load")();
    const replayTimer = harness.activeTimers().find((timer) => timer.ms === 0);
    assert.ok(replayTimer, "latest queued wake should be replayed after cleanup");
    replayTimer.callback();

    assert.notStrictEqual(harness.api.pendingNext, firstObject);
    assert.equal(harness.api.activeSwapToken, firstSwapToken + 1);
    const replayObject = harness.api.pendingNext;
    attachFakeSvgDocument(replayObject, { withEyes: true });
    replayObject.listeners.get("load")();

    const reportedIds = harness.electronCalls
      .filter((call) => call.name === "reportSystemWakeStatus")
      .map((call) => call.args[0].id);
    assert.deepEqual(reportedIds, ["wake-first", "wake-third"]);
  });

  it("settles an in-flight wake when a state change supersedes its object reload", () => {
    const harness = createRendererHarness();
    attachFakeSvgDocument(harness.clawd, { withEyes: true });
    harness.api.setCurrentState("idle");

    harness.electronHandlers.onSystemWake({ id: "wake-state-1", trigger: "resume", attempt: 0 });
    const wakeObject = harness.api.pendingNext;
    harness.api.displayStateFile("working", "working.svg");

    assert.equal(wakeObject.isConnected, false);
    const firstReport = harness.electronCalls.find((call) => (
      call.name === "reportSystemWakeStatus" && call.args[0].id === "wake-state-1"
    ));
    assert.ok(firstReport, "superseded wake must report instead of timing out");

    harness.electronHandlers.onSystemWake({ id: "wake-state-2", trigger: "resume", attempt: 0 });
    const secondReport = harness.electronCalls.find((call) => (
      call.name === "reportSystemWakeStatus" && call.args[0].id === "wake-state-2"
    ));
    assert.ok(secondReport, "a superseded wake must not block later wake ids");
  });

  it("rebuilds a stale eye-tracking object whose old document still looks alive", () => {
    const harness = createRendererHarness();
    const originalSvg = attachFakeSvgDocument(harness.clawd, { withEyes: true });
    harness.api.setCurrentState("idle");
    harness.api.attachEyeTracking(harness.clawd);
    assert.strictEqual(harness.api.eyeTarget.ownerDocument, originalSvg.svgDoc);

    const replacementDocument = attachFakeSvgDocument(harness.clawd, { withEyes: true });
    assert.notStrictEqual(harness.api.eyeTarget.ownerDocument, replacementDocument.svgDoc);
    assert.ok(harness.api.eyeTarget.ownerDocument.defaultView, "old document still passes the legacy ready check");

    harness.electronHandlers.onSystemWake({ id: "wake-stale-2", trigger: "resume", attempt: 0 });
    const replacementObject = harness.api.pendingNext;
    assert.ok(replacementObject, "wake should start a fresh object-channel swap");
    assert.equal(replacementObject.tagName, "OBJECT");
    assert.match(replacementObject.data, /[?&]_t=\d+-\d+$/);

    const freshSvg = attachFakeSvgDocument(replacementObject, { withEyes: true });
    replacementObject.listeners.get("load")();

    assert.strictEqual(harness.api.clawdEl, replacementObject);
    assert.strictEqual(harness.api.eyeTarget.ownerDocument, freshSvg.svgDoc);
    const report = harness.electronCalls.find((call) => call.name === "reportSystemWakeStatus");
    assert.equal(report.args[0].eyeTargetWasCurrentDocument, false);
    assert.equal(report.args[0].objectReloaded, true);
    assert.equal(report.args[0].eyeTargetRebound, true);
  });

  it("retries a wake object reload once before reporting success", () => {
    const harness = createRendererHarness();
    attachFakeSvgDocument(harness.clawd, { withEyes: true });
    harness.api.setCurrentState("idle");

    harness.electronHandlers.onSystemWake({ id: "wake-retry-1", trigger: "resume", attempt: 0 });
    const firstObject = harness.api.pendingNext;
    const firstSwapToken = harness.api.activeSwapToken;
    drainActiveTimers(harness, (timer) => timer.ms === 3000 && !timer.cleared, 1);

    assert.equal(firstObject.isConnected, false);
    assert.equal(
      harness.electronCalls.filter((call) => call.name === "reportSystemWakeStatus").length,
      0
    );
    const retryObject = harness.api.pendingNext;
    assert.ok(retryObject);
    assert.notStrictEqual(retryObject, firstObject);
    assert.equal(harness.api.activeSwapToken, firstSwapToken + 1);
    assert.equal(harness.mediaLayer.children.some((element) => element.tagName === "IMG"), false);

    attachFakeSvgDocument(retryObject, { withEyes: true });
    retryObject.listeners.get("load")();

    const report = harness.electronCalls.find((call) => call.name === "reportSystemWakeStatus");
    assert.equal(report.args[0].result, "resumed");
    assert.equal(report.args[0].objectReloaded, true);
    assert.equal(report.args[0].eyeTrackingReady, true);
  });

  it("keeps the old object and reports an error after the wake reload retry cannot load", () => {
    const harness = createRendererHarness();
    attachFakeSvgDocument(harness.clawd, { withEyes: true });
    harness.api.setCurrentState("idle");

    harness.electronHandlers.onSystemWake({ id: "wake-fail-1", trigger: "resume", attempt: 0 });
    const failedObject = harness.api.pendingNext;
    drainActiveTimers(harness, (timer) => timer.ms === 3000 && !timer.cleared, 1);
    const retryObject = harness.api.pendingNext;
    assert.ok(retryObject);
    assert.notStrictEqual(retryObject, failedObject);
    drainActiveTimers(harness, (timer) => timer.ms === 3000 && !timer.cleared, 1);

    assert.strictEqual(harness.api.clawdEl, harness.clawd);
    assert.equal(harness.api.pendingNext, null);
    assert.equal(harness.mediaLayer.children.some((element) => element.tagName === "IMG"), false);
    const report = harness.electronCalls.find((call) => call.name === "reportSystemWakeStatus");
    assert.equal(report.args[0].result, "error");
    assert.equal(report.args[0].objectReloaded, false);
    assert.equal(report.args[0].eyeTrackingReady, true);
    assert.strictEqual(harness.api.eyeTarget.ownerDocument, harness.clawd.contentDocument);
    assert.equal(failedObject.isConnected, false);
    assert.equal(retryObject.isConnected, false);
  });

  it("rebuilds a tracked eye object after system wake without an idle power setting", () => {
    const harness = createRendererHarness();
    attachFakeSvgDocument(harness.clawd, { withEyes: true });
    harness.api.setCurrentState("idle");
    harness.api.attachEyeTracking(harness.clawd);

    harness.electronHandlers.onSystemWake({ id: "wake-disabled-1", trigger: "resume", attempt: 0 });
    const replacement=harness.api.pendingNext;assert.ok(replacement);
    attachFakeSvgDocument(replacement,{withEyes:true});replacement.listeners.get("load")();
    assert.equal(harness.api.pendingNext, null);
    const report = harness.electronCalls.find((call) => call.name === "reportSystemWakeStatus");
    assert.equal(report.args[0].objectReloaded, true);
    assert.equal(report.args[0].eyeTrackingReady, true);
  });

  it("does not rebuild the object for a non-eye state", () => {
    const harness = createRendererHarness();
    attachFakeSvgDocument(harness.clawd);
    harness.api.setCurrentState("sleeping");

    harness.electronHandlers.onSystemWake({ id: "wake-sleeping-1", trigger: "resume", attempt: 0 });

    assert.equal(harness.api.pendingNext, null);
    const report = harness.electronCalls.find((call) => call.name === "reportSystemWakeStatus");
    assert.equal(report.args[0].objectReloaded, false);
    assert.equal(report.args[0].eyeTrackingReady, true);
  });

  it("invalidates layered tracking when the object document changes", () => {
    const harness = createRendererHarness();
    const originalSvg = attachFakeSvgDocument(harness.clawd);
    harness.api.setLayeredTrackingForTest(originalSvg.svgDoc);
    assert.equal(harness.api.isEyeTrackingReady(), true);

    attachFakeSvgDocument(harness.clawd);

    assert.equal(harness.api.isEyeTrackingReady(), false);
  });

  it("reattaches a stale single eye target before applying the next eye move", () => {
    const harness = createRendererHarness();
    attachFakeSvgDocument(harness.clawd, { withEyes: true });
    harness.api.setCurrentState("idle");
    harness.api.attachEyeTracking(harness.clawd);
    const replacementSvg = attachFakeSvgDocument(harness.clawd, { withEyes: true });

    harness.electronHandlers.onEyeMove(2, -1);

    assert.strictEqual(harness.api.eyeTarget.ownerDocument, replacementSvg.svgDoc);
    assert.equal(harness.api.eyeTarget.getAttribute("transform"), "translate(2, -1)");
  });

  it("exposes the bounded wake IPC bridge through preload", () => {
    const preload = readNormalized(PRELOAD);
    assert.ok(preload.includes('onSystemWake: (cb) => ipcRenderer.on("system-wake"'));
    assert.ok(preload.includes('reportSystemWakeStatus: (payload) => ipcRenderer.send("system-wake-status", payload)'));
  });
});

describe("renderer object-channel selection", () => {
  it("allows built-in trusted scripted SVG files to use <object>", () => {
    const source = readNormalized(RENDERER);

    assert.ok(source.includes("_trustedScriptedSvgFiles = new Set"));
    assert.ok(source.includes("_forceSvgObjectChannel"));
    assert.ok(source.includes("|| _trustedScriptedSvgFiles.has(file)"));
    assert.ok(source.includes("|| needsAccessoryFollow;"));
  });



  it("gates idle eye-tracking attachment on the follow-idle file", () => {
    const source = readNormalized(RENDERER);

    assert.ok(source.includes("function needsEyeTracking(state)"));
    assert.ok(source.includes("function tracksEyesForFile(state, file)"));
    assert.match(
      source,
      /if \(commitState && tracksEyesForFile\(commitState, file\)\) {\r?\n\s+attachEyeTracking\(next\);/
    );
  });

  it("legacy reaction handlers cannot select arbitrary files", () => {
    const h = createRendererHarness();
    h.api.displayStateFile("idle", "rest.svg");
    const before=h.api.pendingSvgFile;
    h.electronHandlers.onPlayClickReaction("unassigned.svg",5000);
    h.electronHandlers.onStartDragReaction("left");
    assert.strictEqual(h.api.pendingSvgFile,before);
  });

  it("uses a monotonic cache-bust counter for remaining img-channel SVG swaps", () => {
    const source = readNormalized(RENDERER);

    assert.ok(source.includes("let _imgCacheBustSeq = 0;"));
    assert.ok(source.includes("++_imgCacheBustSeq"));
    assert.ok(source.includes("const cacheBust = `${Date.now()}-${++_imgCacheBustSeq}`;"));
    assert.ok(!source.includes("_t=${Date.now()}"));
  });

  it("deduplicates displayed files by resolved asset URL, not filename alone", () => {
    const source = readNormalized(RENDERER);

    assert.ok(source.includes("let currentDisplayedAssetUrl = null;"));
    assert.ok(source.includes("let pendingAssetUrl = null;"));
    assert.ok(source.includes("const desiredAssetUrl = getAssetUrl(effectiveSvg);"));
    assert.ok(source.includes("currentDisplayedAssetUrl === desiredAssetUrl"));
    assert.ok(source.includes("pendingAssetUrl === desiredAssetUrl"));
  });

  it("rescues an invisible object-channel pending swap by reloading through the img channel", () => {
    const harness = createRendererHarness();

    harness.api.swapToFile("next.svg", "idle", true);
    const rescue = harness.activeTimers().find((timer) => timer.ms === 3750);
    rescue.callback();

    assert.strictEqual(harness.api.pendingNext.tagName, "IMG");
    assert.strictEqual(harness.api.pendingSvgFile, "next.svg");
    assert.strictEqual(
      harness.container.querySelectorAll().some((el) => el.tagName === "OBJECT" && el !== harness.clawd),
      false
    );
  });

  it("ignores stale rescue timers after a newer swap starts", () => {
    const harness = createRendererHarness();

    harness.api.swapToFile("old.svg", "idle", true);
    const staleRescue = harness.activeTimers().find((timer) => timer.ms === 3750);
    harness.api.swapToFile("new.svg", "idle", true);
    staleRescue.callback();

    assert.strictEqual(harness.api.pendingNext.tagName, "OBJECT");
    assert.strictEqual(harness.api.pendingSvgFile, "new.svg");
  });

  it("does not rescue over an already visible pet element", () => {
    const harness = createRendererHarness();
    harness.clawd.style.opacity = "1";

    harness.api.swapToFile("next.svg", "idle", true);
    const rescue = harness.activeTimers().find((timer) => timer.ms === 3750);
    rescue.callback();

    assert.strictEqual(harness.api.pendingNext.tagName, "OBJECT");
    assert.strictEqual(harness.api.pendingSvgFile, "next.svg");
  });

  it("notifies main once the first pet visual is actually swapped into view", () => {
    const harness = createRendererHarness();

    harness.api.swapToFile("first.svg", "idle", false);
    harness.api.pendingNext.listeners.get("load")();
    harness.api.swapToFile("second.svg", "working", false);
    harness.api.pendingNext.listeners.get("load")();

    assert.deepStrictEqual(
      harness.electronCalls.filter((call) => call.name === "notifyPetVisualReady"),
      [{ name: "notifyPetVisualReady", args: [] }]
    );
  });
});

describe("renderer pet tint", () => {
  it("applies the stamped tint before the pre-IPC initial media load", () => {
    const filter = "sepia(0.8) saturate(2.2) hue-rotate(-18deg) brightness(1.05)";
    const harness = createRendererHarness({
      initialObjectData: "",
      themeConfig: {
        idleFollowSvg: "first.svg",
        petTintPayload: { id: "gold", filter },
      },
    });

    assert.ok(harness.api.pendingNext, "the initial idle visual should be loading");
    assert.strictEqual(harness.api.pendingNext.style.filter, filter);
  });

  it("applies the selected filter to current, pending, and fading media elements", () => {
    const harness = createRendererHarness({
      themeConfig: {
        transitions: {
          "current.svg": { out: 500 },
        },
      },
    });
    const setTint = harness.electronHandlers.onPetTintChange;
    const gold = {
      id: "gold",
      filter: "sepia(0.8) saturate(2.2) hue-rotate(-18deg) brightness(1.05)",
    };

    assert.strictEqual(typeof setTint, "function");
    setTint(gold);
    assert.strictEqual(harness.clawd.style.filter, gold.filter);

    harness.api.swapToFile("next.png", "working", false);
    const pending = harness.api.pendingNext;
    assert.strictEqual(pending.tagName, "IMG");
    assert.strictEqual(pending.style.filter, gold.filter);

    pending.listeners.get("load")();
    assert.strictEqual(harness.api.clawdEl, pending);
    assert.strictEqual(harness.clawd.isConnected, true, "old media should still be fading");

    const mono = { id: "mono", filter: "grayscale(1) brightness(1.05)" };
    setTint(mono);
    const filters = [...harness.api.getPetMediaElements()].map((element) => element.style.filter);
    assert.deepStrictEqual(filters, [mono.filter, mono.filter]);
  });

  it("clears invalid or custom CSS payloads instead of applying them", () => {
    const harness = createRendererHarness();
    const setTint = harness.electronHandlers.onPetTintChange;

    setTint({ id: "mono", filter: "grayscale(1) brightness(1.05)" });
    assert.strictEqual(harness.clawd.style.filter, "grayscale(1) brightness(1.05)");
    setTint({ id: "none", filter: "" });
    assert.strictEqual(harness.clawd.style.filter, "");

    setTint({ id: "custom", filter: "url(file:///secret)" });
    assert.strictEqual(harness.clawd.style.filter, "");

    setTint({ id: "none", filter: "grayscale(1)" });
    assert.strictEqual(harness.clawd.style.filter, "");

    setTint("grayscale(1)");
    assert.strictEqual(harness.clawd.style.filter, "");
  });

  it("keeps tint through same-file dedup and theme config reload", () => {
    const harness = createRendererHarness();
    const filter = "hue-rotate(265deg) saturate(1.6) contrast(1.05)";
    harness.electronHandlers.onPetTintChange({ id: "vaporwave", filter });

    harness.api.swapToFile("rest.svg", "working", false);
    harness.api.pendingNext.listeners.get("load")();
    const displayed = harness.api.clawdEl;
    assert.strictEqual(displayed.style.filter, filter);

    harness.api.displayStateFile("working", "rest.svg");
    assert.strictEqual(harness.api.pendingNext, null);
    assert.strictEqual(harness.api.clawdEl, displayed);
    assert.strictEqual(displayed.style.filter, filter);

    harness.electronHandlers.onThemeConfig({
      assetsPath: "../themes/other",
      eyeTracking: { states: [] },
      idleFollowSvg: "idle.svg",
      petTintSupported: true,
    });
    assert.strictEqual(harness.api.clawdEl, displayed);
    assert.strictEqual(displayed.style.filter, filter);
  });

  it("clears a persisted tint when the active theme opts out and restores it when support returns", () => {
    const harness = createRendererHarness();
    const filter = "hue-rotate(265deg) saturate(1.6) contrast(1.05)";
    harness.electronHandlers.onPetTintChange({ id: "vaporwave", filter });
    assert.strictEqual(harness.clawd.style.filter, filter);

    harness.electronHandlers.onThemeConfig({
      assetsPath: "../themes/calico",
      eyeTracking: { states: [] },
      idleFollowSvg: "idle.png",
      petTintSupported: false,
    });
    assert.strictEqual(harness.clawd.style.filter, "");

    harness.electronHandlers.onThemeConfig({
      assetsPath: "../themes/clawd",
      eyeTracking: { states: ["idle"] },
      idleFollowSvg: "idle.svg",
      petTintSupported: true,
    });
    assert.strictEqual(harness.clawd.style.filter, filter);
  });

  it("wires an initial resolved payload and a narrow preload event channel", () => {
    const source = readNormalized(RENDERER);
    const preload = readNormalized(PRELOAD);
    const main = readNormalized(MAIN);

    assert.ok(source.includes('let _petTintPayload = { id: "none", filter: "" };'));
    assert.ok(source.includes("applyPetTintToElement(next);"));
    assert.ok(source.includes("for (const element of getPetMediaElements()) applyPetTintToElement(element);"));
    assert.ok(preload.includes(
      'onPetTintChange: (cb) => ipcRenderer.on("pet-tint-change", (_, payload) => cb(payload))'
    ));
    assert.ok(main.includes(
      "const tintId = getPetTintIdForTheme(petTint, activeTheme && activeTheme._id);"
    ));
  });
});

describe("renderer pet accessory wardrobe", () => {
  function accessoryConfig(overrides = {}) {
    return {
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      eyeTracking: { states: [] },
      idleFollowSvg: "first.svg",
      accessorySupported: true,
      accessoryPayload: {
        id: "cowboy-hat",
        assetFile: "cowboy-hat.svg",
        aspect: 16 / 7,
        widthScale: 1,
        offsetY: 0,
      },
      accessoryAttachments: {
        default: {
          staticFrame: { cx: 50, baseY: 40, width: 20 },
        },
        files: {},
      },
      ...overrides,
    };
  }

  it("primes the fixed catalog asset before the initial pet swap and reveals it after load", () => {
    const filter = "grayscale(1) brightness(1.05)";
    const harness = createRendererHarness({
      initialObjectData: "",
      themeConfig: accessoryConfig({
        petTintSupported: true,
        petTintPayload: { id: "mono", filter },
      }),
    });

    assert.strictEqual(harness.accessory.src, "../assets/accessories/cowboy-hat.svg");
    assert.ok(harness.api.pendingNext, "initial media should be loading");
    assert.strictEqual(harness.api.pendingNext.style.filter, filter);

    harness.api.pendingNext.listeners.get("load")();
    assert.ok(harness.api.pendingNext, "pet commit should wait for the selected accessory asset");
    assert.strictEqual(harness.accessory.style.display, "none");
    harness.accessory.onload();

    assert.strictEqual(harness.api.pendingNext, null);
    assert.strictEqual(harness.accessory.style.display, "block");
    assert.strictEqual(harness.accessory.style.filter, "none");
    assert.match(harness.accessory.style.transform, /^matrix\(/);
  });

  it("keeps the old anchor through a pending swap, hides declared sleep files, and restores reactions", () => {
    const harness = createRendererHarness({
      initialObjectData: "",
      themeConfig: accessoryConfig({
        accessoryAttachments: {
          default: {
            staticFrame: { cx: 50, baseY: 40, width: 20 },
          },
          files: {
            "sleep.svg": { visibility: "hidden" },
          },
        },
      }),
    });
    harness.api.pendingNext.listeners.get("load")();
    harness.accessory.onload();
    const originalTransform = harness.accessory.style.transform;

    harness.api.swapToFile("sleep.svg", "sleeping", false);
    assert.strictEqual(harness.accessory.style.display, "block");
    assert.strictEqual(harness.accessory.style.transform, originalTransform);
    harness.api.pendingNext.listeners.get("load")();
    assert.strictEqual(harness.accessory.style.display, "none");

    harness.api.swapToFile("reaction.svg", null, false);
    harness.api.pendingNext.listeners.get("load")();
    assert.strictEqual(harness.accessory.style.display, "block");
  });

  it("follows an exact object target CTM and cancels that RAF on the next media commit", () => {
    const harness = createRendererHarness({
      themeConfig: accessoryConfig({
        accessoryAttachments: {
          default: {
            staticFrame: { cx: 50, baseY: 40, width: 20 },
          },
          files: {
            "dynamic.svg": {
              staticFrame: { cx: 50, baseY: 40, width: 20 },
              followTarget: {
                id: "body-js",
                frame: { cx: 8, baseY: 6, width: 4 },
              },
            },
          },
        },
      }),
    });
    harness.accessory.onload();

    let matrix = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 12 };
    harness.api.swapToFile("dynamic.svg", "working", true);
    const dynamicObject = harness.api.pendingNext;
    dynamicObject.contentDocument = {
      getElementById(id) {
        return id === "body-js" ? { getCTM: () => matrix } : null;
      },
    };
    dynamicObject.listeners.get("load")();
    const firstTransform = harness.accessory.style.transform;
    const followTimer = harness.activeTimers().find((timer) => timer.ms === 16);
    assert.ok(followTimer, "dynamic target should own one RAF");

    matrix = { ...matrix, e: 14 };
    followTimer.callback();
    assert.notStrictEqual(harness.accessory.style.transform, firstTransform);

    const nextFollowTimer = harness.activeTimers().find((timer) => timer.ms === 16 && timer !== followTimer);
    harness.api.swapToFile("static.svg", "working", false);
    harness.api.pendingNext.listeners.get("load")();
    assert.strictEqual(nextFollowTimer.cleared, true);
  });

  it("switches to the object channel only while a selected accessory needs to follow the body", () => {
    const harness = createRendererHarness({
      initialObjectData: "",
      themeConfig: accessoryConfig({
        eyeTrackingStates: [],
        accessoryPayload: {
          id: "none",
          assetFile: null,
          aspect: 1,
          widthScale: 1,
          offsetY: 0,
        },
        accessoryAttachments: {
          default: {
            staticFrame: { cx: 50, baseY: 40, width: 20 },
          },
          files: {
            "first.svg": {
              staticFrame: { cx: 50, baseY: 40, width: 20 },
              followTarget: {
                id: "accessory-anchor",
                frame: { cx: 8, baseY: 6, width: 4 },
              },
            },
          },
        },
      }),
    });

    const initialImage = harness.api.pendingNext;
    assert.strictEqual(initialImage.tagName, "IMG");
    initialImage.listeners.get("load")();
    assert.strictEqual(harness.api.clawdEl.tagName, "IMG");

    harness.electronHandlers.onPetAccessoryChange({
      id: "cowboy-hat",
      assetFile: "cowboy-hat.svg",
      aspect: 16 / 7,
      widthScale: 1,
      offsetY: 0,
    });

    const followingObject = harness.api.pendingNext;
    assert.strictEqual(followingObject.tagName, "OBJECT");
    followingObject.contentDocument = {
      getElementById(id) {
        return id === "accessory-anchor"
          ? {
              getCTM() {
                return { a: 2, b: 0, c: 0, d: 2, e: 10, f: 12 };
              },
            }
          : null;
      },
    };
    followingObject.listeners.get("load")();
    assert.strictEqual(harness.api.pendingNext, followingObject);
    harness.accessory.onload();

    assert.strictEqual(harness.api.pendingNext, null);
    assert.strictEqual(harness.api.clawdEl.tagName, "OBJECT");
    assert.strictEqual(harness.accessory.style.display, "block");

    harness.electronHandlers.onPetAccessoryChange({
      id: "none",
      assetFile: null,
      aspect: 1,
      widthScale: 1,
      offsetY: 0,
    });

    const restoredImage = harness.api.pendingNext;
    assert.strictEqual(restoredImage.tagName, "IMG");
    restoredImage.listeners.get("load")();
    assert.strictEqual(harness.api.clawdEl.tagName, "IMG");
    assert.strictEqual(harness.accessory.style.display, "none");
  });

  it("keeps the latest state swap pending when an accessory payload is rebroadcast", () => {
    const attachment = {
      staticFrame: { cx: 50, baseY: 40, width: 20 },
      followTarget: {
        id: "accessory-anchor",
        frame: { cx: 8, baseY: 6, width: 4 },
      },
    };
    const harness = createRendererHarness({
      initialObjectData: "",
      themeConfig: accessoryConfig({
        eyeTrackingStates: [],
        accessoryPayload: {
          id: "none",
          assetFile: null,
          aspect: 1,
          widthScale: 1,
          offsetY: 0,
        },
        accessoryAttachments: {
          default: {
            staticFrame: { cx: 50, baseY: 40, width: 20 },
          },
          files: {
            "first.svg": attachment,
            "working.svg": attachment,
          },
        },
      }),
    });

    harness.api.pendingNext.listeners.get("load")();
    assert.strictEqual(harness.api.clawdEl.tagName, "IMG");

    const payload = {
      id: "cowboy-hat",
      assetFile: "cowboy-hat.svg",
      aspect: 16 / 7,
      widthScale: 1,
      offsetY: 0,
    };
    harness.electronHandlers.onPetAccessoryChange(payload);
    harness.api.displayStateFile("working", "working.svg");

    const workingObject = harness.api.pendingNext;
    assert.strictEqual(workingObject.tagName, "OBJECT");
    assert.strictEqual(harness.api.pendingSvgFile, "working.svg");

    harness.electronHandlers.onPetAccessoryChange(payload);

    assert.strictEqual(
      harness.api.pendingNext,
      workingObject,
      "a repeated payload must not replace the latest state with the displayed file"
    );
    assert.strictEqual(harness.api.pendingSvgFile, "working.svg");
  });

  it("keeps a newly selected asset alive when an old load waiter re-enters cleanup", () => {
    const harness = createRendererHarness({
      initialObjectData: "",
      themeConfig: accessoryConfig(),
    });
    const pendingPet = harness.api.pendingNext;
    pendingPet.listeners.get("load")();
    assert.ok(harness.api.pendingNext, "the initial pet swap should wait for accessory A");

    harness.electronHandlers.onPetAccessoryChange({
      id: "wizard-hat",
      assetFile: "wizard-hat.svg",
      aspect: 15 / 16,
      widthScale: 0.95,
      offsetY: 0.3,
    });

    assert.strictEqual(harness.accessory.src, "../assets/accessories/wizard-hat.svg");
    assert.strictEqual(typeof harness.accessory.onload, "function");
    harness.accessory.onload();
    assert.strictEqual(harness.api.pendingNext, null);
    assert.strictEqual(harness.accessory.style.display, "block");
  });

  it("fails open once when an accessory asset never settles and accepts a late load", () => {
    const harness = createRendererHarness({
      initialObjectData: "",
      themeConfig: accessoryConfig(),
    });
    const pendingPet = harness.api.pendingNext;
    pendingPet.listeners.get("load")();
    assert.ok(harness.api.pendingNext, "the first pet visual should briefly wait for its accessory");

    const loadTimer = harness.api.accessoryAssetLoadTimer;
    assert.ok(loadTimer, "the accessory request should own one bounded load timer");
    loadTimer.cleared = true;
    loadTimer.callback();

    assert.strictEqual(harness.api.accessoryAssetSettled, true);
    assert.strictEqual(harness.api.accessoryAssetLoadTimer, null);
    assert.strictEqual(harness.api.pendingNext, null, "timeout must release the waiting pet visual");
    assert.strictEqual(harness.accessory.style.display, "none");
    assert.strictEqual(
      harness.electronCalls.filter((call) => call.name === "notifyPetVisualReady").length,
      1,
      "the first visible pet must still notify main exactly once"
    );

    harness.accessory.onload();
    assert.strictEqual(harness.accessory.style.display, "block", "a late successful load should recover");
  });

  it("fails open when an accessory asset reports an error", () => {
    const harness = createRendererHarness({
      initialObjectData: "",
      themeConfig: accessoryConfig(),
    });
    harness.api.pendingNext.listeners.get("load")();
    const loadTimer = harness.api.accessoryAssetLoadTimer;
    assert.ok(loadTimer);

    harness.accessory.onerror();

    assert.strictEqual(loadTimer.cleared, true);
    assert.strictEqual(harness.api.accessoryAssetSettled, true);
    assert.strictEqual(harness.api.pendingNext, null);
    assert.strictEqual(harness.accessory.style.display, "none");
    assert.strictEqual(
      harness.electronCalls.filter((call) => call.name === "notifyPetVisualReady").length,
      1
    );
  });


  it("keeps sibling objects outside tint and pet-media swap cleanup", () => {
    const harness = createRendererHarness({
      initialObjectData: "",
      themeConfig: accessoryConfig(),
    });
    harness.api.pendingNext.listeners.get("load")();
    harness.accessory.onload();
    const siblingObject = harness.context.document.createElement("object");
    siblingObject.className = "decorative-object";
    harness.accessoryLayer.appendChild(siblingObject);

    harness.electronHandlers.onPetTintChange({
      id: "mono",
      filter: "grayscale(1) brightness(1.05)",
    });
    assert.strictEqual(siblingObject.style.filter, undefined);

    harness.api.swapToFile("next.svg", "working", false);
    harness.api.pendingNext.listeners.get("load")();
    assert.strictEqual(siblingObject.isConnected, true);
    assert.strictEqual(harness.accessory.isConnected, true);
  });

  it("rejects paths, unbounded geometry, and malformed none payloads", () => {
    const harness = createRendererHarness();
    const normalize = harness.api.normalizeAccessoryPayload;

    assert.strictEqual(normalize({ id: "hat", assetFile: "../hat.svg", aspect: 1, widthScale: 1, offsetY: 0 }).id, "none");
    assert.strictEqual(normalize({ id: "hat", assetFile: "hat.svg", aspect: Infinity, widthScale: 1, offsetY: 0 }).id, "none");
    assert.strictEqual(normalize({ id: "hat", assetFile: "hat.svg", aspect: 1, widthScale: 99, offsetY: 0 }).id, "none");
    assert.strictEqual(normalize({ id: "none", assetFile: "hat.svg", aspect: 1, widthScale: 1, offsetY: 0 }).id, "none");
  });

  it("keeps the structural stages full-size and uses independent transform properties", () => {
    const html = readNormalized(path.join(__dirname, "..", "src", "index.html"));
    const css = readNormalized(path.join(__dirname, "..", "src", "styles.css"));
    const renderer = readNormalized(RENDERER);
    const preload = readNormalized(PRELOAD);

    assert.ok(html.indexOf('id="pet-media-layer"') < html.indexOf('id="pet-accessory-layer"'));
    assert.ok(html.includes('<div id="pet-effect-stage">'));
    assert.ok(html.includes('<div id="pet-particle-layer"></div>'));
    assert.ok(html.indexOf('src="pet-accessory-layout.js"') < html.indexOf('src="renderer.js"'));
    assert.match(
      css,
      /#pet-effect-stage,\s*#pet-particle-layer\s*\{[^}]*pointer-events: none;[^}]*transform: none;[^}]*translate: none;[^}]*scale: none;[^}]*rotate: none;[^}]*\}/
    );
    assert.ok(css.includes("#pet-container.roam-walk #pet-motion-stage"));
    assert.ok(css.includes("translate: 3px 0;"));
    assert.ok(renderer.includes('mediaLayer.querySelectorAll("object.clawd-object, img.clawd-img")'));
    assert.ok(renderer.includes("const activeFlip = shouldApplyAssetDirectionFlip(state);"));
    assert.ok(renderer.includes('assetDirectionStage.style.scale = activeFlip ? "-1 1" : "none";'));
    assert.ok(preload.includes(
      'onPetAccessoryChange: (cb) => ipcRenderer.on("pet-accessory-change", (_, payload) => cb(payload))'
    ));
  });
});

describe("renderer Cloudling pointer bridge", () => {
  it("bridges only selected Cloudling pointer states through the exporter API", () => {
    const source = fs.readFileSync(RENDERER, "utf8");
    const preload = fs.readFileSync(PRELOAD, "utf8");

    assert.ok(source.includes('const CLOUDLING_POINTER_BRIDGE_STATES = new Set(["idle"]);'));
    assert.ok(source.includes('typeof svgWindow.__cloudlingSetPointer === "function"'));
    assert.ok(source.includes('svgWindow.__cloudlingSetPointer(payload);'));
    assert.ok(source.includes('window.electronAPI.onCloudlingPointer((payload) => {'));
    assert.ok(preload.includes('onCloudlingPointer: (callback) => ipcRenderer.on("cloudling-pointer", (_, payload) => callback(payload))'));
  });
});

describe("renderer sound preload and warmup", () => {



});

describe("renderer initial frame idle visual", () => {
  it("rests on the user-selected idle visual when the theme config carries one", () => {
    const harness = createRendererHarness({
      initialObjectData: "",
      themeConfig: {
        idleFollowSvg: "clawd-idle-follow.svg",
        idleDefaultVisual: "clawd-idle-reading.svg",
      },
    });
    assert.strictEqual(harness.api.pendingSvgFile, "clawd-idle-reading.svg");
  });

  it("falls back to the follow sprite when no visual is selected", () => {
    const harness = createRendererHarness({
      initialObjectData: "",
      themeConfig: {
        idleFollowSvg: "clawd-idle-follow.svg",
        idleDefaultVisual: null,
      },
    });
    assert.strictEqual(harness.api.pendingSvgFile, "clawd-idle-follow.svg");
  });
});

describe("renderer file-aware idle eye tracking", () => {
  function restOnIdleVisual(harness, file, { withEyes } = {}) {
    harness.api.displayStateFile("idle", file);
    const next = harness.api.pendingNext;
    assert.ok(next, `state change to ${file} should start a swap`);
    attachFakeSvgDocument(next, { withEyes: !!withEyes });
    next.listeners.get("load")();
    return next;
  }

  it("attaches eye tracking when idle rests on the follow sprite", () => {
    const harness = createRendererHarness({
      themeConfig: { idleFollowSvg: "clawd-idle-follow.svg" },
    });
    restOnIdleVisual(harness, "clawd-idle-follow.svg", { withEyes: true });

    assert.ok(harness.api.eyeTarget, "follow sprite must keep eye tracking");
  });

  it("never attaches eye tracking to a non-follow idle visual, even one with eye targets", () => {
    const harness = createRendererHarness({
      themeConfig: { idleFollowSvg: "clawd-idle-follow.svg" },
    });
    restOnIdleVisual(harness, "clawd-idle-reading.svg", { withEyes: true });
    drainActiveTimers(harness, (timer) => timer.ms === 16 && !timer.cleared);

    assert.strictEqual(harness.api.eyeTarget, null);
  });

  it("does not reattach stale eye tracking on eye move for a non-follow idle visual", () => {
    const harness = createRendererHarness({
      themeConfig: { idleFollowSvg: "clawd-idle-follow.svg" },
    });
    const nonFollowObject = restOnIdleVisual(
      harness,
      "clawd-idle-reading.svg",
      { withEyes: true }
    );

    // Simulate tracking left behind by an older renderer or a theme reload,
    // then replace the object's document so onEyeMove sees a stale target.
    harness.api.attachEyeTracking(nonFollowObject);
    assert.ok(harness.api.eyeTarget);
    const replacementSvg = attachFakeSvgDocument(nonFollowObject, { withEyes: true });

    harness.electronHandlers.onEyeMove(2, -1);

    assert.strictEqual(harness.api.eyeTarget, null);
    assert.equal(replacementSvg.elements.get("eyes-js").getAttribute("transform"), "");
    assert.equal(
      drainActiveTimers(harness, (timer) => timer.ms === 16 && !timer.cleared),
      0,
      "non-follow idle must not schedule an eye-target reattach retry"
    );
  });

  it("detaches stale eye tracking when the same non-follow idle visual is re-entered", () => {
    const harness = createRendererHarness({
      themeConfig: { idleFollowSvg: "clawd-idle-follow.svg" },
    });
    const nonFollowObject = restOnIdleVisual(
      harness,
      "clawd-idle-reading.svg",
      { withEyes: true }
    );
    harness.api.attachEyeTracking(nonFollowObject);
    assert.ok(harness.api.eyeTarget);

    harness.api.displayStateFile("idle", "clawd-idle-reading.svg");

    assert.strictEqual(harness.api.clawdEl, nonFollowObject);
    assert.strictEqual(harness.api.pendingNext, null, "same-file re-entry must not swap media");
    assert.strictEqual(harness.api.eyeTarget, null);
  });


  it("skips the wake eye-object reload and reports resumed on a non-follow resting visual", () => {
    const harness = createRendererHarness({
      themeConfig: { idleFollowSvg: "clawd-idle-follow.svg" },
    });
    restOnIdleVisual(harness, "clawd-idle-reading.svg");

    harness.electronHandlers.onSystemWake({ id: "wake-nonfollow-1", trigger: "resume", attempt: 0 });

    assert.strictEqual(harness.api.pendingNext, null, "no eye-object reload should start");
    const report = harness.electronCalls.find((call) => call.name === "reportSystemWakeStatus");
    assert.ok(report, "wake must report immediately instead of waiting for eye targets");
    assert.equal(report.args[0].id, "wake-nonfollow-1");
    assert.equal(report.args[0].result, "resumed");
    assert.equal(report.args[0].eyeTrackingReady, true);
  });
});

describe("renderer glyph flip compensation", () => {
  it("cancels a stale opposite-channel load when the displayed file already matches again", () => {
    const harness = createRendererHarness({
      themeConfig: {
        eyeTracking: { states: ["idle"] },
        idleFollowSvg: "shared.svg",
      },
    });

    harness.api.displayStateFile("idle", "shared.svg");
    const displayedObject = harness.api.pendingNext;
    assert.strictEqual(displayedObject.tagName, "OBJECT");
    attachFakeSvgDocument(displayedObject, { withEyes: true });
    displayedObject.listeners.get("load")();

    harness.api.displayStateFile("roam", "shared.svg");
    const staleImage = harness.api.pendingNext;
    assert.strictEqual(staleImage.tagName, "IMG");

    harness.api.displayStateFile("idle", "shared.svg");

    assert.strictEqual(harness.api.pendingNext, null);
    assert.strictEqual(harness.api.clawdEl, displayedObject);
    assert.strictEqual(harness.api.currentDisplayedState, "idle");
    staleImage.listeners.get("load")();
    assert.strictEqual(harness.api.clawdEl, displayedObject);
    assert.strictEqual(harness.api.currentDisplayedState, "idle");
  });

  it("retargets a pending same-file swap to the latest state before commit", () => {
    const harness = createRendererHarness({
      themeConfig: {
        hasRoamVisual: true,
        roamFlipAssets: true,
        miniFlipAssets: false,
      },
    });

    harness.electronHandlers.onRoamHeading(true);
    harness.api.displayStateFile("roam", "shared-crabwalk.svg");
    const pending = harness.api.pendingNext;
    assert.ok(pending);

    harness.api.displayStateFile("working", "shared-crabwalk.svg");

    assert.strictEqual(
      harness.api.pendingNext,
      pending,
      "the loaded asset should stay deduplicated while its commit state is retargeted"
    );
    pending.listeners.get("load")();

    assert.strictEqual(harness.api.currentDisplayedState, "working");
    assert.strictEqual(
      harness.assetDirectionStage.style.scale,
      "none",
      "ordinary working state must clear the leftward roam mirror at commit"
    );
  });

  it("retargets a pending same-file object swap to the latest state before commit", () => {
    const harness = createRendererHarness({
      themeConfig: {
        hasRoamVisual: true,
        roamFlipAssets: true,
        miniFlipAssets: false,
        rendering: {
          svgChannel: "object",
        },
      },
    });

    harness.electronHandlers.onRoamHeading(true);
    harness.api.displayStateFile("roam", "shared-crabwalk.svg");
    const pending = harness.api.pendingNext;
    assert.ok(pending);
    assert.strictEqual(pending.tagName, "OBJECT");

    harness.api.displayStateFile("working", "shared-crabwalk.svg");

    assert.strictEqual(harness.api.pendingNext, pending);
    pending.listeners.get("load")();

    assert.strictEqual(harness.api.currentDisplayedState, "working");
    assert.strictEqual(harness.assetDirectionStage.style.scale, "none");
  });

  it("preserves each fading media element's stamped direction when the shared stage flips", () => {
    const harness = createRendererHarness({
      themeConfig: {
        hasRoamVisual: true,
        transitions: {
          "roam.svg": { out: 500 },
        },
      },
    });

    harness.electronHandlers.onRoamHeading(true);
    harness.api.swapToFile("roam.svg", "roam", false);
    const roam = harness.api.pendingNext;
    roam.offsetLeft = 37;
    roam.listeners.get("load")();
    assert.strictEqual(harness.assetDirectionStage.style.scale, "-1 1");
    assert.strictEqual(roam.style.scale, "none");

    harness.api.swapToFile("working.svg", "working", false);
    const working = harness.api.pendingNext;
    working.listeners.get("load")();

    assert.strictEqual(harness.assetDirectionStage.style.scale, "none");
    assert.strictEqual(working.style.scale, "none");
    assert.strictEqual(roam.isConnected, true, "old media should still be fading");
    assert.strictEqual(roam.style.opacity, "0");
    assert.strictEqual(roam.style.scale, "-1 1");
    assert.strictEqual(roam.style.transformOrigin, "73px 50%");
  });



});


it("action plan renders the configured sequence and holds through an Agent error until release", () => {
  const harness = createRendererHarness({themeConfig:{dragSvg:"lift.svg",actionPlan:{version:1,states:{
    idle:{mode:"sequence",actions:[{file:"rest.svg",enabled:true,durationMs:5000}]},
    working:{mode:"sequence",actions:[{file:"type.svg",enabled:true,durationMs:2000},{file:"build.svg",enabled:true,durationMs:3000}]},
    error:{mode:"sequence",actions:[{file:"error.svg",enabled:true,durationMs:5000}]},
    held:{mode:"sequence",actions:[{file:"lift.svg",enabled:true,durationMs:5000}]},
  }}}});
  harness.electronHandlers.onStateChange("working","thinking.svg");
  assert.strictEqual(harness.api.pendingSvgFile,"type.svg");
  const timer=harness.activeTimers().find(t=>t.ms===2000);assert.ok(timer);timer.cleared=true;timer.callback();
  assert.strictEqual(harness.api.pendingSvgFile,"build.svg");
  harness.electronHandlers.onStateChange("held","lift.svg");
  assert.strictEqual(harness.api.pendingSvgFile,"lift.svg");
  harness.electronHandlers.onStateChange("error","error.svg");
  assert.strictEqual(harness.api.pendingSvgFile,"error.svg");
});

it('legacy directional messages cannot bypass the effective action plan',()=>{
  const h=createRendererHarness({themeConfig:{dragSvg:'drag.svg',dragSvgs:{left:'left.svg',right:'right.svg'}}});
  h.api.displayStateFile('idle','rest.svg');const before=h.api.pendingSvgFile;
  h.electronHandlers.onStartDragReaction('left');h.electronHandlers.onStartDragReaction('right');
  assert.strictEqual(h.api.pendingSvgFile,before);
});




it('empty completion reports the selected random idle duration to the main process', () => {
  const h = createRendererHarness({ themeConfig: { actionPlan: { version: 1, states: {
    idle: { mode: 'random', actions: [
      { file: 'short.svg', enabled: true, durationMs: 2000 },
      { file: 'long.svg', enabled: true, durationMs: 6000 },
    ] },
    complete: { mode: 'sequence', actions: [] },
  } } } });
  h.electronHandlers.onStateChange('complete', 'done.svg', {state:'complete',themeGeneration:2,stateRevision:7});
  const frame = h.electronCalls.filter(call => call.name === 'reportActionFrame').at(-1).args[0];
  assert.ok(['short.svg', 'long.svg'].includes(frame.file));
  assert.strictEqual(frame.state, 'complete');
  assert.strictEqual(frame.themeGeneration, 2);
  assert.strictEqual(frame.stateRevision, 7);
  assert.strictEqual(frame.returnAfterMs, undefined);
  assert.ok(!h.activeTimers().some(timer => [2000, 6000].includes(timer.ms)), 'random completion plays only one fallback action');
});

it('retired low-power theme overrides cannot change the configured idle action',()=>{
 const h=createRendererHarness({themeConfig:{actionPlan:{version:1,states:{idle:{mode:'sequence',actions:[{file:'rest.svg',enabled:true,durationMs:5000}]}}},rendering:{lowPowerStaticImageOverrides:{idle:{from:'rest.svg',to:'unassigned.png'}}}}});
 h.electronHandlers.onStateChange('idle','rest.svg',{state:'idle',themeGeneration:1,stateRevision:2});
 assert.strictEqual(h.api.pendingSvgFile,'rest.svg');
 assert.strictEqual(h.electronCalls.filter(x=>x.name==='reportActionFrame').at(-1).args[0].file,'rest.svg');
});

it('retired sound IPC cannot allocate or play audio, including preview URLs',async()=>{
 const h=createRendererHarness();
 h.electronHandlers.onPreloadSounds({urls:['file:///complete.mp3']});
 h.electronHandlers.onPlaySound({url:'file:///complete.mp3',volume:1});
 h.electronHandlers.onPlaySound({url:'file:///complete.mp3?_t=1',volume:1});
 await Promise.resolve();assert.equal(h.audioInstances.length,0);
});

it('idle action playback keeps replaying after five seconds without an idle pause deadline',()=>{
 const h=createRendererHarness({themeConfig:{actionPlan:{version:1,states:{idle:{mode:'sequence',actions:[{file:'rest.svg',enabled:true,durationMs:1000}]}}}}});
 let now=0;h.context.Date={now:()=>now};h.electronHandlers.onStateChange('idle','rest.svg');
 for(let n=1;n<=8;n++){
  const replay=h.activeTimers().find(t=>t.ms===1000);assert.ok(replay,'idle must continue at second '+n);now=n*1000;replay.cleared=true;replay.callback();
  const pending=h.api.pendingNext;if(pending)pending.listeners.get('load')();
 }
 assert.ok(h.activeTimers().some(t=>t.ms===1000));
 assert.equal(h.electronHandlers.onLowPowerIdleModeChange,undefined);
});

it('held playback preserves the loaded entry animation across cycle timers and restarts on a new lift', () => {
 const h=createRendererHarness({themeConfig:{actionPlan:{version:1,states:{
  idle:{mode:'sequence',actions:[{file:'standing.svg',enabled:true,durationMs:4000}]},
  held:{mode:'sequence',actions:[{file:'drag.svg',enabled:true,durationMs:5000}]},
 }}}});
 h.electronHandlers.onStateChange('held','drag.svg');
 const first=h.api.pendingNext;assert.ok(first);first.listeners.get('load')();
 for(let n=0;n<3;n++){
  const timer=h.activeTimers().find(t=>t.ms===5000);assert.ok(timer);timer.cleared=true;timer.callback();
  assert.equal(h.api.pendingNext,null,'continued suspension must not reload the SVG');
  assert.equal(h.electronCalls.filter(c=>c.name==='reportActionFrame').at(-1).args[0].replay,false);
 }
 h.electronHandlers.onStateChange('idle','standing.svg');
 h.api.pendingNext.listeners.get('load')();
 h.electronHandlers.onStateChange('held','drag.svg');
 assert.ok(h.api.pendingNext);assert.notStrictEqual(h.api.pendingNext,first);
 assert.equal(h.electronCalls.filter(c=>c.name==='reportActionFrame').at(-1).args[0].replay,true);
});

it('action frame reports distinguish a new celebration cycle from a duplicate state update',()=>{
 const h=createRendererHarness({themeConfig:{actionPlan:{version:1,states:{
  idle:{mode:'sequence',actions:[{file:'standing.svg',enabled:true,durationMs:4000}]},
  complete:{mode:'sequence',actions:[{file:'celebration-screen.svg',enabled:true,durationMs:8000}]},
 }}}});
 h.electronHandlers.onStateChange('complete','celebration-screen.svg',{state:'complete',themeGeneration:1,stateRevision:1});
 assert.equal(h.electronCalls.filter(c=>c.name==='reportActionFrame').at(-1).args[0].replay,true);
 h.electronHandlers.onStateChange('complete','celebration-screen.svg',{state:'complete',themeGeneration:1,stateRevision:2});
 assert.equal(h.electronCalls.filter(c=>c.name==='reportActionFrame').at(-1).args[0].replay,false);
});

function heldReturnHarness() {
 const h=createRendererHarness({themeConfig:{dragSvg:'drag.svg',dragReleaseDuration:1600,actionPlan:{version:1,states:{
  idle:{mode:'sequence',actions:[{file:'standing.svg',enabled:true,durationMs:4000}]},
  working:{mode:'sequence',actions:[{file:'working.svg',enabled:true,durationMs:5000}]},
  error:{mode:'sequence',actions:[{file:'error.svg',enabled:true,durationMs:5000}]},
  held:{mode:'sequence',actions:[{file:'drag.svg',enabled:true,durationMs:5000}]},
 }}}});
 h.electronHandlers.onStateChange('held','drag.svg');
 const held=h.api.pendingNext;
 assert.equal(held.tagName,'OBJECT','release needs access to the current SVG pose');
 assert.equal(h.container.classList.contains('pet-lifted'),false,'the SVG owns its hanging motion');
 const root=new FakeElement('svg');root.setAttribute('data-held-release','true');
 held.contentDocument={documentElement:root,querySelectorAll:()=>[],getAnimations:()=>[]};
 held.listeners.get('load')();
 return {h,held,root};
}

it('release returns the laptop in the loaded SVG before resuming the latest configured action', () => {
 const {h,held,root}=heldReturnHarness();
 h.electronHandlers.onStateChange('idle','standing.svg');
 assert.equal(h.api.pendingNext,null);assert.strictEqual(h.api.clawdEl,held);
 assert.ok(root.classList.contains('pet-released'));
 const finish=h.activeTimers().find(t=>t.ms===1600);assert.ok(finish);
 h.electronHandlers.onStateChange('working','working.svg');
 assert.equal(h.api.pendingNext,null,'incoming work must wait for the handoff');
 finish.cleared=true;finish.callback();
 assert.equal(h.api.pendingSvgFile,'working.svg');
});

it('lifting again cancels the return and a stale release callback cannot interrupt suspension', () => {
 const {h}=heldReturnHarness();
 h.electronHandlers.onStateChange('idle','standing.svg');
 const finish=h.activeTimers().find(t=>t.ms===1600);assert.ok(finish);
 h.electronHandlers.onStateChange('held','drag.svg');
 assert.ok(finish.cleared);const next=h.api.pendingNext;assert.ok(next);
 finish.callback();assert.strictEqual(h.api.pendingNext,next);assert.equal(h.api.pendingSvgFile,'drag.svg');
});

it('theme replacement cancels a pending laptop return without restoring the previous theme', () => {
 const {h}=heldReturnHarness();
 h.electronHandlers.onStateChange('idle','standing.svg');
 const finish=h.activeTimers().find(t=>t.ms===1600);assert.ok(finish);
 h.electronHandlers.onThemeConfig({assetsPath:'../themes/other/assets',idleFollowSvg:'other.svg',eyeTracking:{states:[]},
  actionPlan:{version:1,states:{idle:{mode:'sequence',actions:[{file:'other.svg',enabled:true,durationMs:4000}]}}}});
 h.electronHandlers.onStateChange('idle','other.svg');
 const next=h.api.pendingNext;finish.callback();
 assert.strictEqual(h.api.pendingNext,next);assert.equal(h.api.pendingSvgFile,'other.svg');assert.ok(finish.cleared);
});

it('release falls back to the current action when the held document is unavailable', () => {
 const {h,held}=heldReturnHarness();held.contentDocument=null;
 h.electronHandlers.onStateChange('working','working.svg');
 assert.equal(h.api.pendingSvgFile,'working.svg');
 assert.equal(h.activeTimers().some(t=>t.ms===1600),false);
});
