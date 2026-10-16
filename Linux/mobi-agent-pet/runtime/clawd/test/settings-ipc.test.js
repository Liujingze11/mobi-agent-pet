"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { registerSettingsIpc } = require("../src/settings-ipc");
const {
  listPetTintOptions,
  listPetAccessoryOptions,
} = require("../src/pet-customization-catalog");

class FakeIpcMain {
  constructor() {
    this.handlers = new Map();
    this.listeners = new Map();
  }

  handle(channel, listener) {
    this.handlers.set(channel, listener);
  }

  on(channel, listener) {
    this.listeners.set(channel, listener);
  }

  removeHandler(channel) {
    this.handlers.delete(channel);
  }

  removeListener(channel, listener) {
    if (this.listeners.get(channel) === listener) this.listeners.delete(channel);
  }

  invoke(channel, ...args) {
    const listener = this.handlers.get(channel);
    assert.strictEqual(typeof listener, "function", `missing IPC handler ${channel}`);
    return listener({ sender: "sender-web-contents" }, ...args);
  }

  send(channel, ...args) {
    const listener = this.listeners.get(channel);
    assert.strictEqual(typeof listener, "function", `missing IPC listener ${channel}`);
    return listener({ sender: "sender-web-contents" }, ...args);
  }
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "clawd-settings-ipc-"));
}


function createHarness(overrides = {}) {
  const calls = [];
  const ipcMain = new FakeIpcMain();
  const activeTheme = Object.prototype.hasOwnProperty.call(overrides, "activeTheme") ? overrides.activeTheme : {
    _id: "clawd",
    sounds: { complete: "complete.mp3" },
  };
  const settingsController = overrides.settingsController || {
    getSnapshot: () => ({ lang: "en" }),
    applyUpdate: (key, value) => {
      calls.push(["applyUpdate", key, value]);
      return { status: "ok", key, value };
    },
    applyCommand: async (action, payload) => {
      calls.push(["applyCommand", action, payload]);
      return { status: "ok" };
    },
  };
  const themeLoader = overrides.themeLoader || {
    getPreviewSoundUrl: () => "file:///preview.mp3",
    getSoundOverridesDir: () => null,
    getSoundUrl: () => null,
    listThemesWithMetadata: () => [],
    getThemeMetadata: (themeId) => ({ name: themeId }),
    ensureUserThemesDir: () => path.join(os.tmpdir(), "clawd-user-themes"),
  };
  const dialog = overrides.dialog || {
    showOpenDialog: async () => ({ canceled: true }),
    showMessageBox: async () => ({ response: 1 }),
  };
  const shell = overrides.shell || {
    openPath: async () => "",
    openExternal: async (url) => calls.push(["openExternal", url]),
  };
  const settingsSizePreviewSession = overrides.settingsSizePreviewSession || {
    begin: () => {
      calls.push(["sizeBegin"]);
      return { status: "ok", phase: "begin" };
    },
    preview: async (value) => {
      calls.push(["sizePreview", value]);
      return { status: "ok" };
    },
    end: (value) => {
      calls.push(["sizeEnd", value]);
      return { status: "ok", phase: "end", value };
    },
  };
  const runtime = registerSettingsIpc({
    ipcMain,
    app: { getVersion: () => "1.2.3" },
    BrowserWindow: {
      fromWebContents: (sender) => ({ id: "parent", sender }),
    },
    dialog,
    shell,
    fs: overrides.fs || fs,
    path: overrides.path || path,
    settingsController,
    getActiveAppMode: overrides.getActiveAppMode,
    onCustomModeSaved: overrides.onCustomModeSaved,
    themeLoader,
    getSettingsWindow: () => ({ id: "settings-window" }),
    getActiveTheme: () => activeTheme,
    getLang: overrides.getLang || (() => "en"),
    settingsSizePreviewSession,
    isValidSizePreviewKey: (value) => /^P:\d+$/.test(value),
    sendToRenderer: (...args) => calls.push(["sendToRenderer", ...args]),
    getDoNotDisturb: overrides.getDoNotDisturb || (() => false),
    getSoundMuted: overrides.getSoundMuted || (() => false),
    getSoundVolume: overrides.getSoundVolume || (() => 0.4),
    getPetHidden: overrides.getPetHidden,
    setPetHidden: overrides.setPetHidden,
    getAllAgents: overrides.getAllAgents || (() => []),
    getHookServerPort: overrides.getHookServerPort,
    getRecentHookEvents: overrides.getRecentHookEvents,
    getProductInfo: overrides.getProductInfo,
    getQuotaSourceCount: overrides.getQuotaSourceCount,
    detectAgentInstallations: overrides.detectAgentInstallations,
    showTutorial: overrides.showTutorial || (() => {
      calls.push(["showTutorial"]);
      return { status: "ok" };
    }),
    aboutHeroImagePath: overrides.aboutHeroImagePath || path.join(__dirname, "missing-brand-icon.png"),
    getLanWsServer: overrides.getLanWsServer || (() => null),
    now: overrides.now || (() => 12345),
  });
  return { ipcMain, runtime, calls, activeTheme };
}

