'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=f=>fs.readFileSync(path.join(__dirname,'../src',f),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function drag(w, from, to) {
  from.dispatchEvent(new w.Event('dragstart', { bubbles: true }));
  to.dispatchEvent(new w.Event('drop', { bubbles: true, cancelable: true }));
}
function lane(w, state) { return w.document.querySelector(`[data-action-state="${state}"]`); }

test('all states share a board and actions move directly between visible states', async () => {
  const dom = new JSDOM('<div id="actions"></div>', { runScripts: 'outside-only' }), w = dom.window;
  w.eval(read('pet-states.js')); w.eval(read('pet-action-plan.js'));
  const defaults = { version: 1, states: {
    idle: { mode: 'random', actions: [{ file: 'idle.svg', enabled: true, durationMs: 5000 }] },
    working: { mode: 'sequence', actions: [{ file: 'working.svg', enabled: true, durationMs: 5000 }] },
  } };
  const calls = [];
  w.settingsAPI = { getAnimationOverridesData: async () => ({ theme: { id: 'mobi-a', name: 'Mobi A' }, actionManagement: {
    defaults, plan: null, durations: { 'thinking.svg': 4000 }, assets: ['idle.svg', 'working.svg', 'thinking.svg'].map(name => ({ name, fileUrl: `file:///${name}` }))
  } }), command: async (action, payload) => { calls.push([action, structuredClone(payload)]); return { status: 'ok' }; } };
  w.eval(read('dashboard-actions.js'));
  const page = w.MobiDashboardActions.create({ container: w.document.getElementById('actions'), getLang: () => 'zh' });
  await page.enter();
  assert.equal(w.document.querySelectorAll('[data-action-state]').length, 7);
  assert.ok(lane(w, 'idle').querySelector('[data-action-card]'));
  assert.ok(lane(w, 'working').querySelector('[data-action-card]'));
  drag(w, lane(w, 'working').querySelector('[data-action-card]'), lane(w, 'idle'));
  assert.equal(lane(w, 'working').querySelectorAll('[data-action-card]').length, 0);
  assert.equal(lane(w, 'idle').querySelectorAll('[data-action-card]').length, 2);
  drag(w, w.document.querySelector('[data-library-file="thinking.svg"]'), lane(w, 'working'));
  let card = lane(w, 'working').querySelector('[data-action-card]');
  assert.equal(card.querySelector('input'), null, 'action timing cannot be edited');
  assert.equal(card.querySelector('.pet-action-title').textContent, '思考');
  assert.equal(w.document.querySelector('.pet-action-timing'), null, 'cards do not display seconds');
  assert.equal(w.document.querySelector('[data-move-up], [data-move-down]'), null, 'sorting uses drag-and-drop');
  assert.equal(w.document.querySelector('.pet-action-card button, .pet-action-card select, .pet-action-card input'), null, 'state and library cards have no controls');
  lane(w, 'working').querySelector('[data-play-mode="random"]').click();
  assert.equal(w.document.querySelector('[data-enabled]'), null, 'state membership replaces the enabled switch');
  w.document.querySelector('[data-save-actions]').click(); await tick();
  assert.equal(calls[0][0], 'setPetActionPlan');
  assert.deepEqual(calls[0][1].plan.states.working, { mode: 'random', actions: [{ file: 'thinking.svg', enabled: true, durationMs: 4000 }] });
  assert.deepEqual(calls[0][1].plan.states.idle.actions.map(a => a.file), ['idle.svg', 'working.svg']);
  page.leave(); dom.window.close();
});

