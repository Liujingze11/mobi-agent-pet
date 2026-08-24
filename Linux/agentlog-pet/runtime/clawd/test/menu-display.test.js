const assert = require("node:assert");
const Module = require("node:module");
const { describe, it } = require("node:test");

const MENU_MODULE_PATH = require.resolve("../src/menu");

function loadMenuWithElectron(fakeElectron, fakeTaskbar = null) {
  delete require.cache[MENU_MODULE_PATH];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") return fakeElectron;
    if (fakeTaskbar && request === "./taskbar") return fakeTaskbar;
    return originalLoad.apply(this, arguments);
  };
  try {
    return require("../src/menu");
  } finally {
    Module._load = originalLoad;
  }
}

function buildBaseCtx(overrides = {}) {
  const ctx = {
    win: { isDestroyed: () => false },
    sessions: new Map(),
    currentSize: "P:15",
    doNotDisturb: false,
    lang: "en",
    showTray: true,
    showDock: true,
    openAtLogin: false,
    bubbleFollowPet: false,
    hideBubbles: false,
    soundMuted: false,
    menuOpen: false,
    tray: null,
    contextMenuOwner: null,
    contextMenu: null,
    isQuitting: false,
    getMiniMode: () => false,
    getMiniTransitioning: () => false,
    getDisableMiniMode: () => false,
    getActiveThemeCapabilities: () => ({ miniMode: true }),
    getAppMode: () => "normal",
    isAutomaticModeAuthorized: () => false,
    setAppMode: async () => ({ status: "ok" }),
    openDashboard: () => {},
    openAgentLogManager: () => {},
    openSettingsTab: () => {},
    openSettingsWindow: () => {},
    togglePetVisibility: () => {},
    bringPetToPrimaryDisplay: () => {},
    enableDoNotDisturb: () => {},
    disableDoNotDisturb: () => {},
    enterMiniViaMenu: () => {},
    exitMiniMode: () => {},
    miniHandleResize: () => false,
    getPetWindowBounds: () => ({ x: 10, y: 20, width: 120, height: 120 }),
    applyPetWindowBounds: () => {},
    getCurrentPixelSize: () => ({ width: 200, height: 200 }),
    isProportionalMode: () => true,
    repositionBubbles: () => {},
    syncHitWin: () => {},
    flushRuntimeStateToPrefs: () => {},
    reapplyMacVisibility: () => {},
    clampToScreenVisual: (x, y) => ({ x, y }),
    ...overrides,
  };
  return ctx;
}