test("role import and external-folder IPC channels are not registered", () => {
  let sideEffects = 0;
  const effect = () => { sideEffects++; return { status: "ok" }; };
  const { ipcMain } = createHarness({
    themeLoader: { ensureUserThemesDir: effect },
    dialog: { showOpenDialog: effect },
    shell: { openPath: effect },
  });
  for (const channel of ["settings:import-user-theme-zip", "settings:import-codex-pet-zip",
    "settings:refresh-codex-pets", "settings:open-user-themes-dir", "settings:open-codex-pets-dir", "settings:remove-codex-pet"]) {
    assert.strictEqual(ipcMain.handlers.has(channel), false, channel);
  }
  assert.strictEqual(sideEffects, 0);
});

test("settings IPC reads and changes live pet visibility, rejecting deferred and invalid updates", async () => {
  let hidden = false;
  const { ipcMain } = createHarness({
    getPetHidden: () => hidden,
    setPetHidden: (next) => {
      hidden = next;
      return { applied: true, deferred: false, changed: true };
    },
  });
  assert.equal(await ipcMain.invoke("settings:get-pet-hidden"), false);
  assert.deepStrictEqual(await ipcMain.invoke("settings:set-pet-hidden", true), { status: "ok", hidden: true });
  assert.equal(await ipcMain.invoke("settings:get-pet-hidden"), true);
  assert.equal((await ipcMain.invoke("settings:set-pet-hidden", "false")).status, "error");
  assert.equal(hidden, true);

  const deferred = createHarness({
    getPetHidden: () => false,
    setPetHidden: () => ({ applied: false, deferred: true, changed: false }),
  });
  assert.equal((await deferred.ipcMain.invoke("settings:set-pet-hidden", true)).status, "error");
});

test("settings IPC registers owned channels and leaves animation override channels to their module", () => {
  const { ipcMain, runtime } = createHarness();

  assert.ok(ipcMain.handlers.has("settings:get-snapshot"));
  assert.ok(ipcMain.handlers.has("settings:get-quota-source-count"));
  assert.ok(ipcMain.handlers.has("settings:get-pet-tint-options"));
  assert.ok(ipcMain.handlers.has("settings:get-pet-accessory-options"));
  assert.ok(ipcMain.handlers.has("settings:pick-sound-file"));
  assert.ok(ipcMain.handlers.has("settings:list-themes"));
  assert.ok(ipcMain.handlers.has("settings:detect-agent-installations"));
  assert.ok(ipcMain.handlers.has("settings:show-tutorial"));
  assert.ok(!ipcMain.listeners.has("settings:open-dashboard"));
  assert.ok(!ipcMain.handlers.has("settings:getShortcutFailures"));
  assert.ok(!ipcMain.handlers.has("settings:enterShortcutRecording"));
  assert.ok(!ipcMain.handlers.has("settings:exitShortcutRecording"));
  assert.ok(!ipcMain.handlers.has("settings:get-animation-overrides-data"));
  assert.ok(!ipcMain.handlers.has("settings:open-theme-assets-dir"));
  assert.ok(!ipcMain.handlers.has("settings:preview-animation-override"));
  assert.ok(!ipcMain.handlers.has("settings:preview-reaction"));
  assert.ok(!ipcMain.handlers.has("settings:export-animation-overrides"));
  assert.ok(!ipcMain.handlers.has("settings:import-animation-overrides"));

  runtime.dispose();

  assert.strictEqual(ipcMain.handlers.size, 0);
  assert.strictEqual(ipcMain.listeners.size, 0);
});

