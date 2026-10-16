'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePlan, defaultPlan, groupForState, createPlayer } = require('../src/pet-action-plan');
const { normalizeThemeOverrides } = require('../src/prefs');
const command = require('../src/settings-actions-pet-actions');

const plan = () => ({ version: 1, states: {
  idle: { mode: 'sequence', actions: [{ file: 'rest.svg', enabled: true, durationMs: 4000 }] },
  working: { mode: 'sequence', actions: [
    { file: 'type.svg', enabled: true, durationMs: 2000 },
    { file: 'off.svg', enabled: false, durationMs: 1000 },
    { file: 'build.svg', enabled: true, durationMs: 3000 },
  ] },
  held: { mode: 'sequence', actions: [{ file: 'lift.svg', enabled: true, durationMs: 5000 }] },
} });
test('automatic timing replaces old manual durations without changing assignments or modes', () => {
  const model = require('../src/pet-action-plan');
  const value = plan();
  value.states.working.mode = 'random';
  const clean = model.automaticPlan(value, { actionDurations: { 'type.svg': 4000, 'build.svg': 6000, 'rest.svg': 3000, 'off.svg': NaN } });
  assert.deepEqual(clean.states.working, { mode: 'random', actions: [
    { file: 'type.svg', enabled: true, durationMs: 4000 },
    { file: 'off.svg', enabled: false, durationMs: 5000 },
    { file: 'build.svg', enabled: true, durationMs: 6000 },
  ] });
  assert.equal(clean.states.idle.actions[0].durationMs, 3000);
  assert.equal(value.states.working.actions[0].durationMs, 2000, 'migration must not mutate stored settings');
  const timers = clock(), frames = [];
  const player = createPlayer({ plan: clean, timers, random: () => 0, render: file => frames.push(file) });
  player.update('working', 'fallback.svg');
  timers.advance(3999); assert.deepEqual(frames, ['type.svg']);
  timers.advance(1); assert.deepEqual(frames, ['type.svg', 'build.svg']);
  player.stop();
  assert.equal(model.automaticPlan(null, {}), null);
});

