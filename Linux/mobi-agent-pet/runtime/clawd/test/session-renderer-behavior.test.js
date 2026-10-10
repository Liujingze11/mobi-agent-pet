"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { i18n, SUPPORTED_LANGS } = require("../src/i18n");

class FakeClassList {
  constructor(element) { this.element = element; }
  add(...names) {
    const set = new Set(this.element.className.split(/\s+/).filter(Boolean));
    for (const name of names) set.add(name);
    this.element.className = [...set].join(" ");
  }
  remove(...names) {
    const set = new Set(this.element.className.split(/\s+/).filter(Boolean));
    for (const name of names) set.delete(name);
    this.element.className = [...set].join(" ");
  }
  contains(name) { return this.element.className.split(/\s+/).includes(name); }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.className = "";
    this.classList = new FakeClassList(this);
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.textContent = "";
    this.title = "";
    this.hidden = false;
    this.disabled = false;
    this.style = { setProperty(name, value) { this[name] = value; } };
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(listener);
  }
  async dispatch(name) {
    const event = { stopPropagation() {}, preventDefault() {}, key: "" };
    for (const listener of this.listeners.get(name) || []) await listener(event);
  }
  querySelector(selector) {
    if (!selector.startsWith(".")) return null;
    return byClass(this, selector.slice(1))[0] || null;
  }
  replaceWith() {}
  focus() {}
  select() {}
}

function createDocument(ids) {
  const elements = new Map(ids.map((id) => [id, new FakeElement("div")]));
  return {
    title: "",
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => ({ textContent: String(text), children: [] }),
    createDocumentFragment: () => new FakeElement("fragment"),
    getElementById: (id) => elements.get(id) || null,
    querySelector: (selector) => selector === ".dashboard-tabs" ? elements.get("dashboardTabs") : null,
    querySelectorAll: () => [],
    contains: () => true,
    elements,
  };
}

function descendants(root) {
  const result = [];
  for (const child of root.children || []) {
    result.push(child, ...descendants(child));
  }
  return result;
}

function byClass(root, className) {
  return descendants(root).filter((element) =>
    element.classList && element.classList.contains(className));
}

async function flush() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function translations() {
  return {
    dashboardWindowTitle: "Sessions",
    dashboardPetScene: "Meadow",
    dashboardPetResting: "Relaxing",
    dashboardPetWorking: "Working",
    dashboardQuotaHint: "Agent usage",
    dashboardQuotaEmpty: "No quota data yet",
    dashboardQuotaMinRemaining: "At least {percent}% remaining",
    dashboardQuotaNearLimit: "Running low",
    dashboardQuotaLastKnown: "Last reported",
    dashboardJumpTerminal: "Jump",
    dashboardJumpToConversation: "Jump to conversation",
    dashboardJumping: "Jumping...",
    dashboardJumpSucceeded: "Jumped",
    dashboardJumpFailed: "Could not jump",
    dashboardConversationUnavailable: "Cannot jump to this conversation",
    dashboardOpenFolder: "Open Folder",
    sessionFocusUnavailableRemote: "Remote sessions cannot focus a terminal on this computer.",
    sessionFocusUnavailableWebui: "WebUI sessions do not have a local terminal window.",
    sessionFocusUnavailableMissingTerminalInfo: "This session did not provide terminal window information.",
    sessionOpenFolderFailed: "Could not open folder: {reason}",
    sessionOpenFolderUnavailable: "This folder is no longer available.",
    sessionJustNow: "now",
    sessionHudElapsedSec: "{n}s",
    sessionMinAgo: "{n}m",
    sessionHrAgo: "{n}h",
    sessionBadgeIdle: "Idle",
    sessionBadgeDone: "Done",
    sessionLocal: "Local",
  };
}

function session(id, overrides = {}) {
  return {
    id,
    displayTitle: id,
    state: "idle",
    badge: "idle",
    updatedAt: Date.now(),
    canFocus: false,
    sourceType: "local",
    host: null,
    platform: null,
    cwd: "/safe/project",
    ...overrides,
  };
}