describe("menu send-to-display", () => {
  it("routes the tray Background entry through the runtime app mode API", async () => {
    const fakeElectron = {
      app: { quit: () => {}, setActivationPolicy: () => {}, dock: { show: () => {}, hide: () => {} } },
      BrowserWindow: function BrowserWindow() {},
      Menu: {
        buildFromTemplate(template) {
          return { template };
        },
      },
      Tray: function Tray() {},
      nativeImage: {
        createFromPath() {
          return {
            resize() { return this; },
            setTemplateImage() {},
          };
        },
      },
      screen: {
        getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => ({ id: 1 }),
      },
    };
    const initMenu = loadMenuWithElectron(fakeElectron);
    const calls = [];

    const ctx = buildBaseCtx({
      tray: { setContextMenu(menuObj) { this.contextMenu = menuObj; } },
      setAppMode: async (mode, options) => { calls.push([mode, options]); },
    });
    const menu = initMenu(ctx);

    menu.buildTrayMenu();
    const modeItem = ctx.tray.contextMenu.template[0];
    assert.strictEqual(modeItem.label, "Mode");
    const backgroundItem = modeItem.submenu.find((item) => item.label === "Background Mode");
    await backgroundItem.click();
    assert.deepStrictEqual(calls, [["background", undefined]]);
  });

  it("uses shared proportional sizing and repositions floating bubbles even when follow is off", () => {
    const displays = [
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      },
      {
        id: 2,
        bounds: { x: 1920, y: 0, width: 834, height: 1194 },
        workArea: { x: 1920, y: 0, width: 834, height: 1154 },
      },
    ];
    const fakeElectron = {
      app: { quit: () => {}, setActivationPolicy: () => {}, dock: { show: () => {}, hide: () => {} } },
      BrowserWindow: function BrowserWindow() {},
      Menu: {
        buildFromTemplate(template) {
          return { template };
        },
      },
      Tray: function Tray() {},
      nativeImage: {
        createFromPath() {
          return {
            resize() { return this; },
            setTemplateImage() {},
          };
        },
      },
      screen: {
        getAllDisplays: () => displays,
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => displays[0],
      },
    };
    const initMenu = loadMenuWithElectron(fakeElectron);

    let sizeWorkArea = null;
    let appliedBounds = null;
    let repositionCalls = 0;
    let flushCalls = 0;
    const ctx = buildBaseCtx({
      getCurrentPixelSize: (workArea) => {
        sizeWorkArea = workArea;
        return { width: 286, height: 286 };
      },
      applyPetWindowBounds: (bounds) => { appliedBounds = bounds; },
      repositionBubbles: () => { repositionCalls += 1; },
      flushRuntimeStateToPrefs: () => { flushCalls += 1; },
    });

    const menu = initMenu(ctx);
    menu.buildContextMenu();

    const sendToDisplay = ctx.contextMenu.template.find((item) => item.label === "Send to Display");
    assert.ok(sendToDisplay, "context menu should expose send-to-display");
    assert.strictEqual(sendToDisplay.submenu.length, 2);

    sendToDisplay.submenu[1].click();

    assert.deepStrictEqual(sizeWorkArea, displays[1].workArea);
    assert.deepStrictEqual(appliedBounds, {
      x: 2194,
      y: 434,
      width: 286,
      height: 286,
    });
    assert.strictEqual(repositionCalls, 1);
    assert.strictEqual(flushCalls, 1);
  });

  it("keeps the current pixel size when keep-size-across-displays is active", () => {
    const displays = [
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      },
      {
        id: 2,
        bounds: { x: 1920, y: 0, width: 834, height: 1194 },
        workArea: { x: 1920, y: 0, width: 834, height: 1154 },
      },
    ];
    const fakeElectron = {
      app: { quit: () => {}, setActivationPolicy: () => {}, dock: { show: () => {}, hide: () => {} } },
      BrowserWindow: function BrowserWindow() {},
      Menu: {
        buildFromTemplate(template) {
          return { template };
        },
      },
      Tray: function Tray() {},
      nativeImage: {
        createFromPath() {
          return {
            resize() { return this; },
            setTemplateImage() {},
          };
        },
      },
      screen: {
        getAllDisplays: () => displays,
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => displays[0],
      },
    };
    const initMenu = loadMenuWithElectron(fakeElectron);

    let getCurrentPixelSizeCalls = 0;
    let appliedBounds = null;
    const ctx = buildBaseCtx({
      getCurrentPixelSize: () => {
        getCurrentPixelSizeCalls += 1;
        return { width: 286, height: 286 };
      },
      getEffectiveCurrentPixelSize: () => ({ width: 120, height: 120 }),
      applyPetWindowBounds: (bounds) => { appliedBounds = bounds; },
    });

    const menu = initMenu(ctx);
    menu.buildContextMenu();

    const sendToDisplay = ctx.contextMenu.template.find((item) => item.label === "Send to Display");
    sendToDisplay.submenu[1].click();

    assert.strictEqual(getCurrentPixelSizeCalls, 0);
    assert.deepStrictEqual(appliedBounds, {
      x: 2277,
      y: 517,
      width: 120,
      height: 120,
    });
  });
});