test('default plans use the native action duration instead of editable idle durations', () => {
  const clean = defaultPlan({ states: { idle: ['rest.svg'], working: ['type.svg'] },
    actionDurations: { 'rest.svg': 4000, 'type.svg': 6000, 'coffee.svg': 5000 },
    idleAnimations: [{ file: 'coffee.svg', duration: 500 }] });
  assert.deepEqual(clean.states.idle.actions.map(a => a.durationMs), [4000, 5000]);
  assert.equal(clean.states.working.actions[0].durationMs, 6000);
});
function clock() {
  let now = 0, id = 0; const tasks = new Map();
  return { setTimeout(fn, ms) { const key = ++id; tasks.set(key, { at: now + ms, fn }); return key; },
    clearTimeout(key) { tasks.delete(key); }, advance(ms) { const end = now + ms;
      for (;;) { const next = [...tasks].sort((a,b) => a[1].at-b[1].at)[0];
        if (!next || next[1].at > end) break; now = next[1].at; tasks.delete(next[0]); next[1].fn(); }
      now = end;
    }, size: () => tasks.size };
}
test('merged activity and sleep events resolve to the seven visible states', () => {
  assert.deepEqual(['idle','sleeping','yawning','dozing','collapsing','waking','thinking','working','juggling','sweeping','carrying','notification','attention','error','roam','drag'].map(groupForState),
    ['idle','idle','idle','idle','idle','idle','working','working','working','working','working','waiting','complete','error','roam','held']);
  assert.equal(groupForState('mini-enter'), 'idle');
});
test('saved plans survive preference normalization and reject paths and invalid durations', () => {
  const valid = normalizePlan(plan());
  assert.deepEqual(normalizeThemeOverrides({ pet: { actionPlan: valid } }, {}).pet.actionPlan, valid);
  const bad = plan(); bad.states.working.actions[0].file = '../outside.svg';
  assert.equal(normalizePlan(bad), null);
  bad.states.working.actions[0].file = 'type.svg'; bad.states.working.actions[0].durationMs = 0;
  assert.equal(normalizePlan(bad), null);
  const empty = plan(); empty.states.idle.actions[0].enabled = false;
  assert.equal(normalizePlan(empty), null);
});
test('defaults offer one work action and keep sleep poses as idle actions', () => {
  const value = defaultPlan({states:{idle:['rest.svg'], working:['type.svg'], thinking:['think.svg'],sleeping:['sleep.svg'],roam:['walk.svg']},reactions:{drag:{file:'lift.svg'}}});
  assert.deepEqual(value.states.working.actions.map(a=>a.file), ['type.svg']);
  assert.deepEqual(value.states.idle.actions.map(a=>a.file), ['rest.svg','sleep.svg']);
  assert.deepEqual(value.states.held.actions.map(a=>a.file), ['lift.svg']);
});
test('explicit defaults play one selected action instead of inherited idle and sleep variants', () => {
  const theme = {
    states: { idle: ['rest.svg'], sleeping: ['sleep.svg'], working: ['type.svg'] },
    idleAnimations: [{ file: 'coffee.svg' }], actionLibrary: ['build.svg'],
    actionDurations: { 'coffee.svg': 10000, 'build.svg': 6000 },
    defaultActions: { idle: 'coffee.svg', working: 'build.svg' },
  };
  const before = structuredClone(theme), timers = clock(), frames = [];
  const value = defaultPlan(theme);
  const player = createPlayer({ plan: value, timers, render: file => frames.push(file) });
  player.update('idle', 'rest.svg'); timers.advance(20000);
  assert.deepEqual(frames, ['coffee.svg', 'coffee.svg', 'coffee.svg']);
  assert.equal(value.states.idle.mode, 'sequence');
  player.update('working', 'type.svg'); timers.advance(6000);
  assert.deepEqual(frames.slice(-2), ['build.svg', 'build.svg']);
  assert.deepEqual(theme, before, 'selecting defaults must preserve library and source bindings');
  player.stop();
});
test('explicit defaults ignore unsafe or unlisted files and unknown states', () => {
  const value = defaultPlan({
    states: { idle: ['rest.svg'], working: ['type.svg'], roam: ['walk.svg'] },
    defaultActions: { idle: '../outside.svg', working: 'missing.svg', roam: 'walk.svg', bogus: 'rest.svg' },
  });
  assert.deepEqual(value.states.idle.actions.map(a => a.file), ['rest.svg']);
  assert.deepEqual(value.states.working.actions.map(a => a.file), ['type.svg']);
  assert.equal(value.states.roam.mode, 'sequence');
  assert.equal(value.states.bogus, undefined);
});
test('sequence uses each enabled action duration and does not restart across work subevents', () => {
  const timers = clock(), frames = [];
  const player = createPlayer({plan:plan(), timers, render:(file,state)=>frames.push([file,state])});
  player.update('thinking','think.svg'); timers.advance(1999);
  assert.deepEqual(frames, [['type.svg','thinking']]);
  player.update('working','type.svg'); timers.advance(1);
  assert.deepEqual(frames.at(-1), ['build.svg','working']); timers.advance(3000);
  assert.equal(frames.at(-1)[0], 'type.svg');
  player.update('notification','alert.svg');
  assert.equal(frames.at(-1)[0], 'rest.svg');
  player.stop(); assert.equal(timers.size(), 0);
});
test('random playback excludes disabled actions and avoids immediately repeating a file', () => {
  const value=plan(); value.states.working.mode='random';
  const timers=clock(), frames=[];
  const player=createPlayer({plan:value,timers,random:()=>0,render:file=>frames.push(file)});
  player.update('working','type.svg'); timers.advance(2000); timers.advance(3000);
  assert.deepEqual(frames,['type.svg','build.svg','type.svg']); player.stop();
});
test('holding overrides new Agent events until release then restores the latest state', () => {
  const timers=clock(),frames=[];
  const player=createPlayer({plan:plan(),timers,render:(file,state)=>frames.push([file,state])});
  player.update('working','type.svg'); player.hold('lift.svg');
  player.update('error','error.svg'); timers.advance(8000);
  assert.deepEqual(frames.at(-1),['lift.svg','held']);
  player.release(); assert.deepEqual(frames.at(-1),['rest.svg','error']);
  player.stop();
});
test('holding keeps an entry animation running until release and replays it on the next lift', () => {
  const timers = clock(), frames = [];
  const player = createPlayer({ plan: plan(), timers,
    render: (file, state, duration, replay) => frames.push({ file, state, replay }) });
  player.update('working', 'type.svg');
  player.hold('lift.svg');
  timers.advance(15000);
  const held = frames.filter(frame => frame.state === 'held');
  assert.deepEqual(held.map(frame => frame.replay), [true, false, false, false]);
  player.release();
  player.hold('lift.svg');
  assert.deepEqual(frames.at(-1), { file: 'lift.svg', state: 'held', replay: true });
  player.stop();
});
test('holding still switches and replays distinct assigned actions in sequence', () => {
  const value = plan(), timers = clock(), frames = [];
  value.states.held.actions.push({ file: 'sway.svg', enabled: true, durationMs: 5000 });
  const player = createPlayer({ plan: value, timers,
    render: (file, state, duration, replay) => frames.push([file, replay]) });
  player.hold('lift.svg');
  timers.advance(10000);
  assert.deepEqual(frames, [['lift.svg', true], ['sway.svg', true], ['lift.svg', true]]);
  player.stop();
});
test('saving a plan reloads only the active theme and preserves prior sound and geometry overrides', () => {
  const snapshot={theme:'pet',themeOverrides:{pet:{sounds:{complete:{file:'done.wav'}},hitbox:{wide:{'type.svg':true}}}}};
  let reloaded;
  const result=command.setPetActionPlan({themeId:'pet',plan:plan()},{snapshot,activateTheme:(id,variant,map)=>{reloaded=map;},validatePetActionFiles:()=>true});
  assert.equal(result.status,'ok'); assert.equal(reloaded.actionPlan.states.working.actions.length,3);
  assert.deepEqual(result.commit.themeOverrides.pet.sounds,snapshot.themeOverrides.pet.sounds);
  assert.equal(command.setPetActionPlan({themeId:'pet',plan:plan()},{snapshot,activateTheme(){},validatePetActionFiles:()=>false}).status,'error');
});

