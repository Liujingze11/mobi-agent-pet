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

function fakeElectron(dialog = { showMessageBox: async () => ({ response: 1 }) }) {
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
    dialog,
  };
}

function buildBaseCtx(overrides = {}) {
  return {
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
    petHidden: false,
    getMiniMode: () => false,
    getMiniTransitioning: () => false,
    getDisableMiniMode: () => false,
    getActiveThemeCapabilities: () => ({ miniMode: true, petTint: true }),
    getAppMode: () => "normal",
    isAutomaticModeAuthorized: () => false,
    setAppMode: async () => ({ status: "ok" }),
    openDashboard: () => {},
    openSettingsWindow: () => {},
    togglePetVisibility: () => {},
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
}

function toTrayTemplate(snapshot) {
  return snapshot.items.map((item) => {
    if (item.kind === "separator") return { type: "separator" };
    return {
      label: item.label,
      type: item.kind,
      checked: item.checked,
      enabled: item.enabled,
      submenu: item.items ? toTrayTemplate({ items: item.items }) : undefined,
    };
  });
}

describe("context menu hide pet action (#460)", () => {
  it("exposes a Hide Pet item right before Quit that toggles visibility", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    let toggles = 0;
    const ctx = buildBaseCtx({
      togglePetVisibility: () => { toggles += 1; },
    });

    const menu = initMenu(ctx);
    menu.buildContextMenu();

    const labels = ctx.contextMenu.template.map((item) => item.label);
    const hideIdx = labels.indexOf("Hide Pet");
    const quitIdx = labels.indexOf("Quit");
    assert.ok(hideIdx !== -1, "context menu should expose Hide Pet");
    assert.strictEqual(quitIdx, labels.length - 1, "Quit should stay the last item");
    assert.strictEqual(hideIdx, quitIdx - 2, "Hide Pet should sit just above Quit");
    assert.strictEqual(ctx.contextMenu.template[hideIdx + 1].type, "separator");

    ctx.contextMenu.template[hideIdx].click();
    assert.strictEqual(toggles, 1);
  });

  it("labels the item Show Pet while the pet is hidden", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    const ctx = buildBaseCtx({ petHidden: true });

    const menu = initMenu(ctx);
    menu.buildContextMenu();

    const labels = ctx.contextMenu.template.map((item) => item.label);
    assert.ok(labels.includes("Show Pet"), "hidden pet should flip the label to Show Pet");
    assert.ok(!labels.includes("Hide Pet"));
  });

  it("popup close callback does not resurrect a pet the menu just hid", () => {
    let ownerWindow = null;
    const electron = fakeElectron();
    electron.BrowserWindow = function BrowserWindow() {
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
    };
    const keepCalls = [];
    const initMenu = loadMenuWithElectron(electron, {
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
        // Simulate the Hide Pet click landing before the close callback.
        ctx.petHidden = true;
        callback();
      },
    });

    assert.strictEqual(restoredPet, false, "hidden pet must stay hidden after the menu closes");
    assert.deepStrictEqual(keepCalls, [ownerWindow], "only the owner window should be re-asserted");
  });
});