test("settings IPC reports quota source count and fails closed when the provider throws", async () => {
  const ok = createHarness({ getQuotaSourceCount: () => 3 });
  assert.strictEqual(await ok.ipcMain.invoke("settings:get-quota-source-count"), 3);
  ok.runtime.dispose();

  const broken = createHarness({
    getQuotaSourceCount: () => {
      throw new Error("quota store unavailable");
    },
  });
  assert.strictEqual(await broken.ipcMain.invoke("settings:get-quota-source-count"), 0);
  broken.runtime.dispose();
});

test("settings:list-themes uses active runtime capabilities over raw metadata", async () => {
  const { ipcMain } = createHarness({
    activeTheme: {
      _id: "clawd",
      _capabilities: { petTint: true, accessories: false },
      sounds: {},
    },
    themeLoader: {
      getPreviewSoundUrl: () => null,
      getSoundOverridesDir: () => null,
      getSoundUrl: () => null,
      listThemesWithMetadata: () => [{
        id: "clawd",
        capabilities: { petTint: true, accessories: true, reactions: true },
      }],
      getThemeMetadata: () => null,
      ensureUserThemesDir: () => null,
    },
  });

  assert.deepStrictEqual(await ipcMain.invoke("settings:list-themes"), [{
    id: "clawd",
    active: true,
    capabilities: { petTint: true, accessories: false, reactions: true },
  }]);
});

test("settings IPC opens the tutorial from Settings", async () => {
  const { ipcMain, runtime, calls } = createHarness();

  const result = await ipcMain.invoke("settings:show-tutorial");

  assert.deepStrictEqual(result, { status: "ok" });
  assert.deepStrictEqual(calls, [["showTutorial"]]);
  runtime.dispose();
});

test("mobile connection info reports starting until the LAN bridge has a port", async () => {
  const token = "0123456789abcdef0123456789abcdef";
  const { ipcMain, runtime } = createHarness({
    getLanWsServer: () => ({
      getPort: () => null,
      getToken: () => token,
    }),
  });

  const result = await ipcMain.invoke("settings:mobile-connection-info");

  assert.deepStrictEqual(result, {
    status: "starting",
    message: "LAN bridge is starting",
  });
  runtime.dispose();
});

test("mobile connection info returns a ready pair URL only when port and token are available", async () => {
  const token = "0123456789abcdef0123456789abcdef";
  const { ipcMain, runtime } = createHarness({
    getLanWsServer: () => ({
      getPort: () => 23334,
      getToken: () => token,
    }),
  });

  const result = await ipcMain.invoke("settings:mobile-connection-info");

  assert.strictEqual(result.status, "ok");
  assert.strictEqual(result.port, 23334);
  assert.strictEqual(result.token, token);
  assert.ok(result.pairUrl.includes("port=23334"));
  assert.ok(result.pairUrl.includes(`token=${token}`));
  assert.ok(!result.pairUrl.includes("port=null"));
  runtime.dispose();
});