test('a save finishing after a theme switch refreshes the active theme and never marks the new draft saved',async()=>{
  const dom=new JSDOM('<div id="actions"></div>',{runScripts:'outside-only'}),w=dom.window;w.eval(read('pet-states.js')); w.eval(read('pet-action-plan.js'));
  let theme='A',changed,finish;const defaults={version:1,states:{idle:{mode:'sequence',actions:[{file:'idle.svg',enabled:true,durationMs:5000}]}}};
  w.settingsAPI={getAnimationOverridesData:async()=>({theme:{id:theme,name:theme},actionManagement:{defaults,plan:null,assets:[{name:'idle.svg',fileUrl:'file:///idle.svg'}]}}),onChanged:fn=>{changed=fn;},command:()=>new Promise(r=>{finish=r;})};
  w.eval(read('dashboard-actions.js'));const page=w.MobiDashboardActions.create({container:w.document.getElementById('actions'),getLang:()=> 'zh'});await page.enter();
  w.document.querySelector('[data-save-actions]').click();theme='B';changed({changes:{theme:'B'}});finish({status:'ok'});await tick();await tick();
  assert.equal(w.document.querySelector('.pet-actions-heading small').textContent,'B');
  assert.equal(w.document.querySelector('.pet-actions-notice').textContent,'');page.leave();w.close();
});