describe("menu recovery action", () => {
  it("adds a tray item that brings the pet back to the primary display", () => {
    const fakeElectron = {
      app: { quit: () => {}, setActivationPolicy: () => {}, dock: { show: () => {}, hide: () => {} } },
      BrowserWindow: function BrowserWindow() {},
      Menu: {
        buildFromTemplate(template) {
          return { template };
        },
      },
      Tray: function Tray() {
        this.setToolTip = () => {};
        this.setContextMenu = (menu) => { this.contextMenu = menu; };
        this.destroy = () => {};
      },
      nativeImage: {
        createFromPath() {
          return {
            resize() { return this; },
            setTemplateImage() {},
          };
        },
      },
      screen: {
        getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => ({ id: 1 }),
      },
    };
    const initMenu = loadMenuWithElectron(fakeElectron);

    let called = 0;
    const ctx = buildBaseCtx({
      bringPetToPrimaryDisplay: () => { called += 1; },
    });

    const menu = initMenu(ctx);
    menu.createTray();

    const recover = ctx.tray.contextMenu.template.find((item) => item.label === "Bring Pet to Primary Display");
    assert.ok(recover, "tray menu should expose the recovery action");

    recover.click();

    assert.strictEqual(called, 1);
  });

  it("disables the recovery action while mini mode is active", () => {
    const fakeElectron = {
      app: { quit: () => {}, setActivationPolicy: () => {}, dock: { show: () => {}, hide: () => {} } },
      BrowserWindow: function BrowserWindow() {},
      Menu: {
        buildFromTemplate(template) {
          return { template };
        },
      },
      Tray: function Tray() {
        this.setToolTip = () => {};
        this.setContextMenu = (menu) => { this.contextMenu = menu; };
        this.destroy = () => {};
      },
      nativeImage: {
        createFromPath() {
          return {
            resize() { return this; },
            setTemplateImage() {},
          };
        },
      },
      screen: {
        getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => ({ id: 1 }),
      },
    };
    const initMenu = loadMenuWithElectron(fakeElectron);

    const ctx = buildBaseCtx({
      getMiniMode: () => true,
    });

    const menu = initMenu(ctx);
    menu.createTray();

    const recover = ctx.tray.contextMenu.template.find((item) => item.label === "Bring Pet to Primary Display");
    assert.ok(recover, "tray menu should expose the recovery action");
    assert.strictEqual(recover.enabled, false);
  });
});

describe("Agent integrations menu entry", () => {
  it("opens AgentLog from both menus above the settings actions", () => {
    const fakeElectron = {
      app: { quit: () => {}, setActivationPolicy: () => {}, dock: { show: () => {}, hide: () => {} } },
      BrowserWindow: function BrowserWindow() {},
      Menu: {
        buildFromTemplate(template) {
          return { template };
        },
      },
      Tray: function Tray() {
        this.setToolTip = () => {};
        this.setContextMenu = (menu) => { this.contextMenu = menu; };
        this.destroy = () => {};
      },
      nativeImage: {
        createFromPath() {
          return { resize() { return this; }, setTemplateImage() {} };
        },
      },
      screen: {
        getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => ({ id: 1 }),
      },
    };
    const initMenu = loadMenuWithElectron(fakeElectron);
    let managerCalls = 0;
    const openedTabs = [];
    const ctx = buildBaseCtx({
      openAgentLogManager: () => { managerCalls += 1; },
      openSettingsTab: (tab) => openedTabs.push(tab),
    });
    const menu = initMenu(ctx);

    menu.buildContextMenu();
    menu.createTray();

    for (const template of [ctx.contextMenu.template, ctx.tray.contextMenu.template]) {
      const managerIndex = template.findIndex((item) => item.label === "Open AgentLog");
      const dashboardIndex = template.findIndex((item) => item.label === "Open Dashboard");
      const settingsIndex = template.findIndex((item) => item.label === "Settings…");
      const agentsIndex = template.findIndex((item) => item.label === "Agent Integrations");
      assert.ok(managerIndex >= 0, "menu should include Open AgentLog");
      assert.ok(managerIndex < dashboardIndex, "Open AgentLog should precede Open Dashboard");
      assert.ok(managerIndex < settingsIndex, "Open AgentLog should precede Settings");
      assert.ok(managerIndex < agentsIndex, "Open AgentLog should precede Agent Integrations");
      template[managerIndex].click();
      template[agentsIndex].click();
    }

    assert.equal(managerCalls, 2);
    assert.deepEqual(openedTabs, ["agents", "agents"]);
  });

  it("opens the Agents manager from both context and tray menus", () => {
    const fakeElectron = {
      app: { quit: () => {}, setActivationPolicy: () => {}, dock: { show: () => {}, hide: () => {} } },
      BrowserWindow: function BrowserWindow() {},
      Menu: {
        buildFromTemplate(template) {
          return { template };
        },
      },
      Tray: function Tray() {
        this.setToolTip = () => {};
        this.setContextMenu = (menu) => { this.contextMenu = menu; };
        this.destroy = () => {};
      },
      nativeImage: {
        createFromPath() {
          return {
            resize() { return this; },
            setTemplateImage() {},
          };
        },
      },
      dialog: { showMessageBox: async () => ({ response: 1 }) },
      screen: {
        getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => ({ id: 1 }),
      },
    };
    const initMenu = loadMenuWithElectron(fakeElectron);
    const openedTabs = [];
    const ctx = buildBaseCtx({
      openSettingsTab: (tab) => openedTabs.push(tab),
    });
    const menu = initMenu(ctx);

    menu.buildContextMenu();
    const contextItem = ctx.contextMenu.template.find((item) => item.label === "Agent Integrations");
    assert.ok(contextItem, "context menu should expose Agent Integrations");
    contextItem.click();

    menu.createTray();
    const trayItem = ctx.tray.contextMenu.template.find((item) => item.label === "Agent Integrations");
    assert.ok(trayItem, "tray menu should expose Agent Integrations");
    trayItem.click();

    assert.deepStrictEqual(openedTabs, ["agents", "agents"]);
  });
});

