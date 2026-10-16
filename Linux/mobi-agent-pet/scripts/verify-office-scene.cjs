"use strict";

// Render the real overview with disposable, in-memory Agent and theme data.
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const src = path.join(root, "runtime/clawd/src");
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-office-"));
app.disableHardwareAcceleration();
const output = path.join(root, "docs/verification/office-scene");
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", sandbox);
const { i18n } = require(path.join(src, "i18n"));
const themeNames = Object.fromEntries(["mobi-a", "mobi-b", "mobi-c"].map(id => [id,
  JSON.parse(fs.readFileSync(path.join(root, "runtime/clawd/themes", id, "theme.json"), "utf8")).name]));
const preload = path.join(sandbox, "preload.cjs");
fs.writeFileSync(preload, `window.__officeClock = 0;
Date.now = () => window.__officeClock;
window.__officeTheme = 'mobi-a';
window.__officeSession = { id: 'office-check', agent: 'codex', state: 'working', badge: 'running', updatedAt: 0, displayTitle: 'Office scene verification', cwd: '/preview/mobi', canFocus: false };
window.dashboardAPI = {
  onLangChange() {}, onSessionSnapshot(listener) { window.__officeSnapshotListener = listener; },
  getI18n: async () => ({ lang: 'zh', translations: ${JSON.stringify(i18n.zh)} }),
  getSnapshot: async () => ({ sessions: [window.__officeSession], groups: [{ ids: ['office-check'] }], accountQuota: [] }),
  getPetScene: async () => ({ themeId: window.__officeTheme, name: (${JSON.stringify(themeNames)})[window.__officeTheme] }),
};
window.petThemeAPI = new Proxy({}, { get: () => async () => [] });
window.settingsAPI = { onChanged() {} };
`);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({ width: 1120, height: 760, show: false,
    webPreferences: { preload, contextIsolation: false, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  async function evaluate(script) { return win.webContents.executeJavaScript(script); }
  async function advance(ms) { await evaluate(`window.__officeClock += ${ms}; officeScene.tick();`); }
  async function checkLayout(desktop) {
    const layout = await evaluate(`(() => {
      const scene = document.getElementById('petScene'), art = scene.querySelector('.office-art');
      const rect = scene.getBoundingClientRect(), canvas = art.getBoundingClientRect();
      const quota = document.querySelector('.quota-panel').getBoundingClientRect();
      const mood = document.getElementById('petMood'), moodRect = mood.getBoundingClientRect();
      const name = document.getElementById('petName'), nameRect = name.getBoundingClientRect();
      const status = { inside: moodRect.left >= rect.left && moodRect.right <= rect.right && moodRect.top >= rect.top && moodRect.bottom <= rect.bottom,
        floating: getComputedStyle(mood).position === 'absolute' && Number(getComputedStyle(mood).zIndex) > 3 };
      const accessibleName = { linked: scene.getAttribute('aria-labelledby') === name.id && !!name.textContent.trim(),
        hidden: nameRect.width <= 1 && nameRect.height <= 1 && getComputedStyle(name).overflow === 'hidden' };
      return { width: rect.width, height: rect.height, quotaWidth: quota.width,
        covers: canvas.left <= rect.left + 1 && canvas.right >= rect.right - 1 && canvas.top <= rect.top + 1 && canvas.bottom >= rect.bottom - 1,
        ratio: canvas.width / canvas.height, status, accessibleName };
    })()`);
    assert.equal(layout.covers, true, 'animation must cover the tile edge to edge');
    assert.ok(Math.abs(layout.ratio - 1.5) < .002, 'the office illustration must keep its proportions');
    assert.ok(layout.status.inside && layout.status.floating, 'status must float over the scene');
    assert.ok(layout.accessibleName.linked && layout.accessibleName.hidden, 'character name must remain available to assistive technology without a visible label');
    assert.ok(layout.height >= 280, 'the animation tile must be larger');
    if (desktop) assert.ok(layout.width >= layout.quotaWidth * 1.4, 'the office takes most of the upper row');
  }
  async function capture(name, whole = false) {
    await pause(80);
    const bounds = await evaluate(`(() => { const r = document.getElementById('petScene').getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height)}; })()`);
    const image = await win.webContents.capturePage(whole ? undefined : bounds, { stayHidden: true, stayAwake: true });
    assert.equal(image.isEmpty(), false, `${name} screenshot must contain rendered pixels`);
    fs.writeFileSync(path.join(output, `${name}.png`), image.toPNG());
  }
  try {
    await win.loadFile(path.join(src, "dashboard.html"));
    await pause(500);
    await evaluate("officeScene.setActive(true)");
    const loaded = await evaluate("Array.from(document.querySelectorAll('#officeScene img[src]')).map(img => ({url: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0}))");
    assert.ok(loaded.every(image => image.loaded), JSON.stringify(loaded));
    await checkLayout(true);
    assert.equal(await evaluate("officeScene.getState().action"), "typing", JSON.stringify({ errors, details: await evaluate("({state: officeScene.getState(), snapshot, api: Object.keys(window.dashboardAPI || {}), content: document.getElementById('content').textContent})") }));
    await advance(4000);
    await capture("mobi-a-typing");
    await capture("overview", true);
    const before = await evaluate("document.querySelector('.office-terminal').textContent");
    const npcBefore = await evaluate("Array.from(document.querySelectorAll('.office-npc img')).map(img => img.dataset.frame)");
    await advance(2200);
    assert.notEqual(await evaluate("document.querySelector('.office-terminal').textContent"), before);
    assert.notDeepEqual(await evaluate("Array.from(document.querySelectorAll('.office-npc img')).map(img => img.dataset.frame)"), npcBefore);
    await advance(32000);
    assert.equal(await evaluate("officeScene.getState().action"), "mouse");
    await capture("mouse");
    await evaluate("window.__officeSession.state = 'attention'; window.__officeSession.badge = 'idle'; render()");
    await advance(9000);
    assert.equal(await evaluate("officeScene.getState().action"), "coffee");
    await advance(2600);
    await capture("coffee");
    await advance(3000);
    assert.equal(await evaluate("officeScene.getState().action"), "mouse");
    await advance(30000);
    assert.equal(await evaluate("officeScene.getState().action"), "mouse");
    await evaluate("snapshot.sessions = []; render()");
    await advance(3000);
    await advance(26000);
    assert.equal(await evaluate("officeScene.getState().action"), "phone");
    await capture("phone");
    for (const id of ["mobi-b", "mobi-c"]) {
      await evaluate(`window.__officeTheme = ${JSON.stringify(id)}; refreshPetScene();`);
      await pause(200);
      assert.equal(await evaluate("document.getElementById('petName').textContent"), themeNames[id]);
      assert.equal(await evaluate("document.querySelector('.office-actor img').complete && document.querySelector('.office-actor img').naturalWidth > 0"), true);
      await capture(id);
      if (id === 'mobi-b') await capture('overview-momo', true);
    }
    await evaluate("selectDashboardPage('theme')");
    const frozen = await evaluate("officeScene.getState()");
    await advance(10000);
    assert.deepEqual(await evaluate("officeScene.getState()"), frozen);
    await evaluate("selectDashboardPage('status')");
    win.setSize(720, 760);
    await pause(200);
    await checkLayout(false);
    await capture("compact", true);
    // Exercise the same root CSS zoom as the real text-scale setting.
    for (const [width, height, selector, min, max, ratio] of [
      [1120, 1000, '.dashboard-overview', 330, 420, .44],
      [720, 760, '.pet-scene', 280, 380, .55],
    ]) {
      win.setSize(width, height);
      for (const scale of [1, 1.25, 1.5]) {
        await evaluate(`document.documentElement.style.zoom = ${scale}; document.documentElement.style.setProperty('--clawd-text-zoom', '${scale}')`);
        await pause(80);
        const layout = await evaluate(`({ height: document.querySelector('${selector}').getBoundingClientRect().height, viewport: ${width > 800 ? 'innerHeight' : 'innerWidth'} })`);
        const expected = Math.max(min * scale, Math.min(max * scale, layout.viewport * ratio));
        assert.ok(Math.abs(layout.height - expected) < 2, `${selector} must compensate ${scale} text zoom: ${layout.height} vs ${expected}`);
      }
    }
    await evaluate("document.documentElement.style.removeProperty('zoom'); document.documentElement.style.removeProperty('--clawd-text-zoom')");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, checks: ["all artwork loads", "edge-to-edge proportional animation", "floating status and accessible-only name", "larger desktop and compact tiles", "screen and NPC animation", "four motions", "finite coffee", "three main characters", "hidden-page pause", "compact layout", "desktop and compact text zoom at 100/125/150 percent", "no renderer errors"], output }, null, 2));
    win.destroy();
    app.quit();
  } catch (error) {
    console.error(error.stack);
    win.destroy();
    app.exit(1);
  }
});