test('completion timing allows every enabled sequence action to finish and random completion plays one action',()=>{
  const model=require('../src/pet-action-plan'),value=plan();
  value.states.complete={mode:'sequence',actions:[{file:'one.svg',enabled:true,durationMs:2000},{file:'two.svg',enabled:true,durationMs:3000}]};
  assert.equal(model.playbackDuration(value,'complete'),5000);
  value.states.complete.mode='random';const timers=clock(),frames=[];
  const player=createPlayer({plan:value,timers,random:()=>0,render:(file,state,duration)=>frames.push([file,state,duration])});
  player.update('attention','done.svg');timers.advance(10000);
  assert.deepEqual(frames,[['one.svg','attention',2000]]);player.stop();
});

test('one action repeats at its configured interval and paused playback schedules nothing',()=>{
  const timers=clock(),frames=[];const player=createPlayer({plan:plan(),timers,render:file=>frames.push(file)});
  player.update('idle','rest.svg');timers.advance(4000);assert.deepEqual(frames,['rest.svg','rest.svg']);
  player.pause();timers.advance(8000);assert.equal(frames.length,2);assert.equal(timers.size(),0);
  player.resume();timers.advance(4000);assert.equal(frames.length,3);player.stop();
});


test('empty completion and error use idle playback mode and timing', () => {
  const model = require('../src/pet-action-plan');
  for (const state of ['attention', 'error']) {
    for (const mode of ['random', 'sequence']) {
      const value = plan(), timers = clock(), frames = [];
      value.states.idle = { mode, actions: [
        { file: 'short.svg', enabled: true, durationMs: 2000 },
        { file: 'long.svg', enabled: true, durationMs: 6000 },
      ] };
      const group = model.groupForState(state);
      const clean = normalizePlan(value);
      assert.equal(model.playbackDuration(clean, group), mode === 'random' ? 6000 : 8000);
      const player = createPlayer({ plan: value, timers, random: () => 0, render: (file) => frames.push(file) });
      player.update(state, 'unused.svg');
      timers.advance(10000);
      assert.deepEqual(frames, mode === 'random' ? ['short.svg'] : ['short.svg', 'long.svg']);
      player.stop();
    }
  }
});
test('unknown states and invalid plans never play unassigned fallback files',()=>{
 const frames=[],timers=clock();
 const valid=createPlayer({plan:plan(),timers,render:file=>frames.push(file)});
 valid.update('invented','unassigned.svg');assert.deepEqual(frames,[]);valid.stop();
 const invalid=createPlayer({plan:null,timers,render:file=>frames.push(file)});
 invalid.update('working','unassigned.svg');assert.deepEqual(frames,[]);invalid.stop();
});