describe("menu taskbar recovery", () => {
  it("reasserts taskbar-hidden state for the context-menu owner and restored pet window", () => {
    let ownerWindow = null;
    const fakeElectron = {
      app: { quit: () => {}, setActivationPolicy: () => {}, dock: { show: () => {}, hide: () => {} } },
      BrowserWindow: function BrowserWindow() {
        ownerWindow = {
          isDestroyed: () => false,
          loadURL: () => {},
          on: () => {},
          setBounds: () => {},
          show: () => {},
          focus: () => {},
          hide: () => {},
        };
        return ownerWindow;
      },
      Menu: {
        buildFromTemplate(template) {
          return { template };
        },
      },
      Tray: function Tray() {},
      nativeImage: {
        createFromPath() {
          return {
            resize() { return this; },
            setTemplateImage() {},
          };
        },
      },
      screen: {
        getAllDisplays: () => [],
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 720 } }),
      },
    };
    const keepCalls = [];
    const initMenu = loadMenuWithElectron(fakeElectron, {
      keepOutOfTaskbar: (win) => keepCalls.push(win),
    });

    let restoredPet = false;
    const ctx = buildBaseCtx({
      win: {
        isDestroyed: () => false,
        showInactive: () => { restoredPet = true; },
        setAlwaysOnTop: () => {},
      },
    });

    initMenu(ctx).popupMenuAt({
      popup({ callback }) {
        callback();
      },
    });

    assert.strictEqual(restoredPet, true);
    assert.deepStrictEqual(keepCalls, [ownerWindow, ctx.win]);
  });
});