test('older main process data explains the required restart and can be retried', async () => {
  const dom = new JSDOM('<div id="actions"></div>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(read('pet-states.js')); w.eval(read('pet-action-plan.js'));
  const defaults = w.MobiPetActions.defaultPlan({ states: { idle: ['idle.svg'] } });
  let response = { theme: { id: 'mobi-c', name: 'Mobi C' }, assets: [], sections: [] };
  w.settingsAPI = { getAnimationOverridesData: async () => response };
  w.eval(read('dashboard-actions.js'));
  const page = w.MobiDashboardActions.create({ container: w.document.getElementById('actions'), getLang: () => 'zh' });
  await page.enter();
  assert.match(w.document.getElementById('actions').textContent, /完全退出.*重新启动/);
  response = { ...response, actionManagement: { defaults, plan: null, assets: [{ name: 'idle.svg', fileUrl: 'file:///idle.svg' }] } };
  w.document.querySelector('[data-reload-actions]').click();
  await tick();
  assert.equal(w.document.querySelectorAll('[data-action-state]').length, 7);
  page.leave();
  w.close();
});


test('moving the last enabled idle action is prevented and same-state dropping reorders', async () => {
  const dom = new JSDOM('<div id="actions"></div>', { runScripts: 'outside-only' }), w = dom.window;
  w.eval(read('pet-states.js')); w.eval(read('pet-action-plan.js'));
  const defaults = w.MobiPetActions.defaultPlan({ states: { idle: ['idle.svg'], working: ['one.svg'] } });
  defaults.states.working.actions.push({ file: 'two.svg', enabled: true, durationMs: 5000 });
  w.settingsAPI = { getAnimationOverridesData: async () => ({ theme: { id: 'pet', name: 'Pet' }, actionManagement: { defaults, assets: [] } }) };
  w.eval(read('dashboard-actions.js'));
  const page = w.MobiDashboardActions.create({ container: w.document.getElementById('actions'), getLang: () => 'zh' }); await page.enter();
  drag(w, lane(w, 'idle').querySelector('[data-action-card]'), lane(w, 'error'));
  assert.equal(lane(w, 'idle').querySelectorAll('[data-action-card]').length, 1);
  let cards = lane(w, 'working').querySelectorAll('[data-action-card]');
  drag(w, cards[1], cards[0]);
  assert.deepEqual([...lane(w, 'working').querySelectorAll('[data-action-card]')].map(c => c.dataset.file), ['two.svg', 'one.svg']);
  page.leave(); w.close();
});

test('ordinary previews use animated assets and script previews live only while hovered', async () => {
  const dom = new JSDOM('<div id="actions"></div>', { runScripts: 'outside-only' }), w = dom.window;
  w.eval(read('pet-states.js')); w.eval(read('pet-action-plan.js'));
  const defaults = w.MobiPetActions.defaultPlan({ states: { idle: ['idle.svg'], working: ['script.svg'] } });
  w.settingsAPI = { getAnimationOverridesData: async () => ({ theme: { id: 'pet', name: 'Pet' }, actionManagement: { defaults, assets: [
    { name: 'idle.svg', fileUrl: 'file:///idle.svg', previewImageUrl: 'data:image/png;base64,poster' },
    { name: 'script.svg', fileUrl: 'file:///script.svg', previewImageUrl: 'data:image/png;base64,poster', needsScriptedPreviewPoster: true },
  ] } }) };
  w.eval(read('dashboard-actions.js'));
  const page = w.MobiDashboardActions.create({ container: w.document.getElementById('actions'), getLang: () => 'zh' }); await page.enter();
  assert.equal(lane(w, 'idle').querySelector('img').src, 'data:image/png;base64,poster');
  assert.equal(w.document.querySelector('[data-preview-action]'), null, 'hover previews should not need a play button');
  const card = lane(w, 'working').querySelector('[data-action-card]');
  assert.equal(card.querySelector('iframe'), null);
  card.dispatchEvent(new w.Event('mouseenter'));
  const frame = card.querySelector('iframe'); assert.ok(frame);
  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
  card.dispatchEvent(new w.Event('mouseleave')); assert.equal(card.querySelector('iframe'), null);
  card.dispatchEvent(new w.Event('mouseenter')); page.leave();
  assert.equal(card.querySelector('iframe'), null);
  w.close();
});

test('canvas expands on demand and leaving restores the application layout', async () => {
  const dom = new JSDOM('<div id="actionsPage"><div id="actions"></div></div>', { runScripts: 'outside-only' }), w = dom.window;
  w.eval(read('pet-states.js')); w.eval(read('pet-action-plan.js'));
  const defaults = w.MobiPetActions.defaultPlan({ states: { idle: ['idle.svg'] } });
  let entered = 0, exited = 0;
  const canvas = w.document.getElementById('actionsPage');
  canvas.requestFullscreen = async () => { entered++; };
  w.document.exitFullscreen = async () => { exited++; };
  w.settingsAPI = { getAnimationOverridesData: async () => ({ theme: { id: 'pet', name: 'Pet' }, actionManagement: { defaults, assets: [] } }) };
  w.eval(read('dashboard-actions.js'));
  const page = w.MobiDashboardActions.create({ container: w.document.getElementById('actions'), getLang: () => 'zh' }); await page.enter();
  w.document.querySelector('[data-expand-actions]').click();
  assert.equal(entered, 1); assert.ok(w.document.body.classList.contains('pet-actions-expanded'));
  Object.defineProperty(w.document, 'fullscreenElement', { value: canvas, configurable: true });
  page.leave(); assert.equal(exited, 1); assert.ok(!w.document.body.classList.contains('pet-actions-expanded'));
  w.close();
});

test('late fullscreen entry is cancelled after leaving or collapsing the canvas', async () => {
  for (const exitEarly of ['leave', 'collapse']) {
    const dom = new JSDOM('<div id="actionsPage"><div id="actions"></div></div>', { runScripts: 'outside-only' }), w = dom.window;
    w.eval(read('pet-states.js')); w.eval(read('pet-action-plan.js'));
    const defaults = w.MobiPetActions.defaultPlan({ states: { idle: ['idle.svg'] } });
    let finish, exited = 0;
    const canvas = w.document.getElementById('actionsPage');
    canvas.requestFullscreen = () => new Promise(resolve => { finish = resolve; });
    w.document.exitFullscreen = async () => { exited++; };
    w.settingsAPI = { getAnimationOverridesData: async () => ({ theme: { id: 'pet', name: 'Pet' }, actionManagement: { defaults, assets: [] } }) };
    w.eval(read('dashboard-actions.js'));
    const page = w.MobiDashboardActions.create({ container: w.document.getElementById('actions'), getLang: () => 'zh' }); await page.enter();
    w.document.querySelector('[data-expand-actions]').click();
    if (exitEarly === 'leave') page.leave(); else w.document.querySelector('[data-expand-actions]').click();
    Object.defineProperty(w.document, 'fullscreenElement', { value: canvas, configurable: true });
    finish(); w.document.dispatchEvent(new w.Event('fullscreenchange'));
    assert.equal(exited, 1, `late fullscreen should be exited after ${exitEarly}`);
    assert.ok(!w.document.body.classList.contains('pet-actions-expanded'));
    Object.defineProperty(w.document, 'fullscreenElement', { value: null, configurable: true });
    page.leave(); w.close();
  }
});

test('a drag from the previous theme cannot move an action in the new theme', async () => {
  const dom = new JSDOM('<div id="actions"></div>', { runScripts: 'outside-only' }), w = dom.window;
  w.eval(read('pet-states.js')); w.eval(read('pet-action-plan.js'));
  let theme = 'A', changed;
  w.settingsAPI = { getAnimationOverridesData: async () => ({ theme: { id: theme, name: theme }, actionManagement: {
    defaults: w.MobiPetActions.defaultPlan({ states: { idle: ['idle.svg'], working: [theme === 'A' ? 'type.svg' : 'build.svg'] } }), assets: []
  } }), onChanged: fn => { changed = fn; } };
  w.eval(read('dashboard-actions.js'));
  const page = w.MobiDashboardActions.create({ container: w.document.getElementById('actions'), getLang: () => 'zh' }); await page.enter();
  lane(w, 'working').querySelector('[data-action-card]').dispatchEvent(new w.Event('dragstart', { bubbles: true }));
  theme = 'B'; changed({ changes: { theme: 'B' } }); await tick();
  lane(w, 'waiting').dispatchEvent(new w.Event('drop', { bubbles: true, cancelable: true }));
  assert.equal(lane(w, 'working').querySelector('[data-action-card]').dataset.file, 'build.svg');
  assert.equal(lane(w, 'waiting').querySelector('[data-action-card]'), null);
  page.leave(); w.close();
});


test('hover previews replay automatically and release their timers when the pointer leaves', async () => {
  const dom = new JSDOM('<div id="actions"></div>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(read('pet-states.js')); w.eval(read('pet-action-plan.js'));
  const defaults = w.MobiPetActions.defaultPlan({ states: { idle: ['idle.svg'] } });
  const timers = new Map();
  let nextTimer = 0;
  w.setTimeout = (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { callback, delay });
    return id;
  };
  w.clearTimeout = id => timers.delete(id);
  let commands = 0;
  w.settingsAPI = {
    getAnimationOverridesData: async () => ({ theme: { id: 'pet', name: 'Pet' }, actionManagement: {
      defaults, assets: [{ name: 'idle.svg', fileUrl: 'file:///idle.svg', previewImageUrl: 'data:image/png;base64,poster', cycleMs: 1200 }]
    } }),
    command: async () => { commands++; return { status: 'ok' }; }
  };
  w.eval(read('dashboard-actions.js'));
  const page = w.MobiDashboardActions.create({ container: w.document.getElementById('actions'), getLang: () => 'zh' });
  await page.enter();
  try {
    for (const card of w.document.querySelectorAll('.pet-action-card')) {
      assert.equal(card.querySelector('button[aria-label="播放预览"]'), null);
      const image = card.querySelector('img');
      assert.equal(image.src, 'data:image/png;base64,poster');
      card.dispatchEvent(new w.Event('mouseenter'));
      assert.match(image.src, /^file:\/\/\/idle.svg\?_preview=/);
      const firstUrl = image.src;
      assert.equal(timers.size, 1);
      const [id, timer] = [...timers][0];
      assert.equal(timer.delay, 1200);
      timers.delete(id);
      timer.callback();
      assert.notEqual(image.src, firstUrl);
      assert.equal(timers.size, 1);
      card.dispatchEvent(new w.Event('mouseleave'));
      assert.equal(image.src, 'data:image/png;base64,poster');
      assert.equal(timers.size, 0);
    }
    assert.equal(commands, 0, 'previewing must not change pet preferences or runtime actions');
    assert.equal(w.document.querySelector('.pet-actions-notice').textContent, '');
  } finally {
    page.leave();
    w.close();
  }
});

test('animated assets without a poster stay frozen until hovered and freeze again on leaving', async () => {
  for (const scripted of [false, true]) {
    const dom = new JSDOM('<div id="actions"></div>', { runScripts: 'outside-only' });
    const w = dom.window;
    w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
    w.eval(read('pet-states.js')); w.eval(read('pet-action-plan.js'));
    const defaults = w.MobiPetActions.defaultPlan({ states: { idle: ['idle.svg'] } });
    w.settingsAPI = { getAnimationOverridesData: async () => ({ theme: { id: 'pet', name: 'Pet' }, actionManagement: {
      defaults, assets: [{ name: 'idle.svg', fileUrl: 'file:///idle.svg', previewImageUrl: 'file:///idle.svg', needsScriptedPreviewPoster: scripted }]
    } }) };
    w.eval(read('dashboard-actions.js'));
    const page = w.MobiDashboardActions.create({ container: w.document.getElementById('actions'), getLang: () => 'zh' });
    await page.enter();
    try {
      const card = lane(w, 'idle').querySelector('[data-action-card]');
      const image = card.querySelector('img');
      Object.defineProperties(image, { naturalWidth: { value: 160 }, naturalHeight: { value: 180 } });
      image.dispatchEvent(new w.Event('load'));
      assert.equal(image.hidden, true, 'the animated image should be replaced by a still frame');
      const still = card.querySelector('canvas');
      assert.ok(still);
      assert.equal(still.hidden, false);
      card.dispatchEvent(new w.Event('mouseenter'));
      assert.equal(image.hidden, scripted);
      assert.equal(still.hidden, true);
      assert.equal(Boolean(card.querySelector('iframe')), scripted);
      image.dispatchEvent(new w.Event('load'));
      assert.equal(image.hidden, scripted, 'a reload during hover should keep playing');
      card.dispatchEvent(new w.Event('mouseleave'));
      assert.equal(image.hidden, true);
      assert.equal(still.hidden, false);
      assert.equal(card.querySelector('iframe'), null);
    } finally {
      page.leave();
      w.close();
    }
  }
});


test('returning an action to the library and other states always uses its native timing', async () => {
  const dom = new JSDOM('<div id="actions"></div>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(read('pet-states.js')); w.eval(read('pet-action-plan.js'));
  const defaults = w.MobiPetActions.defaultPlan({ states: { idle: ['idle.svg'], working: ['working.svg'] } });
  defaults.states.working.actions[0].durationMs = 2300;
  const saved = [];
  w.settingsAPI = {
    getAnimationOverridesData: async () => ({ theme: { id: 'pet', name: 'Pet' }, actionManagement: {
      defaults, durations: { 'working.svg': 4000 }, labels: { 'working.svg': '疯狂赶工' }, assets: ['idle.svg', 'working.svg'].map(name => ({ name, fileUrl: `file:///${name}` }))
    } }),
    command: async (command, payload) => { saved.push(structuredClone(payload.plan)); return { status: 'ok' }; }
  };
  w.eval(read('dashboard-actions.js'));
  const page = w.MobiDashboardActions.create({ container: w.document.getElementById('actions'), getLang: () => 'zh' });
  await page.enter();
  try {
    drag(w, lane(w, 'working').querySelector('[data-action-card]'), w.document.querySelector('.pet-actions-library'));
    assert.equal(lane(w, 'working').querySelector('[data-action-card]'), null);
    assert.ok(w.document.querySelector('[data-library-file="working.svg"]'));
    w.document.querySelector('[data-save-actions]').click();
    await tick();
    assert.deepEqual(saved[0].states.working.actions, [{ file: 'working.svg', enabled: false, durationMs: 4000 }]);
    drag(w, w.document.querySelector('[data-library-file="working.svg"]'), lane(w, 'working'));
    assert.equal(lane(w, 'working').querySelector('.pet-action-title').textContent, '疯狂赶工');
    assert.equal(lane(w, 'working').querySelector('input'), null);
    assert.equal(w.document.querySelector('input[type="checkbox"]'), null);
    w.document.querySelector('[data-save-actions]').click();
    await tick();
    assert.deepEqual(saved[1].states.working.actions, [{ file: 'working.svg', enabled: true, durationMs: 4000 }]);
    drag(w, lane(w, 'working').querySelector('[data-action-card]'), w.document.querySelector('.pet-actions-library'));
    drag(w, w.document.querySelector('[data-library-file="working.svg"]'), lane(w, 'error'));
    assert.equal(lane(w, 'error').querySelector('.pet-action-title').textContent, '疯狂赶工');
    drag(w, lane(w, 'error').querySelector('[data-action-card]'), lane(w, 'working'));
    assert.equal(lane(w, 'error').querySelector('[data-action-card]'), null);
    assert.equal(lane(w, 'working').querySelectorAll('[data-action-card]').length, 1);
    w.document.querySelector('[data-save-actions]').click();
    await tick();
    assert.deepEqual(saved[2].states.working.actions, [{ file: 'working.svg', enabled: true, durationMs: 4000 }]);
    drag(w, lane(w, 'idle').querySelector('[data-action-card]'), w.document.querySelector('.pet-actions-library'));
    assert.ok(lane(w, 'idle').querySelector('[data-action-card]'), 'the last idle action must remain available');
  } finally { page.leave(); w.close(); }
});

test('legacy disabled actions stay out of states and visible sorting skips them', async () => {
  const dom = new JSDOM('<div id="actions"></div>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(read('pet-states.js')); w.eval(read('pet-action-plan.js'));
  const defaults = w.MobiPetActions.defaultPlan({ states: { idle: ['idle.svg'], working: ['one.svg'] } });
  defaults.states.working.actions.push(
    { file: 'retired.svg', enabled: false, durationMs: 4000 },
    { file: 'two.svg', enabled: true, durationMs: 5000 }
  );
  let saved;
  w.settingsAPI = {
    getAnimationOverridesData: async () => ({ theme: { id: 'pet', name: 'Pet' }, actionManagement: {
      defaults, durations: { 'retired.svg': 4000 }, assets: ['idle.svg', 'one.svg', 'retired.svg', 'two.svg'].map(name => ({ name, fileUrl: `file:///${name}` }))
    } }),
    command: async (_command, payload) => { saved = structuredClone(payload.plan); return { status: 'ok' }; }
  };
  w.eval(read('dashboard-actions.js'));
  const page = w.MobiDashboardActions.create({ container: w.document.getElementById('actions'), getLang: () => 'zh' });
  await page.enter();
  try {
    const visibleFiles = () => [...lane(w, 'working').querySelectorAll('[data-action-card]')].map(card => card.dataset.file);
    assert.deepEqual(visibleFiles(), ['one.svg', 'two.svg']);
    drag(w, lane(w, 'working').querySelector('[data-file="two.svg"]'), lane(w, 'working').querySelector('[data-file="one.svg"]'));
    assert.deepEqual(visibleFiles(), ['two.svg', 'one.svg']);
    drag(w, lane(w, 'working').querySelector('[data-file="one.svg"]'), w.document.querySelector('.pet-actions-library'));
    assert.deepEqual(visibleFiles(), ['two.svg']);
    drag(w, w.document.querySelector('[data-library-file="retired.svg"]'), lane(w, 'working'));
    assert.equal(lane(w, 'working').querySelector('[data-file="retired.svg"] .pet-action-title').textContent, 'retired');
    w.document.querySelector('[data-save-actions]').click();
    await tick();
    assert.deepEqual(saved.states.working.actions.filter(a => a.enabled).map(a => a.file), ['two.svg', 'retired.svg']);
  } finally { page.leave(); w.close(); }
});