async function loadDashboard(sessions, openResult = { status: "ok" }, focusResult = { status: "ok" }, accountQuota = []) {
  const document = createDocument(["content", "quotaSummary", "quotaEmpty", "quotaHint", "petScene", "petImage", "petName", "petMood", "dashboardSidebar", "statusTab", "behaviorTab", "themeTab", "actionsTab", "actionsTabIcon", "actionsTabLabel", "actionsPage", "actionsContent", "statusTabIcon", "behaviorTabIcon", "themeTabIcon", "statusTabLabel", "behaviorTabLabel", "themeTabLabel", "statusPage", "behaviorPage", "themePage", "themeContent", "statusHeading", "behaviorTitle", "behaviorIntro", "behaviorRows", "behaviorError"]);
  const openCalls = [];
  const focusCalls = [];
  const aliasCalls = [];
  let renderInterval = null;
  let snapshotListener = null;
  let petScene = { themeId: "calico", name: "Calico", imageUrl: "file:///calico-idle.svg" };
  const api = {
    onLangChange: () => {},
    onSessionSnapshot: (listener) => { snapshotListener = listener; },
    getI18n: async () => ({ lang: "en", translations: translations() }),
    getSnapshot: async () => ({
      sessions,
      accountQuota,
      groups: [...new Set(sessions.map((entry) => entry.host || ""))].map((host) => ({
        host,
        ids: sessions.filter((entry) => (entry.host || "") === host).map((entry) => entry.id),
      })),
    }),
    getPetScene: async () => petScene,
    getPetBehavior: async () => ({ freeRoam: false, allowEdgePinning: false, keepSizeAcrossDisplays: false }),
    openSessionFolder: async (...args) => {
      openCalls.push(args);
      return typeof openResult === "function" ? openResult(...args) : openResult;
    },
    focusSession: (...args) => {
      focusCalls.push(args);
      return typeof focusResult === "function" ? focusResult(...args) : focusResult;
    },
    setSessionAlias: async (...args) => { aliasCalls.push(args); return { status: "ok" }; },
    ackCompletion: async () => ({ status: "noop" }),
    hideSession: async () => ({ status: "ok" }),
  };
  const context = vm.createContext({
    window: { dashboardAPI: api, addEventListener: () => {} }, document, console, Intl, Date,
    ClawdDashboardTheme: { create: () => ({ t: () => "Theme", enter: () => {}, leave: () => {}, refresh: async () => {}, render: () => {} }) },
    ClawdDashboardAnimation: { create: () => ({ enter: async () => {}, leave: () => {}, refreshLanguage: () => {} }) },
    setInterval: (callback) => { renderInterval = callback; return 1; },
    setTimeout: () => 1,
    clearTimeout: () => {},
    requestAnimationFrame: (cb) => cb(),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "session-focus-unavailable.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "dashboard-renderer.js"), "utf8"), context);
  await flush();
  return {
    root: document.elements.get("content"),
    elements: document.elements,
    openCalls,
    focusCalls,
    aliasCalls,
    tickRender: () => { if (renderInterval) renderInterval(); },
    pushQuota: (nextAccountQuota) => snapshotListener({ sessions, accountQuota: nextAccountQuota,
      groups: [...new Set(sessions.map((entry) => entry.host || ""))].map((host) => ({
        host,
        ids: sessions.filter((entry) => (entry.host || "") === host).map((entry) => entry.id),
      })) }),
    setPetScene: (nextScene) => { petScene = nextScene; },
  };
}

test("Dashboard quota cards share conversation themes and fold independently across quota updates", async () => {
  const now = Date.now();
  const bucket = (usedPercent) => ({ usedPercent, resetAt: now + 3600000, lastSeenAt: now });
  const quota = (codexPercent = 92) => [{ host: null,
    claudeQuota: { group: { claudeFiveHour: bucket(45) }, lastSeenAt: now },
    codexQuota: { group: { codexFiveHour: bucket(codexPercent) }, lastSeenAt: now },
    antigravityQuota: { group: { geminiFiveHour: bucket(16) }, lastSeenAt: now },
  }];
  const dashboard = await loadDashboard([
    session("claude", { agentId: "claude-code" }),
    session("codex", { agentId: "codex" }),
    session("antigravity", { agentId: "antigravity-cli" }),
  ], undefined, undefined, quota());
  const root = dashboard.elements.get("quotaSummary");
  assert.strictEqual(byClass(root, "quota-section").length, 3);
  assert.strictEqual(byClass(root, "card-agent-claude").length, 1);
  assert.strictEqual(byClass(root, "card-agent-codex").length, 1);
  assert.strictEqual(byClass(root, "card-agent-antigravity").length, 1);
  const codexCard = byClass(root, "card-agent-codex")[0];
  assert.match(byClass(codexCard, "quota-section-summary")[0].textContent, /8%/);
  assert.strictEqual(byClass(codexCard, "quota-section-alert").length, 1);
  assert.match(byClass(codexCard, "quota-percent")[0].textContent, /^8%/);
  assert.strictEqual(byClass(codexCard, "quota-bar-fill")[0].style.width, "8%");
  const toggle = byClass(codexCard, "quota-section-toggle")[0];
  assert.strictEqual(toggle.attributes["aria-expanded"], "true");
  await toggle.dispatch("click");
  assert.strictEqual(toggle.attributes["aria-expanded"], "false");
  assert.strictEqual(byClass(codexCard, "quota-section-body")[0].hidden, true);
  assert.strictEqual(byClass(root, "card-agent-claude")[0].children[1].hidden, false);

  dashboard.pushQuota(quota(95));
  const refreshed = byClass(root, "card-agent-codex")[0];
  assert.strictEqual(byClass(refreshed, "quota-section-toggle")[0].attributes["aria-expanded"], "false");
  assert.strictEqual(byClass(refreshed, "quota-section-body")[0].hidden, true);
  assert.match(byClass(refreshed, "quota-section-summary")[0].textContent, /5%/);
  assert.strictEqual(byClass(root, "card-agent-claude")[0].children[1].hidden, false);
});

test("Dashboard does not show a near-limit alert for expired quota", async () => {
  const now = Date.now();
  const dashboard = await loadDashboard([], undefined, undefined, [{ host: null,
    codexQuota: { group: { codexFiveHour: { usedPercent: 99, resetAt: now - 1000, lastSeenAt: now } }, lastSeenAt: now },
  }]);
  const card = byClass(dashboard.elements.get("quotaSummary"), "quota-section")[0];
  assert.match(byClass(card, "quota-section-summary")[0].textContent, /100%/);
  assert.strictEqual(byClass(card, "quota-section-alert").length, 0);
});

test("Dashboard marks an old quota report instead of presenting it as a live alert", async () => {
  const now = Date.now();
  const old = now - 6 * 60000;
  const dashboard = await loadDashboard([], undefined, undefined, [{ host: null,
    claudeQuota: { group: { claudeFiveHour: { usedPercent: 96, resetAt: now + 3600000, lastSeenAt: old } }, lastSeenAt: old },
  }]);
  const card = byClass(dashboard.elements.get("quotaSummary"), "quota-section")[0];
  assert.match(byClass(card, "quota-section-summary")[0].textContent, /4%/);
  assert.strictEqual(byClass(card, "quota-section-stale").length, 1);
  assert.strictEqual(byClass(card, "quota-section-alert").length, 0);
});

test("Dashboard summarizes the lowest remaining quota across sources and windows", async () => {
  const now = Date.now();
  const bucket = (usedPercent) => ({ usedPercent, resetAt: now + 3600000, lastSeenAt: now });
  const dashboard = await loadDashboard([], undefined, undefined, [
    { host: null, codexQuota: { group: { codexFiveHour: bucket(30), codexWeekly: bucket(60) }, lastSeenAt: now } },
    { host: "server", codexQuota: { group: { codexFiveHour: bucket(90) }, lastSeenAt: now } },
  ]);
  const card = byClass(dashboard.elements.get("quotaSummary"), "quota-section")[0];
  assert.match(byClass(card, "quota-section-summary")[0].textContent, /10%/);
  assert.deepStrictEqual(byClass(card, "quota-bar-fill").map((fill) => fill.style.width), ["70%", "40%", "10%"]);
  assert.strictEqual(byClass(card, "quota-section-alert").length, 1);
});

test("Dashboard shows the active pet in its scene while keeping session cards", async () => {
  const { root, elements } = await loadDashboard([
    session("working", { badge: "running", canFocus: true }),
    session("finished", { badge: "done" }),
  ]);
  assert.strictEqual(elements.get("petImage").src, "file:///calico-idle.svg");
  assert.strictEqual(elements.get("petName").textContent, "Calico");
  assert.ok(elements.get("petScene").className.includes("is-working"));
  assert.strictEqual(elements.get("petMood").textContent, "Working");
  assert.strictEqual(byClass(root, "group-title").length, 0);
  assert.strictEqual(byClass(root, "card").length, 2);
  assert.strictEqual(byClass(root, "actions").length, 2);
});

test("Dashboard labels remote groups without a local heading", async () => {
  const { root } = await loadDashboard([
    session("local"),
    session("remote", { host: "build-server", sourceType: "ssh" }),
  ]);
  const headings = byClass(root, "group-title");
  assert.strictEqual(headings.length, 1);
  assert.strictEqual(headings[0].textContent, "build-server");
  assert.strictEqual(byClass(root, "card").length, 2);
});

test("Dashboard scene follows the selected pet while the window stays open", async () => {
  const dashboard = await loadDashboard([session("working")]);
  dashboard.setPetScene({ themeId: "fox", name: "Fox", imageUrl: "file:///fox-idle.svg" });
  dashboard.tickRender();
  await flush();
  assert.strictEqual(dashboard.elements.get("petImage").src, "file:///fox-idle.svg");
  assert.strictEqual(dashboard.elements.get("petName").textContent, "Fox");
});

test("Dashboard edits a session title after one click and saves the new alias", async () => {
  const { root, aliasCalls } = await loadDashboard([session("claude:123", { displayTitle: "Draft" })]);
  await byClass(root, "session-title")[0].dispatch("click");
  const input = byClass(root, "session-title-input")[0];
  assert.ok(input);
  input.value = "Project notes";
  await input.dispatch("input");
  await input.dispatch("blur");
  assert.strictEqual(aliasCalls.length, 1);
  assert.strictEqual(aliasCalls[0][0].alias, "Project notes");
});

test("Dashboard uses agent card themes while keeping icons aligned in every card", async () => {
  const { root } = await loadDashboard([
    session("claude", { agentId: "claude-code", canFocus: true, iconUrl: "file:///claude.png" }),
    session("codex", { agentId: "codex", canFocus: false, iconUrl: "file:///codex.png" }),
  ]);
  const cards = byClass(root, "card");
  assert.ok(cards[0].classList.contains("card-agent-claude"));
  assert.ok(cards[1].classList.contains("card-agent-codex"));
  assert.strictEqual(byClass(cards[0], "agent-icon-frame").length, 1);
  assert.strictEqual(byClass(cards[1], "agent-icon-frame").length, 1);
  assert.strictEqual(byClass(root, "session-id-badge").length, 0);
});

test("Dashboard gives different unlisted agents stable distinct card accents", async () => {
  const { root } = await loadDashboard([
    session("nova-1", { agentId: "custom-nova" }),
    session("nova-2", { agentId: "custom-nova" }),
    session("orion", { agentId: "custom-orion" }),
  ]);
  const accents = byClass(root, "card").map((card) => card.style["--card-accent"]);
  assert.ok(accents[0]);
  assert.strictEqual(accents[0], accents[1]);
  assert.notStrictEqual(accents[0], accents[2]);
});

test("Dashboard shows user Codex conversations without background or superseded cards", async () => {
  const dashboard = await loadDashboard([
    session("root-a", { agentId: "codex", badge: "idle" }),
    session("root-b", { agentId: "codex", badge: "idle" }),
    session("background", { agentId: "codex", headless: true, badge: "running" }),
    session("superseded", { agentId: "codex", hiddenFromHud: true, badge: "running" }),
    session("claude-background", { agentId: "claude-code", headless: true, badge: "running" }),
    session("sleeping", { agentId: "codex", state: "sleeping", badge: "idle" }),
  ]);
  assert.strictEqual(byClass(dashboard.root, "card").length, 2);
  assert.strictEqual(dashboard.elements.get("petScene").className, "pet-scene");
});

test("Dashboard shows its empty state when only Codex background sessions remain", async () => {
  const { root } = await loadDashboard([session("background", { agentId: "codex", headless: true, badge: "running" })]);
  assert.strictEqual(byClass(root, "card").length, 0);
  assert.strictEqual(byClass(root, "empty").length, 1);
});

test("Dashboard keeps status, time, and path without internal source labels", async () => {
  const { root } = await loadDashboard([session("remote", {
    agentId: "claude-code", agentName: "Claude Code", badge: "done",
    sourceType: "ssh", sourceLabel: "server", startupRecovered: true,
  })]);
  const metaText = descendants(byClass(root, "meta")[0]).map((node) => node.textContent || "").join("");
  assert.match(metaText, /Done/);
  assert.match(metaText, /now/);
  assert.doesNotMatch(metaText, /Claude|server|Headless|Recovered/);
  assert.strictEqual(byClass(root, "path")[0].textContent, "/safe/project");
  assert.strictEqual(byClass(root, "source-badge").length, 0);
});

test("Dashboard returns only to an existing conversation target", async () => {
  const { root, focusCalls, openCalls } = await loadDashboard([
    session("focus", { canFocus: true, cwd: "/focus" }),
    session("folder", { cwd: "/folder" }),
    session("remote", { sourceType: "ssh", host: "host", cwd: "/remote" }),
  ]);
  const buttons = byClass(root, "open-session-button");
  assert.strictEqual(buttons.length, 3);
  assert.deepStrictEqual(buttons.map((button) => button.textContent), [
    "Jump to conversation", "Jump to conversation", "Jump to conversation",
  ]);
  assert.strictEqual(buttons[1].disabled, true);
  assert.strictEqual(buttons[2].disabled, true);
  await buttons[0].dispatch("click");
  await buttons[1].dispatch("click");
  assert.deepStrictEqual(focusCalls, [["focus"]]);
  assert.deepStrictEqual(openCalls, []);
  assert.strictEqual(byClass(root, "open-folder-button").length, 0);
});

test("Dashboard jump button shows pending and confirmed feedback", async () => {
  let resolveFocus;
  const focusResult = new Promise((resolve) => { resolveFocus = resolve; });
  const { root } = await loadDashboard([
    session("focus", { canFocus: true }),
  ], { status: "ok" }, focusResult);
  const button = byClass(root, "open-session-button")[0];
  const click = button.dispatch("click");
  assert.strictEqual(button.disabled, true);
  assert.strictEqual(button.textContent, "Jumping...");
  assert.strictEqual(button.classList.contains("is-pending"), true);
  resolveFocus({ status: "ok" });
  await click;
  assert.strictEqual(button.disabled, false);
  assert.strictEqual(button.textContent, "Jumped");
});

async function loadHud(sessions, openResult = { status: "ok" }) {
  const document = createDocument(["hud"]);
  const openCalls = [];
  let snapshotListener = null;
  let feedbackTimeout = null;
  const api = {
    onLangChange: () => {},
    onSessionSnapshot: (listener) => { snapshotListener = listener; },
    getI18n: async () => ({ lang: "en", translations: translations() }),
    openSessionFolder: async (...args) => {
      openCalls.push(args);
      return typeof openResult === "function" ? openResult(...args) : openResult;
    },
    focusSession: () => {},
    ackCompletion: async () => ({ status: "noop" }),
    openDashboard: () => {},
    setPinned: () => {},
  };
  const context = vm.createContext({
    window: { sessionHudAPI: api }, document, console, Date,
    setInterval: () => 0,
    setTimeout: (callback) => { feedbackTimeout = callback; return 1; },
    clearTimeout: () => { feedbackTimeout = null; },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "session-focus-unavailable.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "session-hud-renderer.js"), "utf8"), context);
  await flush();
  snapshotListener({ sessions, orderedIds: sessions.map((entry) => entry.id) });
  return {
    root: document.elements.get("hud"),
    openCalls,
    pushSnapshot: (nextSessions = sessions) => snapshotListener({
      sessions: nextSessions,
      orderedIds: nextSessions.map((entry) => entry.id),
    }),
    expireFeedback: async () => {
      const callback = feedbackTimeout;
      feedbackTimeout = null;
      if (callback) callback();
      await flush();
    },
  };
}

test("Dashboard disables return to conversation when no local focus target exists", async () => {
  const { root } = await loadDashboard([
    session("local"),
    session("remote", { sourceType: "ssh", host: "host" }),
    session("webui", { platform: "webui" }),
  ]);
  assert.strictEqual(byClass(root, "card-unfocusable").length, 3);
  const buttons = byClass(root, "open-session-button");
  assert.strictEqual(buttons.every((button) => button.disabled), true);
  assert.deepStrictEqual(new Set(buttons.map((button) => button.title)), new Set([
    "Cannot jump to this conversation",
  ]));
});

test("Dashboard hides raw event codes while preserving translated event labels", async () => {
  const { root } = await loadDashboard([
    session("raw", { lastEvent: { rawEvent: "event_msg:token_count", at: Date.now() } }),
    session("translated", { lastEvent: { labelKey: "dashboardPetWorking", rawEvent: "Stop", at: Date.now() } }),
  ]);
  const rows = byClass(root, "event-row");
  assert.strictEqual(rows.length, 1);
  assert.match(rows[0].textContent, /Working/);
});

test("Dashboard shows the reported Claude model beside status and hides a duplicate completion event", async () => {
  const { root } = await loadDashboard([
    session("done", {
      agentId: "claude-code", badge: "done", model: "claude-opus-4-6",
      lastEvent: { labelKey: "eventLabelStop", rawEvent: "Stop", at: Date.now() },
    }),
    session("working", {
      agentId: "claude-code", badge: "running", model: null,
      lastEvent: { labelKey: "dashboardPetWorking", rawEvent: "PreToolUse", at: Date.now() },
    }),
  ]);
  const cards = byClass(root, "card");
  assert.strictEqual(byClass(cards[0], "session-model").length, 1);
  assert.strictEqual(byClass(cards[0], "session-model")[0].textContent, "Claude Opus 4.6");
  assert.strictEqual(byClass(cards[0], "event-row").length, 0);
  assert.strictEqual(byClass(cards[1], "event-row").length, 1);
  assert.strictEqual(byClass(cards[1], "session-model").length, 0);
});

test("Dashboard shows a reported model for non-Claude agents too", async () => {
  const { root } = await loadDashboard([
    session("codex", { agentId: "codex", model: "gpt-5.4-codex" }),
    session("qwen", { agentId: "qwen-code", model: "qwen3-coder" }),
    session("auto", { agentId: "codex", model: "auto" }),
  ]);
  const labels = byClass(root, "session-model").map((element) => element.textContent);
  assert.deepStrictEqual(labels, ["gpt-5.4-codex", "qwen3-coder"]);
});

test("Dashboard preserves a readable custom agent fallback icon without repeating its name", async () => {
  const { root } = await loadDashboard([
    session("custom", {
      agentId: "custom-nova-0123456789ab",
      agentName: "Nova AI",
    }),
  ]);

  const meta = byClass(root, "meta")[0];
  const renderedText = meta.children.map((child) => child.textContent || "").join("");
  assert.strictEqual(byClass(root, "agent-fallback")[0].textContent, "NO");
  assert.doesNotMatch(renderedText, /Nova AI/);
  assert.doesNotMatch(renderedText, /custom-nova/);
});

test("Dashboard keeps a curated built-in fallback icon without repeating its name", async () => {
  const { root } = await loadDashboard([
    session("codex", { agentId: "codex", agentName: "Codex CLI" }),
  ]);

  const meta = byClass(root, "meta")[0];
  const renderedText = meta.children.map((child) => child.textContent || "").join("");
  assert.strictEqual(byClass(root, "agent-fallback")[0].textContent, "CO");
  assert.doesNotMatch(renderedText, /Codex/);
  assert.doesNotMatch(renderedText, /Codex CLI/);
});

test("HUD unfocusable click explains why and offers folder only for local non-webui", async () => {
  const { root } = await loadHud([
    session("local"),
    session("remote", { sourceType: "ssh", host: "host" }),
    session("webui", { platform: "webui" }),
  ]);
  const rows = byClass(root, "row-unfocusable");
  assert.deepStrictEqual(rows.map((row) => row.title), [
    "This session did not provide terminal window information.",
    "Remote sessions cannot focus a terminal on this computer.",
    "WebUI sessions do not have a local terminal window.",
  ]);
  await rows[0].dispatch("click");
  assert.strictEqual(
    byClass(root, "session-inline-feedback")[0].textContent,
    "This session did not provide terminal window information."
  );
  assert.strictEqual(byClass(root, "open-folder-button").length, 1);
});

test("HUD folder click sends only id and exposes open failure", async () => {
  const { root, openCalls } = await loadHud([session("local")], { status: "not-available" });
  await byClass(root, "open-folder-button")[0].dispatch("click");
  assert.deepStrictEqual(openCalls, [["local"]]);
  assert.strictEqual(byClass(root, "session-inline-feedback")[0].textContent, "This folder is no longer available.");
});

test("HUD preserves folder pending state across snapshot renders", async () => {
  let resolveOpen;
  const pendingResult = new Promise((resolve) => { resolveOpen = resolve; });
  const harness = await loadHud([session("local")], () => pendingResult);

  const clickPromise = byClass(harness.root, "open-folder-button")[0].dispatch("click");
  await flush();
  harness.pushSnapshot();

  const replacementButton = byClass(harness.root, "open-folder-button")[0];
  assert.strictEqual(replacementButton.disabled, true);
  await replacementButton.dispatch("click");
  assert.deepStrictEqual(harness.openCalls, [["local"]]);

  resolveOpen({ status: "ok" });
  await clickPromise;
  assert.strictEqual(byClass(harness.root, "open-folder-button")[0].disabled, false);
});

test("HUD feedback survives snapshot renders and clears on its timeout", async () => {
  const harness = await loadHud([session("local")]);
  await byClass(harness.root, "row-unfocusable")[0].dispatch("click");
  harness.pushSnapshot();
  assert.strictEqual(
    byClass(harness.root, "session-inline-feedback")[0].textContent,
    "This session did not provide terminal window information."
  );

  await harness.expireFeedback();
  assert.strictEqual(byClass(harness.root, "session-inline-feedback").length, 0);
  assert.strictEqual(byClass(harness.root, "title")[0].textContent, "local");
});

test("unfocusable and folder feedback copy exists in all supported languages", () => {
  const keys = [
    "dashboardOpenFolder",
    "sessionOpenFolderFailed",
    "sessionOpenFolderUnavailable",
    "sessionFocusUnavailableRemote",
    "sessionFocusUnavailableWebui",
    "sessionFocusUnavailableMissingTerminalInfo",
  ];
  for (const lang of SUPPORTED_LANGS) {
    for (const key of keys) assert.ok(i18n[lang][key], `${lang}.${key} is required`);
  }
});
