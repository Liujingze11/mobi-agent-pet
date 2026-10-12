'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {resolveAppModePolicy,createAppModeController}=require('../src/app-mode');
const {defaultCustomModeProfile}=require('../src/custom-mode-profile');
const {isSessionInProgress}=require('../src/state-session-snapshot');

test('fixed modes keep awake despite disabled legacy and custom preferences; Custom retains its own switch',()=>{
 const snapshot={keepAwakeWhileWorking:false,customModeProfile:{...defaultCustomModeProfile(),keepAwake:false}};
 for(const mode of ['normal','background','automatic'])assert.equal(resolveAppModePolicy(mode,snapshot).keepAwakeWhileWorking,true,mode);
 assert.equal(resolveAppModePolicy('custom',snapshot).keepAwakeWhileWorking,false);
 snapshot.customModeProfile.keepAwake=true;
 assert.equal(resolveAppModePolicy('custom',snapshot).keepAwakeWhileWorking,true);
 assert.equal(defaultCustomModeProfile().keepAwake,false);
});

test('mode transitions preserve the existing blocker through work and waiting, release on completion and Custom off',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
 const start=source.indexOf('let powerSaveBlockerId = null;'),end=source.indexOf('// ── Hit-test:',start);
 const calls=[],active=new Set(),sessions=new Map();let nextId=0;
 const context={sessions,isSessionInProgress,keepAwakeWhileWorking:false,console,powerSaveBlocker:{
  start(type){calls.push(['start',type]);const id=++nextId;active.add(id);return id;},
  stop(id){calls.push(['stop',id]);active.delete(id);},isStarted:id=>active.has(id),
 }};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const snapshot={keepAwakeWhileWorking:false,customModeProfile:{...defaultCustomModeProfile(),keepAwake:false}};
 let controller;controller=createAppModeController({getSettingsSnapshot:()=>snapshot,syncModeFeatures:()=>{
  context.keepAwakeWhileWorking=controller.getEffectiveAppModePolicy().keepAwakeWhileWorking;
  context.reconcilePowerSaveBlocker();
 }});
 context.keepAwakeWhileWorking=controller.getEffectiveAppModePolicy().keepAwakeWhileWorking;
 sessions.set('task',{state:'working'});context.reconcilePowerSaveBlocker();assert.deepEqual(calls,[['start','prevent-app-suspension']]);
 for(const mode of ['background','automatic','normal']){
  assert.equal((await controller.setActiveAppMode(mode,{confirmed:true})).status,'ok');
  assert.equal(active.size,1);assert.equal(calls.length,1,'switching presets must not restart the blocker');
 }
 sessions.set('task',{state:'notification'});context.reconcilePowerSaveBlocker();assert.equal(calls.length,1,'waiting keeps the existing blocker');
 sessions.set('task',{state:'idle'});context.reconcilePowerSaveBlocker();assert.equal(active.size,0);assert.equal(calls.at(-1)[0],'stop');
 sessions.set('headless',{state:'working',headless:true});context.reconcilePowerSaveBlocker();assert.equal(active.size,0);
 sessions.set('task',{state:'working'});context.reconcilePowerSaveBlocker();assert.equal(active.size,1);
 assert.equal((await controller.setActiveAppMode('custom')).status,'ok');assert.equal(active.size,0);
 assert.equal((await controller.setActiveAppMode('normal')).status,'ok');assert.equal(active.size,1);
 context.releasePowerSaveBlocker();assert.equal(active.size,0);
});