describe("menu dashboard action", () => {
  it("adds a context menu item that opens the Dashboard", () => {
    const fakeElectron = {
      app: { quit: () => {}, setActivationPolicy: () => {}, dock: { show: () => {}, hide: () => {} } },
      BrowserWindow: function BrowserWindow() {},
      Menu: {
        buildFromTemplate(template) {
          return { template };
        },
      },
      Tray: function Tray() {},
      nativeImage: {
        createFromPath() {
          return {
            resize() { return this; },
            setTemplateImage() {},
          };
        },
      },
      screen: {
        getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => ({ id: 1 }),
      },
    };
    const initMenu = loadMenuWithElectron(fakeElectron);

    let called = 0;
    const ctx = buildBaseCtx({
      openDashboard: () => { called += 1; },
    });

    const menu = initMenu(ctx);
    menu.buildContextMenu();

    const openDashboard = ctx.contextMenu.template.find((item) => item.label === "Open Dashboard");
    assert.ok(openDashboard, "context menu should expose dashboard entry");
    openDashboard.click();
    assert.strictEqual(called, 1);
  });

  it("adds a tray menu item that opens the Dashboard", () => {
    const fakeElectron = {
      app: { quit: () => {}, setActivationPolicy: () => {}, dock: { show: () => {}, hide: () => {} } },
      BrowserWindow: function BrowserWindow() {},
      Menu: {
        buildFromTemplate(template) {
          return { template };
        },
      },
      Tray: function Tray() {
        this.setToolTip = () => {};
        this.setContextMenu = (menu) => { this.contextMenu = menu; };
        this.destroy = () => {};
      },
      nativeImage: {
        createFromPath() {
          return {
            resize() { return this; },
            setTemplateImage() {},
          };
        },
      },
      screen: {
        getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => ({ id: 1 }),
      },
    };
    const initMenu = loadMenuWithElectron(fakeElectron);

    let called = 0;
    const ctx = buildBaseCtx({
      openDashboard: () => { called += 1; },
    });

    const menu = initMenu(ctx);
    menu.createTray();

    const openDashboard = ctx.tray.contextMenu.template.find((item) => item.label === "Open Dashboard");
    assert.ok(openDashboard, "tray menu should expose dashboard entry");
    openDashboard.click();
    assert.strictEqual(called, 1);
  });
});

describe("menu new session action", () => {
  function fakeElectron() {
    return {
      app: { quit: () => {}, setActivationPolicy: () => {}, dock: { show: () => {}, hide: () => {} } },
      BrowserWindow: function BrowserWindow() {},
      Menu: {
        buildFromTemplate(template) {
          return { template };
        },
      },
      Tray: function Tray() {},
      nativeImage: {
        createFromPath() {
          return {
            resize() { return this; },
            setTemplateImage() {},
          };
        },
      },
      screen: {
        getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
        getCursorScreenPoint: () => ({ x: 0, y: 0 }),
        getDisplayNearestPoint: () => ({ id: 1 }),
      },
    };
  }

  function findNewSession(ctx) {
    return ctx.contextMenu.template.find((item) => item.label === "New Claude Session");
  }

  it("exposes a New Session submenu with the two folder entries", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    const ctx = buildBaseCtx({
      newSessionWithFolder: () => {},
      newSessionInCurrentDir: () => {},
    });
    const menu = initMenu(ctx);
    menu.buildContextMenu();

    const newSession = findNewSession(ctx);
    assert.ok(newSession, "context menu should expose New Session");
    assert.ok(Array.isArray(newSession.submenu), "New Session should be a submenu");
    assert.deepStrictEqual(
      newSession.submenu.map((item) => item.label),
      ["Select Folder...", "Home Directory"],
    );
  });

  it("Select Folder entry invokes ctx.newSessionWithFolder(t)", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    let calledWith = null;
    const ctx = buildBaseCtx({
      newSessionWithFolder: (t) => { calledWith = t; },
      newSessionInCurrentDir: () => { throw new Error("wrong handler"); },
    });
    const menu = initMenu(ctx);
    menu.buildContextMenu();

    const newSession = findNewSession(ctx);
    const selectFolder = newSession.submenu.find((item) => item.label === "Select Folder...");
    selectFolder.click();
    assert.strictEqual(typeof calledWith, "function", "handler should receive the translator t");
    assert.strictEqual(calledWith("newSession"), "New Claude Session");
  });

  it("Home Directory entry invokes ctx.newSessionInCurrentDir(t)", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    let calledWith = null;
    const ctx = buildBaseCtx({
      newSessionWithFolder: () => { throw new Error("wrong handler"); },
      newSessionInCurrentDir: (t) => { calledWith = t; },
    });
    const menu = initMenu(ctx);
    menu.buildContextMenu();

    const newSession = findNewSession(ctx);
    const homeDir = newSession.submenu.find((item) => item.label === "Home Directory");
    homeDir.click();
    assert.strictEqual(typeof calledWith, "function", "handler should receive the translator t");
    assert.strictEqual(calledWith("newSession"), "New Claude Session");
  });
});
