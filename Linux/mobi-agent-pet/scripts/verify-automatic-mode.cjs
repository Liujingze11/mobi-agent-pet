'use strict';
// Run with the repository's Electron binary. Uses private preferences and
// controlled input samples; never installs integrations or moves the cursor.
const { app, BrowserWindow, ipcMain, globalShortcut, screen, powerSaveBlocker } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'runtime/clawd/src');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'mobi-auto-mode-'));
fs.mkdirSync(path.join(sandbox, 'home'));
fs.mkdirSync(path.join(sandbox, 'data'));
os.homedir = () => path.join(sandbox, 'home');
app.setPath('appData', path.join(sandbox, 'data'));
app.setPath('userData', path.join(sandbox, 'data/AgentLog Pet'));
fs.mkdirSync(app.getPath('userData'), { recursive: true });
app.getLoginItemSettings = () => ({ openAtLogin: false });
app.setLoginItemSettings = () => {};
globalShortcut.register = () => false;

const prefs = require(path.join(src, 'prefs')).getDefaults();
Object.assign(prefs, { theme: 'cloudling', x: 400, y: 400, positionSaved: true,
  positionThemeId: 'cloudling', positionVariantId: 'default', tutorialSeen: true,
  manageClaudeHooksAutomatically: false, shortcuts: {}, lang: 'zh' });
prefs.customModeProfile = { ...require(path.join(src, 'custom-mode-profile')).defaultCustomModeProfile(),
  petVisible: false, states: ['idle'], trayAlerts: false, agentBubbles: true,
  sessionHud: true, hudQuota: false, keepAwake: false, keepSizeAcrossDisplays: false,
  fullscreenOverlay: false, permissionAutomationMode: 'off' };
for (const agent of require(path.join(src, '../agents/registry')).getAllAgents()) {
  prefs.agents[agent.id] = { enabled: false, integrationInstalled: false, permissionsEnabled: false };
}
prefs.agents.codex = { enabled: true, integrationInstalled: false, permissionsEnabled: true, permissionMode: 'intercept' };
prefs.agents['claude-code'] = { enabled: true, integrationInstalled: false, permissionsEnabled: true };
fs.writeFileSync(path.join(app.getPath('userData'), 'clawd-prefs.json'), JSON.stringify(prefs));

let state, hud, menu, controller, tray, roam, roamContext, server;
let point = { x: 450, y: 450 }, buttons = 0;
const icons = [], blockers = new Set(), powerCalls = [], cases = [];
function captureFactory(name, receive, adapt = x => x) {
  const file = require.resolve(path.join(src, name));
  const original = require(file);
  require.cache[file].exports = options => {
    const value = original(adapt(options)); receive(value); return value;
  };
}
captureFactory('state', value => { state = value; });
captureFactory('menu', () => {}, options => { menu = options; return options; });
captureFactory('roam', value => { roam = value; }, options => { roamContext = options; return options; });
captureFactory('server', value => { server = value; }, options => {
  const probe = Object.create(options);
  Object.defineProperty(probe, 'getPortCandidates', { value: () => [23460] });
  return probe;
});
const snapshot = { sessions: [{ id: 'fixture', agent: 'codex', state: 'working', badge: 'running',
  headless: false, cwd: sandbox, updatedAt: Date.now(), displayTitle: 'Automatic mode check',
  contextUsage: { used: 80000, limit: 100000, percent: 80 } }], orderedIds: ['fixture'], groups: [],
  accountQuota: [{ host: 'fixture', claudeQuota: { group: {
    claudeWeekly: { usedPercent: 41, resetAt: Date.now() + 3600000 } }, updatedAt: Date.now() } }] };
captureFactory('session-hud', value => { hud = value; }, ctx => {
  const probe = Object.create(ctx);
  Object.defineProperties(probe, { getSessionSnapshot: { value: () => snapshot },
    sessionHudPinned: { get: () => false }, mouseButtonReader: { value: { read: () => buttons, stop() {} } } });
  return probe;
});
const modeModule = require(path.join(src, 'app-mode'));
const modeFactory = modeModule.createAppModeController;
modeModule.createAppModeController = options => (controller = modeFactory(options));
const trayModule = require(path.join(src, 'tray-status-light'));
const trayFactory = trayModule.createTrayStatusLightController;
trayModule.createTrayStatusLightController = options => (tray = trayFactory({ ...options,
  setIcon: icon => { icons.push(icon); return options.setIcon(icon); } }));