test("settings IPC delegates controller and size preview handlers", async () => {
  const { ipcMain, calls } = createHarness();

  assert.deepStrictEqual(await ipcMain.invoke("settings:get-snapshot"), { lang: "en" });
  assert.deepStrictEqual(
    await ipcMain.invoke("settings:get-pet-tint-options"),
    listPetTintOptions()
  );
  assert.deepStrictEqual(
    await ipcMain.invoke("settings:get-pet-accessory-options"),
    listPetAccessoryOptions()
  );
  assert.deepStrictEqual(
    await ipcMain.invoke("settings:update", null),
    { status: "error", message: "settings:update payload must be { key, value }" }
  );
  assert.deepStrictEqual(await ipcMain.invoke("settings:update", { key: "size", value: "P:20" }), {
    status: "ok",
    key: "size",
    value: "P:20",
  });
  assert.deepStrictEqual(await ipcMain.invoke("settings:update", { key: "tgMigration", value: { transport: "native" } }), {
    status: "error",
    message: "tgMigration is internal; use telegramMigration.dispatch",
  });
  assert.deepStrictEqual(await ipcMain.invoke("settings:update", { key: "permissionAutomationMode", value: "auto-tools" }), {
    status: "error",
    message: "permission automation is gated; use the setPermissionAutomationMode command",
  });
  assert.deepStrictEqual(await ipcMain.invoke("settings:update", { key: "autoApproveAllPermissions", value: true }), {
    status: "error",
    message: "permission automation is gated; use the setPermissionAutomationMode command",
  });
  for (const key of [
    "permissionAutomationAutoToolsWarningDismissed",
    "permissionAutomationUnattendedWarningDismissed",
  ]) {
    assert.deepStrictEqual(await ipcMain.invoke("settings:update", { key, value: true }), {
      status: "error",
      message: "permission automation is gated; use the setPermissionAutomationMode command",
    });
  }
  assert.deepStrictEqual(await ipcMain.invoke("settings:command", { action: "resizePet", payload: "P:30" }), {
    status: "ok",
  });
  for (const action of [
    "remoteSsh.applyInstallationIdentity",
    "remoteSsh.beginIdentityRotation",
    "remoteSsh.updateIdentityStep",
    "remoteSsh.commitIdentityRotation",
    "remoteSsh.forceRevoke",
    "remoteSsh.markDeployed",
    "remoteSsh.markRemoteNode",
  ]) {
    assert.deepStrictEqual(
      await ipcMain.invoke("settings:command", { action, payload: { forged: true } }),
      { status: "error", message: `settings command "${action}" is internal` }
    );
  }
  assert.deepStrictEqual(await ipcMain.invoke("settings:begin-size-preview"), {
    status: "ok",
    phase: "begin",
  });
  assert.deepStrictEqual(await ipcMain.invoke("settings:preview-size", "bad"), {
    status: "error",
    message: 'invalid preview size "bad"',
  });
  assert.deepStrictEqual(await ipcMain.invoke("settings:preview-size", "P:35"), { status: "ok" });
  assert.deepStrictEqual(await ipcMain.invoke("settings:end-size-preview", "P:35"), {
    status: "ok",
    phase: "end",
    value: "P:35",
  });

  assert.deepStrictEqual(calls, [
    ["applyUpdate", "size", "P:20"],
    ["applyCommand", "resizePet", "P:30"],
    ["sizeBegin"],
    ["sizePreview", "P:35"],
    ["sizeEnd", "P:35"],
  ]);
});