describe("menu grouping invariants", () => {
  function assertNoStraySeparators(template, label) {
    assert.ok(template.length > 0, `${label}: template not empty`);
    assert.notStrictEqual(template[0].type, "separator", `${label}: no leading separator`);
    assert.notStrictEqual(template[template.length - 1].type, "separator", `${label}: no trailing separator`);
    for (let i = 1; i < template.length; i += 1) {
      if (template[i].type === "separator") {
        assert.notStrictEqual(template[i - 1].type, "separator", `${label}: no doubled separator at index ${i}`);
      }
    }
  }

  it("context menu groups have no leading, trailing, or doubled separators", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    const ctx = buildBaseCtx();
    const menu = initMenu(ctx);
    menu.buildContextMenu();
    assertNoStraySeparators(ctx.contextMenu.template, "context menu");
  });

  it("tray menu groups have no leading, trailing, or doubled separators", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    let trayTemplate = null;
    const ctx = buildBaseCtx({
      trayRuntime: {
        replaceMenu(snapshot) { trayTemplate = snapshot.items; },
      },
    });
    const menu = initMenu(ctx);
    menu.buildTrayMenu();
    assertNoStraySeparators(trayTemplate, "tray menu");
  });

  it("routes the tray Settings action for startup controls without exposing Electron menu-item state", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    let trayTemplate = null;
    let settingsOpens = 0;
    const ctx = buildBaseCtx({
      openSettingsWindow: () => { settingsOpens += 1; },
      trayRuntime: {
        replaceMenu(snapshot) {
          trayTemplate = snapshot.items.map((item) => ({
            ...item,
            click: item.id ? () => snapshot.commands.execute(item.id) : undefined,
          }));
        },
      },
    });

    initMenu(ctx).buildTrayMenu();
    const settings = trayTemplate.find((item) => item.id === "settings.open");
    assert.ok(settings);
    assert.ok(!trayTemplate.some((item) => item.label === "Start on Login"));
    settings.click();

    assert.strictEqual(settingsOpens, 1);
    assert.strictEqual(ctx.openAtLogin, false);
  });

  it("supplies current descriptor snapshots and attention to the tray runtime", async () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    const events = [];
    const ctx = buildBaseCtx({
      trayRuntime: {
        start: async (snapshot) => events.push(["start", snapshot]),
        replaceMenu: async (snapshot) => events.push(["replace", snapshot]),
        setAttention: async (active) => events.push(["attention", active]),
        getNativeTray: () => null,
      },
    });
    const menu = initMenu(ctx);

    await menu.createTray();
    ctx.petHidden = true;
    await menu.buildTrayMenu();
    await menu.setTrayAttention(true);

    assert.deepStrictEqual(events.map(([event]) => event), ["start", "replace", "attention"]);
    assert.ok(events[0][1].items.some((item) => item.id === "settings.open"));
    assert.ok(events[1][1].items.some((item) => item.id === "settings.open"));
    assert.ok(!events[0][1].items.some((item) => item.label === "Hide Pet"));
    assert.ok(!events[1][1].items.some((item) => item.label === "Show Pet"));
    assert.deepStrictEqual(events[2], ["attention", true]);
  });

  it("reports a rejected tray rebuild instead of leaving an unhandled rejection", async (t) => {
    const warnings = [];
    const unhandled = [];
    t.mock.method(console, "warn", (...args) => warnings.push(args));
    const onUnhandled = (reason) => unhandled.push(reason);
    process.once("unhandledRejection", onUnhandled);
    t.after(() => process.removeListener("unhandledRejection", onUnhandled));
    const initMenu = loadMenuWithElectron(fakeElectron());
    const menu = initMenu(buildBaseCtx({
      trayRuntime: {
        replaceMenu: () => Promise.reject(new Error("menu unavailable")),
      },
    }));

    menu.rebuildAllMenus();
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepStrictEqual(warnings, [["Clawd: tray menu rebuild failed:", "menu unavailable"]]);
    assert.deepStrictEqual(unhandled, []);
  });
});