const startBlocker = powerSaveBlocker.start.bind(powerSaveBlocker);
const stopBlocker = powerSaveBlocker.stop.bind(powerSaveBlocker);
powerSaveBlocker.start = type => { const id = startBlocker(type); blockers.add(id); powerCalls.push(type); return id; };
powerSaveBlocker.stop = id => { blockers.delete(id); return stopBlocker(id); };
app.whenReady().then(() => { screen.getCursorScreenPoint = () => point; });

// Do not launch terminal helpers, installers or Agent subprocesses.
const cp = require('node:child_process');
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  cp[key] = (...args) => {
    const error = Error('verification blocks external process: ' + key);
    const callback = args.findLast(value => typeof value === 'function');
    if (!callback) throw error;
    queueMicrotask(() => callback(error, '', ''));
    return { on() { return this; }, once() { return this; }, unref() {}, kill() {} };
  };
}
for (const key of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'chmodSync', 'renameSync', 'copyFileSync']) {
  const original = fs[key];
  fs[key] = (...args) => {
    const target = ['renameSync', 'copyFileSync'].includes(key) ? args[1] : args[0];
    if (typeof target === 'string' && !path.resolve(target).startsWith(sandbox + path.sep)) {
      throw Error('verification blocks external write: ' + target);
    }
    return original(...args);
  };
}
require(path.join(root, 'runtime/agentlog/main.cjs'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function request(route, body) {
  const runtime = server.getRuntimeStatus();
  assert.equal(runtime.listening, true, 'private server must own the request port');
  assert.equal(runtime.port, 23460);
  const payload = JSON.stringify(body);
  let ended = false;
  let req;
  const promise = new Promise(resolve => {
    req = http.request({ host: '127.0.0.1', port: 23460, path: route, method: 'POST', headers: {
      'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, res => {
      let data = ''; res.on('data', chunk => { data += chunk; });
      res.on('end', () => { ended = true; resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); });
    });
    req.setTimeout(4000, () => req.destroy(Error('request timeout')));
    req.on('error', error => { ended = true; resolve({ error: error.message }); });
    req.end(payload);
  });
  return { req, promise, get ended() { return ended; } };
}
async function approval(body) {
  const result = await request('/permission', body).promise;
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.body.hookSpecificOutput.decision.behavior, 'allow');
  assert.equal(menu.pendingPermissions.length, 0);
  return result.body.hookSpecificOutput.decision;
}
async function assertVisual(pet, next) {
  let visual;
  for (let n = 0; n < 75; n++) {
    visual = await pet.webContents.executeJavaScript(`(() => {
      const actions = tc.actionPlan.states[${JSON.stringify(next)}].actions;
      const tag = clawdEl?.tagName?.toLowerCase();
      return { state: currentState, displayed: currentDisplayedState, file: currentDisplayedSvg,
        validFile: actions.some(action => action.enabled && action.file === currentDisplayedSvg),
        loaded: tag === 'object' ? clawdEl.contentDocument?.documentElement?.localName === 'svg'
          : tag === 'img' && clawdEl.complete && clawdEl.naturalWidth > 0 };
    })()`);
    if (visual.state === next && visual.displayed === next && visual.validFile && visual.loaded) return;
    await wait(20);
  }
  assert.fail('visual did not load for ' + next + ': ' + JSON.stringify(visual));
}
app.whenReady().then(async () => {
  await wait(2200);
  assert.equal(server.getRuntimeStatus().listening, true);
  assert.equal(server.getRuntimeStatus().port, 23460);
  assert.equal(menu.getAppMode(), 'normal');
  assert.equal((await menu.setAppMode('automatic')).status, 'confirmation-required');
  assert.equal(menu.getAppMode(), 'normal');
  assert.equal((await menu.setAppMode('automatic', { confirmed: true })).status, 'ok');
  const policy = controller.getEffectiveAppModePolicy();
  assert.deepEqual([...policy.allowedPetStates], ['idle', 'working', 'waiting', 'complete', 'error', 'held']);
  for (const key of ['muteSound', 'trayAlerts', 'keepAwakeWhileWorking', 'keepSizeAcrossDisplays', 'fullscreenOverlay']) assert.equal(policy[key], true, key);
  for (const key of ['agentBubblesEnabled', 'sessionHudEnabled', 'allowRoamAnimation']) assert.equal(policy[key], false, key);
  assert.equal(roamContext.isModeMovementAllowed(), false);
  cases.push('confirmation and fixed policy independent of Custom');
  const pet = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/src/index.html'));
  const input = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/src/hit.html'));
  assert.ok(pet?.isVisible()); assert.ok(input?.isVisible());
  for (const next of ['idle', 'working', 'waiting', 'complete', 'error']) {
    state.applyState(next); await wait(50); assert.equal(state.getCurrentState(), next);
    await assertVisual(pet, next);
  }
  state.applyState('idle'); assert.equal(state.applyState('roam'), false);
  state.setPetHeld(true); assert.equal(state.getCurrentState(), 'held'); await assertVisual(pet, 'held'); state.setPetHeld(false);
  assert.equal(state.getCurrentState(), 'idle');
  cases.push('six states render, roam denied');
  const idle = await pet.webContents.executeJavaScript(`(() => {
    const plan = structuredClone(tc.actionPlan);
    for (const action of plan.states.idle.actions) action.durationMs = 500;
    if (actionPlayer) actionPlayer.stop(); window.__modeTestFrames = 0;
    actionPlayer = MobiPetActions.createPlayer({ plan, render: (file, state, duration, replay) => {
      window.__modeTestFrames++; displayStateFile(state, file, { replay: !!replay });
    } });
    actionPlayer.update('idle', currentDisplayedSvg);
    return { power: typeof window.electronAPI.onLowPowerIdleModeChange,
      mini: typeof window.electronAPI.onMiniModeChange };
  })()`);
  await wait(2200);
  assert.equal(idle.power, 'undefined'); assert.equal(idle.mini, 'undefined');
  assert.ok(await pet.webContents.executeJavaScript('window.__modeTestFrames >= 4'));
  cases.push('idle playback continues; retired power and mini APIs absent');
  for (const restored of ['idle', 'working', 'waiting']) {
    state.applyState(restored); await wait(120);
    const hit = input.getBounds(), before = pet.getBounds();
    const x = Math.floor(hit.width / 2), y = Math.floor(hit.height / 2);
    point = { x: hit.x + x, y: hit.y + y }; buttons = 1;
    input.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', x, y, clickCount: 1 });
    await wait(60); assert.equal(state.getCurrentState(), 'held', restored + ' pickup');
    point = { x: point.x + 45, y: point.y + 18 }; await wait(120);
    assert.equal(pet.getBounds().x, before.x + 45, restored + ' drag');
    assert.equal(pet.getBounds().y, before.y + 18);
    assert.equal(pet.getBounds().width, before.width); assert.equal(pet.getBounds().height, before.height);
    buttons = 0; input.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', x: x + 45, y: y + 18, clickCount: 1 });
    await wait(100); assert.equal(state.getCurrentState(), restored, restored + ' release');
  }
  cases.push('idle/work/wait drag and stable size');
  state.applyState('idle'); hud.revealFromPet(); await wait(120);
  assert.ok(!hud.getWindow()?.isVisible()); assert.ok(!hud.getQuotaRingWindow()?.isVisible());
  const windowCount = BrowserWindow.getAllWindows().length;
  const hit = input.getBounds(), x = Math.floor(hit.width / 2), y = Math.floor(hit.height / 2);
  point = { x: hit.x + x, y: hit.y + y };
  for (const clickCount of [1, 2]) {
    buttons = 1; input.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', x, y, clickCount });
    await wait(40); buttons = 0;
    input.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', x, y, clickCount }); await wait(70);
  }
  input.webContents.sendInputEvent({ type: 'mouseDown', button: 'right', x, y, clickCount: 1 });
  input.webContents.sendInputEvent({ type: 'mouseUp', button: 'right', x, y, clickCount: 1 }); await wait(80);
  assert.equal(BrowserWindow.getAllWindows().length, windowCount);
  assert.ok(!hud.getWindow()?.isVisible()); assert.ok(!hud.getQuotaRingWindow()?.isVisible());
  cases.push('task card and quota ring remain hidden');
  tray.stop(); state.updateSession('probe-work', 'working', { agentId: 'codex', event: 'PreToolUse', toolName: 'Bash' });
  await wait(80); assert.equal(blockers.size, 1); assert.equal(tray.getStatus(), 'working');
  await wait(620); assert.ok(icons.includes('agentlog-pet-working')); assert.ok(icons.includes('agentlog-pet'));
  state.updateSession('probe-work', 'idle', { agentId: 'codex', event: 'Stop' }); await wait(80);
  assert.equal(blockers.size, 0); assert.ok(powerCalls.includes('prevent-app-suspension'));
  state.applyState('complete'); await wait(50);
  assert.equal(tray.getPhase(), 'completion'); tray.stop(); state.applyState('error'); await wait(50);
  assert.equal(tray.getStatus(), 'error'); state.applyState('idle');
  cases.push('working/completion/error tray and real keep-awake release');
  const codex = { agent_id: 'codex', session_id: 'codex:auto-check', tool_name: 'Bash', tool_input: { command: 'echo fixture-only-never-executed' } };
  await approval(codex);
  const questions = [{ question: 'Single?', options: [{ label: 'A' }, { label: 'B (Recommended)' }] },
    { question: 'Multiple?', multiSelect: true, options: [{ label: 'A（推荐）' }, { label: 'B' }, { label: 'C (Recommended)' }] },
    { question: 'Unmarked?', options: [{ label: 'A' }, { label: 'B' }] },
    { question: 'Ambiguous?', options: [{ label: 'A (Recommended)' }, { label: 'B (Recommended)' }] }];
  const answered = await approval({ agent_id: 'claude-code', session_id: 'claude:questions', tool_name: 'AskUserQuestion', tool_input: { questions } });
  assert.deepEqual(answered.updatedInput.answers, { 'Single?': 'B (Recommended)', 'Multiple?': 'A（推荐）, C (Recommended)',
    'Unmarked?': 'You choose whatever is best.', 'Ambiguous?': 'You choose whatever is best.' });
  assert.deepEqual(answered.updatedInput.questions, questions);
  await approval({ agent_id: 'claude-code', session_id: 'claude:plan', tool_name: 'ExitPlanMode', tool_input: { plan: 'Fixture only' } });
  cases.push('tool/plan approval and recommended/default question answers');
  const fallback = await request('/permission', { ...codex, session_id: 'codex:unsupported', tool_name: 'Unknown' }).promise;
  assert.ok(fallback.status === 204 || fallback.body === null); assert.equal(menu.pendingPermissions.length, 0);
  menu.enableDoNotDisturb();
  const dnd = await request('/permission', { ...codex, session_id: 'codex:dnd' }).promise;
  assert.equal(typeof dnd.status, 'number', JSON.stringify(dnd));
  assert.notEqual(dnd.body?.hookSpecificOutput?.decision?.behavior, 'allow'); assert.equal(menu.pendingPermissions.length, 0);
  menu.disableDoNotDisturb(); cases.push('unsupported and DND do not auto-approve');
  await menu.setAppMode('normal'); hud.revealFromPet();
  for (let n = 0; n < 60 && (!hud.getWindow()?.isVisible() || !hud.getQuotaRingWindow()?.isVisible()); n++) await wait(30);
  assert.ok(hud.getWindow()?.isVisible()); assert.ok(hud.getQuotaRingWindow()?.isVisible());
  const card = hud.getWindow();
  await wait(5300); assert.equal(card.isVisible(), false);
  hud.revealFromPet(); await wait(80); assert.ok(card.isVisible());
  const cardBounds = card.getBounds();
  point = { x: cardBounds.x + cardBounds.width + 12, y: cardBounds.y + 12 }; buttons = 1;
  await wait(80); assert.equal(card.isVisible(), false); buttons = 0;
  const manual = request('/permission', { ...codex, session_id: 'codex:manual' }); await wait(200);
  assert.equal(manual.ended, false); assert.equal(menu.pendingPermissions.length, 1);
  assert.ok(menu.pendingPermissions[0].bubble?.isVisible()); manual.req.destroy(); await wait(2200);
  assert.equal(menu.pendingPermissions.length, 0);
  await menu.setAppMode('automatic'); await wait(100);
  assert.ok(!hud.getWindow()?.isVisible()); assert.ok(!hud.getQuotaRingWindow()?.isVisible());
  cases.push('Normal restores manual UI; returning to Automatic removes overlays');
  menu.openCustomModeEditor();
  let editor;
  for (let n = 0; n < 60; n++) {
    editor = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/src/custom-mode.html'));
    if (editor?.isVisible() && !editor.webContents.isLoadingMainFrame()) {
      const ready = await editor.webContents.executeJavaScript('!!document.querySelector("[data-custom-mode-field=permissionAutomationMode]")');
      if (ready) break;
    }
    await wait(30);
  }
  assert.ok(editor?.isVisible());
  assert.equal(await editor.webContents.executeJavaScript('document.querySelector("option[value=unattended]").textContent'), '完全访问');
  const customProfile = { ...require(path.join(src, 'custom-mode-profile')).defaultCustomModeProfile(),
    sessionHud: false, hudQuota: true, roamIntervalSeconds: 300 };
  async function saveCustom(profile) {
    const result = await editor.webContents.executeJavaScript(`window.settingsAPI.saveCustomMode(${JSON.stringify(profile)})`);
    assert.equal(result.status, 'ok', JSON.stringify(result));
    assert.equal(result.profile.roamIntervalSeconds, 300);
  }
  await saveCustom(customProfile); assert.equal(menu.getAppMode(), 'automatic');
  assert.ok(!hud.getWindow()?.isVisible()); assert.ok(!hud.getQuotaRingWindow()?.isVisible());
  assert.equal((await menu.setAppMode('custom')).status, 'ok'); hud.revealFromPet();
  for (let n = 0; n < 60 && !hud.getQuotaRingWindow()?.isVisible(); n++) await wait(30);
  assert.ok(hud.getQuotaRingWindow()?.isVisible()); assert.ok(!hud.getWindow()?.isVisible());
  await saveCustom({ ...customProfile, hudQuota: false }); await wait(80);
  assert.ok(!hud.getQuotaRingWindow()?.isVisible()); assert.ok(!hud.getWindow()?.isVisible());
  await saveCustom({ ...customProfile, sessionHud: true, hudQuota: false }); hud.revealFromPet();
  for (let n = 0; n < 60 && !hud.getWindow()?.isVisible(); n++) await wait(30);
  assert.ok(hud.getWindow()?.isVisible()); assert.ok(!hud.getQuotaRingWindow()?.isVisible());
  await menu.setAppMode('automatic'); await wait(80);
  assert.ok(!hud.getWindow()?.isVisible()); assert.ok(!hud.getQuotaRingWindow()?.isVisible());
  cases.push('Custom card/quota switches are independent; saving preserves preset and other values');
  const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'clawd-prefs.json'), 'utf8'));
  assert.equal(saved.agents.codex.permissionMode, 'intercept');
  assert.equal(saved.agents.codex.integrationInstalled, false);
  assert.equal(saved.agents['claude-code'].integrationInstalled, false);
  console.log('AUTO_ALL_FEATURES_NATIVE_PASS', JSON.stringify({ cases, sandbox, commandsExecuted: false }));
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
setTimeout(() => app.exit(2), 35000).unref();