test("settings IPC serves agent/about/external and remove-theme dialog helpers", async () => {
  const root = makeTempDir();
  try {
    const heroImagePath = path.join(root, "brand-icon.png");
    fs.writeFileSync(heroImagePath, "brand", "utf8");
    let messageBoxParent = null;
    let messageBoxOptions = null;
    const { ipcMain, calls } = createHarness({
      aboutHeroImagePath: heroImagePath,
      getLang: () => "en",
      getProductInfo: () => ({
        repoUrl: "https://github.com/Liujingze11/mobi-agent-pet",
        authorName: "Liujingze11",
        authorUrl: "https://github.com/Liujingze11",
        copyright: "\u00a9 2026 Liujingze11",
      }),
      dialog: {
        showOpenDialog: async () => ({ canceled: true }),
        showMessageBox: async (parent, options) => {
          messageBoxParent = parent;
          messageBoxOptions = options;
          return { response: 0 };
        },
      },
      themeLoader: {
        getPreviewSoundUrl: () => "file:///preview.mp3",
        getSoundOverridesDir: () => null,
        getSoundUrl: () => null,
        listThemesWithMetadata: () => [],
        getThemeMetadata: (themeId) => ({ name: `Theme ${themeId}` }),
      },
      getAllAgents: () => [
        { id: "codex", name: "Codex", eventSource: "hook", capabilities: { permission: true } },
      ],
      getHookServerPort: () => 23335,
      getRecentHookEvents: ({ agentId }) => [{
        timestamp: 12345,
        agentId,
        eventType: "PreToolUse",
        route: "state",
        outcome: "accepted",
      }],
      settingsController: {
        getSnapshot: () => ({
          lang: "en",
          customApplications: [{
            id: "custom-nova-ai-0123456789ab",
            name: "Nova AI",
            sourcePath: "C:\\NovaAI",
            executablePath: "C:\\NovaAI\\NovaAI.exe",
            processName: "NovaAI.exe",
            category: "code",
          }],
        }),
        applyUpdate: () => ({ status: "ok" }),
        applyCommand: async () => ({ status: "ok" }),
      },
    });

    assert.strictEqual(await ipcMain.invoke("settings:get-preview-sound-url"), null);
    assert.deepStrictEqual(await ipcMain.invoke("settings:list-agents"), [
      { id: "codex", name: "Codex", eventSource: "hook", capabilities: { permission: true } },
      {
        id: "custom-nova-ai-0123456789ab",
        name: "Nova AI",
        category: "code",
        eventSource: "custom-http",
        custom: true,
        sourcePath: "C:\\NovaAI",
        executablePath: "C:\\NovaAI\\NovaAI.exe",
        processName: "NovaAI.exe",
        stateEndpoint: "http://127.0.0.1:23335/state",
        lastStateEvent: { timestamp: 12345, eventType: "PreToolUse" },
        capabilities: {
          httpHook: true,
          permissionApproval: false,
          interactiveBubble: false,
          notificationHook: true,
          sessionEnd: true,
          subagent: false,
          managedIntegration: false,
        },
      },
    ]);
    assert.deepStrictEqual(await ipcMain.invoke("settings:get-about-info"), {
      version: "1.2.3",
      repoUrl: "https://github.com/Liujingze11/mobi-agent-pet",
      license: "",
      copyright: "\u00a9 2026 Liujingze11",
      authorName: "Liujingze11",
      authorUrl: "https://github.com/Liujingze11",
      heroImageSrc: pathToFileURL(heroImagePath).href,
    });
    assert.deepStrictEqual(await ipcMain.invoke("settings:confirm-remove-theme", "user-theme"), {
      confirmed: true,
    });
    assert.deepStrictEqual(messageBoxParent, { id: "parent", sender: "sender-web-contents" });
    assert.strictEqual(messageBoxOptions.message, 'Delete theme "Theme user-theme"?');
    assert.deepStrictEqual(await ipcMain.invoke("settings:open-external", "file:///tmp"), {
      status: "error",
      message: "Invalid URL",
    });
    assert.deepStrictEqual(await ipcMain.invoke("settings:open-external", "https://example.test"), {
      status: "ok",
    });
    assert.deepStrictEqual(calls, [
      ["openExternal", "https://example.test"],
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("settings IPC picks executable files and installation folders for discovery", async () => {
  const selections = ["C:\\Tools\\agent.exe", "C:\\Tools\\Agent"];
  const optionsSeen = [];
  const { ipcMain } = createHarness({
    dialog: {
      showOpenDialog: async (_parent, options) => {
        optionsSeen.push(options);
        return { canceled: false, filePaths: [selections[optionsSeen.length - 1]] };
      },
      showMessageBox: async () => ({ response: 1 }),
    },
  });

  assert.deepStrictEqual(await ipcMain.invoke("settings:pick-agent-discovery-path", { kind: "file" }), {
    status: "ok",
    path: selections[0],
  });
  assert.deepStrictEqual(await ipcMain.invoke("settings:pick-agent-discovery-path", { kind: "directory" }), {
    status: "ok",
    path: selections[1],
  });
  assert.deepStrictEqual(optionsSeen.map((options) => options.properties), [["openFile"], ["openDirectory"]]);
  assert.deepStrictEqual(await ipcMain.invoke("settings:pick-agent-discovery-path", { kind: "anything" }), {
    status: "error",
    message: "pickAgentDiscoveryPath.kind must be file or directory",
  });
});

test("settings IPC exposes read-only agent installation detection", async () => {
  let sawFs = false;
  let sawPath = false;
  const { ipcMain, runtime } = createHarness({
    now: () => 777,
    detectAgentInstallations: (options) => {
      sawFs = !!options.fs;
      sawPath = !!options.path;
      return {
        checkedAt: options.now(),
        agents: [{ agentId: "qwen-code", detectedInstalled: true }],
        skippedAgentIds: ["claude-code", "codex"],
      };
    },
  });

  assert.deepStrictEqual(await ipcMain.invoke("settings:detect-agent-installations"), {
    checkedAt: 777,
    agents: [{ agentId: "qwen-code", detectedInstalled: true }],
    skippedAgentIds: ["claude-code", "codex"],
  });
  assert.strictEqual(sawFs, true);
  assert.strictEqual(sawPath, true);

  runtime.dispose();
});

test("settings:list-themes selects the product default when no theme is active", async () => {
  const {ipcMain,runtime} = createHarness({activeTheme:null,themeLoader:{getDefaultThemeId: () => "mobi-a",listThemesWithMetadata:()=>[{id:"mobi-a"},{id:"mobi-b"}]}});
  try {
    const themes=await ipcMain.invoke("settings:list-themes");
    assert.deepStrictEqual(themes.map(theme=>[theme.id,theme.active]),[["mobi-a",true],["mobi-b",false]]);
  } finally {runtime.dispose();}
});

test("settings:list-themes keeps the legacy default with older loaders and no active theme", async () => {
  const {ipcMain,runtime}=createHarness({activeTheme:null,themeLoader:{listThemesWithMetadata:()=>[{id:"clawd"},{id:"user-pet"}]}});
  try {assert.deepStrictEqual((await ipcMain.invoke("settings:list-themes")).map(theme=>[theme.id,theme.active]),[["clawd",true],["user-pet",false]]);} finally {runtime.dispose();}
});

test('sound preview and file operations are retired without emitting playback or opening dialogs',async()=>{
 let picked=0;
 const h=createHarness({dialog:{showOpenDialog:async()=>{picked++;return {canceled:true}}},themeLoader:{getSoundUrl:()=> 'file:///complete.mp3',getPreviewSoundUrl:()=> 'file:///complete.mp3'}});
 for(const channel of ['settings:preview-sound','settings:pick-sound-file','settings:open-sound-overrides-dir']){
  const result=await h.ipcMain.invoke(channel,{soundName:'complete'});assert.equal(result.code,'SOUND_DISABLED');
 }
 assert.equal(await h.ipcMain.invoke('settings:get-preview-sound-url'),null);assert.equal(picked,0);
 assert.ok(!h.calls.some(call=>call[0]==='sendToRenderer'&&call[1]==='play-sound'));
});

test('Custom mode saving uses its command and applies only after a successful commit',async()=>{
 const writes=[],saved=[];
 const profile=require('../src/custom-mode-profile').defaultCustomModeProfile();
 const h=createHarness({settingsController:{getSnapshot:()=>({customModeProfile:profile}),applyCommand:async(action,payload)=>{writes.push(action);return {status:'ok'}}},onCustomModeSaved:async(options)=>{saved.push(options);return {status:'ok'}},getActiveAppMode:()=> 'normal'});
 assert.deepEqual((await h.ipcMain.invoke('settings:get-mode-config')).profile,profile);
 const result=await h.ipcMain.invoke('settings:save-custom-mode',{profile});assert.equal(result.status,'ok');assert.deepEqual(writes,['setCustomModeProfile']);assert.equal(saved.length,1);
});

test('failed Custom runtime application restores the persisted profile and legacy editor paths cannot bypass it',async()=>{
 const model=require('../src/custom-mode-profile'),original=model.defaultCustomModeProfile();let profile=original,refreshes=0;
 const h=createHarness({settingsController:{getSnapshot:()=>({customModeProfile:profile}),applyUpdate(){throw new Error('must not update')},applyCommand:async(_action,payload)=>{profile=payload.profile;return {status:'ok'}}},onCustomModeSaved:()=>++refreshes===1?{status:'error',message:'apply failed'}:{status:'ok'}});
 assert.equal((await h.ipcMain.invoke('settings:save-custom-mode',{profile:{...original,petVisible:false}})).status,'error');assert.deepEqual(profile,original);assert.equal(refreshes,2);
 for(const key of ['sessionHudEnabled','hideBubbles','soundMuted','freeRoam','customModeProfile'])assert.equal((await h.ipcMain.invoke('settings:update',{key,value:false})).status,'error');
 for(const action of ['setPermissionAutomationMode','setAllBubblesHidden','setSoundOverride'])assert.equal((await h.ipcMain.invoke('settings:command',{action,payload:{}})).status,'error');
});