describe("mode menu module", () => {
  function getModeItem(template) {
    const mode = template.find((item) => item.label === "模式");
    assert.ok(mode, "menu should expose one mode module");
    return mode;
  }

  function getModeEntry(mode, label) {
    const entry = mode.submenu.find((item) => item.label === label);
    assert.ok(entry, `mode menu should expose ${label}`);
    return entry;
  }

  it("renders the same Chinese mode entries in pet and tray menus from runtime mode state", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    let trayTemplate = null;
    const ctx = buildBaseCtx({
      lang: "zh",
      doNotDisturb: true,
      getMiniMode: () => true,
      getAppMode: () => "automatic",
      trayRuntime: { replaceMenu(snapshot) { trayTemplate = toTrayTemplate(snapshot); } },
    });
    const menu = initMenu(ctx);

    menu.buildTrayMenu();
    menu.buildContextMenu();

    for (const template of [trayTemplate, ctx.contextMenu.template]) {
      const mode = getModeItem(template);
      assert.deepStrictEqual(
        mode.submenu.filter((item) => item.type !== "separator").map((item) => item.label),
        ["常规模式", "后台模式", "自动模式", "自定义模式", "编辑自定义模式…"]
      );
      assert.strictEqual(mode.submenu[0].type, "radio");
      assert.strictEqual(mode.submenu[2].checked, true, "DND and mini state must not choose the mode");
      assert.strictEqual(mode.submenu[3].enabled, false);
      assert.strictEqual(mode.submenu[5].enabled, false);
      assert.ok(!template.some((item) => item.label === "休眠（免打扰）"));
      assert.ok(!template.some((item) => item.label === "极简模式"));
    }
  });

  it("requests the first Automatic transition, confirms it, then retries with confirmation", async () => {
    const dialogs = [];
    const initMenu = loadMenuWithElectron(fakeElectron({
      showMessageBox: async (options) => {
        dialogs.push(options);
        return { response: 0 };
      },
    }));
    const calls = [];
    let activeMode = "normal";
    const ctx = buildBaseCtx({
      lang: "zh",
      getAppMode: () => activeMode,
      setAppMode: async (mode, options) => {
        calls.push([mode, options]);
        if (options && options.confirmed) activeMode = mode;
        return options && options.confirmed
          ? { status: "ok" }
          : { status: "confirmation-required" };
      },
    });
    const menu = initMenu(ctx);
    menu.buildContextMenu();
    const automatic = getModeEntry(getModeItem(ctx.contextMenu.template), "自动模式");

    await automatic.click();

    assert.deepStrictEqual(calls, [
      ["automatic", undefined],
      ["automatic", { confirmed: true }],
    ]);
    assert.strictEqual(dialogs.length, 1);
    assert.deepStrictEqual(dialogs[0].buttons, ["启用自动模式", "取消"]);
    assert.strictEqual(dialogs[0].defaultId, 1);
    assert.strictEqual(dialogs[0].cancelId, 1);
    assert.strictEqual(activeMode, "automatic");
  });

  it("deduplicates concurrent Automatic clicks until the shared confirmation flow settles", async () => {
    let resolveConfirmation;
    const dialogs = [];
    const initMenu = loadMenuWithElectron(fakeElectron({
      showMessageBox: (options) => {
        dialogs.push(options);
        return new Promise((resolve) => { resolveConfirmation = resolve; });
      },
    }));
    const calls = [];
    let activeMode = "normal";
    let authorized = false;
    const ctx = buildBaseCtx({
      lang: "zh",
      getAppMode: () => activeMode,
      setAppMode: async (mode, options) => {
        calls.push([mode, options]);
        if (mode === "automatic" && !authorized && !(options && options.confirmed)) {
          return { status: "confirmation-required" };
        }
        if (mode === "automatic" && options && options.confirmed) authorized = true;
        activeMode = mode;
        return { status: "ok", mode };
      },
    });
    const menu = initMenu(ctx);
    menu.buildContextMenu();
    const automatic = getModeEntry(getModeItem(ctx.contextMenu.template), "自动模式");

    const firstClick = automatic.click();
    const secondClick = automatic.click();
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepStrictEqual(calls, [["automatic", undefined]]);
    assert.strictEqual(dialogs.length, 1);

    resolveConfirmation({ response: 0 });
    const [firstResult, secondResult] = await Promise.all([firstClick, secondClick]);

    assert.deepStrictEqual(firstResult, { status: "ok", mode: "automatic" });
    assert.deepStrictEqual(secondResult, firstResult);
    assert.deepStrictEqual(calls, [
      ["automatic", undefined],
      ["automatic", { confirmed: true }],
    ]);
    assert.strictEqual(dialogs.length, 1);

    menu.buildContextMenu();
    const normalResult = await getModeEntry(getModeItem(ctx.contextMenu.template), "常规模式").click();
    menu.buildContextMenu();
    const laterAutomaticResult = await getModeEntry(getModeItem(ctx.contextMenu.template), "自动模式").click();

    assert.deepStrictEqual(normalResult, { status: "ok", mode: "normal" });
    assert.deepStrictEqual(laterAutomaticResult, { status: "ok", mode: "automatic" });
    assert.deepStrictEqual(calls, [
      ["automatic", undefined],
      ["automatic", { confirmed: true }],
      ["normal", undefined],
      ["automatic", undefined],
    ]);
    assert.strictEqual(dialogs.length, 1, "authorized re-entry should not show another warning");
    assert.strictEqual(activeMode, "automatic");
  });

  it("keeps the previous checked mode when Automatic confirmation is cancelled", async () => {
    const initMenu = loadMenuWithElectron(fakeElectron({
      showMessageBox: async () => ({ response: 1 }),
    }));
    const calls = [];
    const ctx = buildBaseCtx({
      lang: "zh",
      getAppMode: () => "normal",
      setAppMode: async (mode, options) => {
        calls.push([mode, options]);
        return { status: "confirmation-required" };
      },
    });
    const menu = initMenu(ctx);
    menu.buildContextMenu();

    await getModeEntry(getModeItem(ctx.contextMenu.template), "自动模式").click();

    assert.deepStrictEqual(calls, [["automatic", undefined]]);
    assert.strictEqual(getModeItem(ctx.contextMenu.template).submenu[0].checked, true);
  });

  it("does not ask again when re-entering authorized Automatic mode in the same run", async () => {
    let dialogCount = 0;
    let activeMode = "normal";
    let authorized = false;
    const initMenu = loadMenuWithElectron(fakeElectron({
      showMessageBox: async () => {
        dialogCount += 1;
        return { response: 0 };
      },
    }));
    const ctx = buildBaseCtx({
      lang: "zh",
      getAppMode: () => activeMode,
      isAutomaticModeAuthorized: () => authorized,
      setAppMode: async (mode, options) => {
        if (mode === "automatic" && !authorized && !(options && options.confirmed)) {
          return { status: "confirmation-required" };
        }
        if (mode === "automatic" && options && options.confirmed) authorized = true;
        activeMode = mode;
        return { status: "ok" };
      },
    });
    const menu = initMenu(ctx);

    menu.buildContextMenu();
    await getModeEntry(getModeItem(ctx.contextMenu.template), "自动模式").click();
    menu.buildContextMenu();
    await getModeEntry(getModeItem(ctx.contextMenu.template), "常规模式").click();
    menu.buildContextMenu();
    await getModeEntry(getModeItem(ctx.contextMenu.template), "自动模式").click();

    assert.strictEqual(dialogCount, 1);
    assert.strictEqual(activeMode, "automatic");
  });

  it("rebuilds the menu and reports a localized error when a transition fails", async (t) => {
    const dialogs = [];
    const warnings = [];
    t.mock.method(console, "warn", (...args) => warnings.push(args));
    const initMenu = loadMenuWithElectron(fakeElectron({
      showMessageBox: async (options) => {
        dialogs.push(options);
        return { response: 0 };
      },
    }));
    const ctx = buildBaseCtx({
      lang: "zh",
      getAppMode: () => "normal",
      setAppMode: async () => ({ status: "error", message: "transition failed" }),
    });
    const menu = initMenu(ctx);
    menu.buildContextMenu();

    await getModeEntry(getModeItem(ctx.contextMenu.template), "后台模式").click();

    assert.strictEqual(dialogs.length, 1);
    assert.strictEqual(dialogs[0].type, "error");
    assert.strictEqual(dialogs[0].title, "模式切换失败");
    assert.strictEqual(dialogs[0].detail, "莫比 Pet 无法切换模式：transition failed");
    assert.strictEqual(getModeItem(ctx.contextMenu.template).submenu[0].checked, true);
    assert.deepStrictEqual(warnings, [["Clawd: app mode change failed:", "transition failed"]]);
  });
});

describe("pet color menu placement", () => {
  it("keeps pet colors out of both tray and context quick menus", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    let trayTemplate = null;
    const ctx = buildBaseCtx({
      trayRuntime: { replaceMenu(snapshot) { trayTemplate = toTrayTemplate(snapshot); } },
    });
    const menu = initMenu(ctx);

    menu.buildTrayMenu();
    menu.buildContextMenu();
    assert.ok(!trayTemplate.some((item) => item.label === "Pet Color"));
    assert.ok(!ctx.contextMenu.template.some((item) => item.label === "Pet Color"));
  });
});

describe("persistent noise settings placement", () => {
  it("keeps bubble and sound controls out of the tray quick menu", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    let trayTemplate = null;
    const ctx = buildBaseCtx({
      trayRuntime: { replaceMenu(snapshot) { trayTemplate = toTrayTemplate(snapshot); } },
    });
    const menu = initMenu(ctx);

    menu.buildTrayMenu();

    const labels = trayTemplate.map((item) => item.label);
    assert.ok(!labels.includes("Hide Bubbles"));
    assert.ok(!labels.includes("Sound Effects"));
  });
});

describe("permission settings placement", () => {
  it("keeps permission handling out of both tray and context quick menus", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    let trayTemplate = null;
    const ctx = buildBaseCtx({
      trayRuntime: { replaceMenu(snapshot) { trayTemplate = toTrayTemplate(snapshot); } },
    });
    const menu = initMenu(ctx);

    menu.buildTrayMenu();
    menu.buildContextMenu();

    assert.ok(!trayTemplate.some((item) => item.label && item.label.startsWith("Permission handling:")));
    assert.ok(!ctx.contextMenu.template.some((item) => item.label && item.label.startsWith("Permission handling:")));
  });
});

describe("macOS visibility toggles live in the tray, not the right-click menu", () => {
  it("drops Show in Dock / Show in Menu Bar from the context menu but keeps them in the tray", (t) => {
    if (process.platform !== "darwin") {
      t.skip("Dock / Menu Bar toggles are macOS-only");
      return;
    }
    const initMenu = loadMenuWithElectron(fakeElectron());
    let trayTemplate = null;
    const ctx = buildBaseCtx({
      trayRuntime: { replaceMenu(snapshot) { trayTemplate = toTrayTemplate(snapshot); } },
    });
    const menu = initMenu(ctx);
    menu.buildContextMenu();
    menu.buildTrayMenu();
    const ctxLabels = ctx.contextMenu.template.map((item) => item.label);
    const trayLabels = trayTemplate.map((item) => item.label);
    assert.ok(!ctxLabels.includes("Show in Dock"), "context menu drops Show in Dock");
    assert.ok(!ctxLabels.includes("Show in Menu Bar"), "context menu drops Show in Menu Bar");
    assert.ok(trayLabels.includes("Show in Dock"), "tray keeps Show in Dock");
    assert.ok(trayLabels.includes("Show in Menu Bar"), "tray keeps Show in Menu Bar");
  });
});
