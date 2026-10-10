'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {resolveAppModePolicy,createAppModeController}=require('../src/app-mode');
const {createSettingsController}=require('../src/settings-controller');
const prefs=require('../src/prefs');
test('built-in policies ignore saved behavior and approval overrides',()=>{
 const poisoned={permissionAutomationMode:'unattended',sessionHudEnabled:false,flashTaskbarOnComplete:false,hideBubbles:true,customModeProfile:{petVisible:false,states:['idle'],trayAlerts:false}};
 assert.equal(resolveAppModePolicy('normal',poisoned).permissionAutomationMode,'off');
 assert.equal(resolveAppModePolicy('normal',poisoned).sessionHudEnabled,true);
 assert.equal(resolveAppModePolicy('normal',poisoned).trayAlerts,true);
 assert.deepEqual(resolveAppModePolicy('normal',poisoned).permissionBubblePolicy,{enabled:true,autoCloseMs:0});
 assert.deepEqual(resolveAppModePolicy('normal',poisoned).notificationBubblePolicy,{enabled:true,autoCloseMs:6000});
 assert.equal(resolveAppModePolicy('automatic',poisoned).permissionAutomationMode,'unattended');
 assert.equal(resolveAppModePolicy('background',poisoned).hidePet,true);
});
test('custom profile configures mode behavior without changing the three presets',()=>{
 const policy=resolveAppModePolicy('custom',{customModeProfile:{petVisible:true,states:['idle','working','error'],trayAlerts:false,permissionBubbles:false,notificationBubbles:true,notificationSeconds:12,sessionHud:false,permissionAutomationMode:'auto-tools'}});
 assert.deepEqual(policy.allowedPetStates,['idle','working','error']);
 assert.equal(policy.allowRoamAnimation,false);
 assert.equal(policy.sessionHudEnabled,false);
 assert.deepEqual(policy.notificationBubblePolicy,{enabled:true,autoCloseMs:12000});
 assert.equal(policy.permissionAutomationMode,'auto-tools');
});
test('custom profile validates canonical states and requires idle for fallback',()=>{
 const model=require('../src/custom-mode-profile');
 const profile=model.defaultCustomModeProfile();
 assert.equal(model.validateCustomModeProfile(profile),null);
 assert.match(model.validateCustomModeProfile({...profile,states:['working']}),/idle/);
 assert.match(model.validateCustomModeProfile({...profile,states:['idle','sleeping']}),/state/i);
 assert.match(model.validateCustomModeProfile({...profile,soundEnabled:true}),/unknown/i);
 assert.match(model.validateCustomModeProfile({...profile,permissionAutomationMode:'anything'}),/approval/i);
});
test('custom profile persists only through its command, while launch stays Normal',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mobi-custom-mode-')),prefsPath=path.join(dir,'prefs.json');
 const controller=createSettingsController({prefsPath});
 try{
  const profile=require('../src/custom-mode-profile').defaultCustomModeProfile();profile.states=['idle','working'];profile.trayAlerts=false;profile.roamIntervalSeconds=300;
  assert.equal((await controller.applyUpdate('customModeProfile',profile)).status,'error');
  assert.equal((await controller.applyCommand('setCustomModeProfile',{profile})).status,'ok');
  assert.deepEqual(prefs.load(prefsPath).snapshot.customModeProfile,profile);
  const modes=createAppModeController({getSettingsSnapshot:()=>controller.getSnapshot()});
  await modes.setActiveAppMode('custom');assert.equal(modes.getActiveAppMode(),'custom');
  assert.equal(createAppModeController({getSettingsSnapshot:()=>controller.getSnapshot()}).getActiveAppMode(),'normal');
 }finally{controller.dispose();fs.rmSync(dir,{recursive:true,force:true})}
});

test('Normal permission requests cannot inherit legacy automatic approval settings',()=>{
 const controller=createAppModeController();
 assert.equal(controller.resolvePermissionAutomationMode(controller.capturePermissionRequest(),'unattended'),'off');
});
test('Custom automatic approvals require consent and profile edits invalidate older requests',async()=>{
 const profile=require('../src/custom-mode-profile').defaultCustomModeProfile();profile.permissionAutomationMode='auto-tools';
 const controller=createAppModeController({getSettingsSnapshot:()=>({customModeProfile:profile})});
 assert.equal((await controller.setActiveAppMode('custom')).status,'confirmation-required');
 await controller.setActiveAppMode('custom',{confirmed:true});
 const before=controller.capturePermissionRequest();
 assert.equal(controller.resolvePermissionAutomationMode(before,'unattended'),'auto-tools');
 profile.permissionAutomationMode='unattended';
 assert.equal(controller.resolvePermissionAutomationMode(before,'unattended'),'off');
 assert.equal((await controller.refreshCustomMode()).status,'confirmation-required');
 await controller.refreshCustomMode({confirmed:true});
 assert.equal(controller.resolvePermissionAutomationMode(controller.capturePermissionRequest(),'off'),'unattended');
 await controller.setActiveAppMode('normal');assert.equal(controller.resolvePermissionAutomationMode(before,'unattended'),'off');
});
test('Custom display applies hidden and selected-state policies without changing built-ins',async()=>{
 const profile=require('../src/custom-mode-profile').defaultCustomModeProfile();profile.petVisible=false;
 let hidden=false,state='working',cancelled=0;
 const controller=createAppModeController({getSettingsSnapshot:()=>({customModeProfile:profile}),isPetHidden:()=>hidden,hidePet:()=>{hidden=true},showPet:()=>{hidden=false},cancelPetHeld:()=>cancelled++,resolveDisplayState:()=> 'working',applyState:value=>{state=value}});
 await controller.setActiveAppMode('custom');assert.equal(hidden,true);assert.equal(cancelled,1);
 profile.petVisible=true;profile.states=['idle','error'];await controller.refreshCustomMode();assert.equal(hidden,false);assert.equal(state,'idle');
 await controller.setActiveAppMode('normal');assert.equal(state,'working');
});

test('saving active Custom approval escalation is gated before persistence and does not affect presets',async()=>{
 const {defaultCustomModeProfile}=require('../src/custom-mode-profile'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'mobi-custom-save-'));
 let active='custom';const controller=createSettingsController({prefsPath:path.join(dir,'prefs.json'),injectedDeps:{getActiveAppMode:()=>active}});
 try{
  const profile={...defaultCustomModeProfile(),permissionAutomationMode:'unattended'};
  assert.equal((await controller.applyCommand('setCustomModeProfile',{profile})).status,'confirmation-required');assert.equal(controller.get('customModeProfile').permissionAutomationMode,'off');
  active='normal';assert.equal((await controller.applyCommand('setCustomModeProfile',{profile})).status,'ok');
  const modes=createAppModeController({getSettingsSnapshot:()=>controller.getSnapshot()});
  assert.equal(modes.resolvePermissionAutomationMode(modes.capturePermissionRequest()),'off');
  assert.equal((await modes.setActiveAppMode('custom')).status,'confirmation-required');
 }finally{controller.dispose();fs.rmSync(dir,{recursive:true,force:true})}
});

test('mode feature projection applies target rules before commit and failure restores the prior preset',async()=>{
 let fail=true,controller;const projected=[];
 controller=createAppModeController({syncModeFeatures:()=>{projected.push(controller.getEffectiveAppModePolicy().hidePet);if(fail&&projected.at(-1))throw new Error('projection failed')}});
 assert.equal((await controller.setActiveAppMode('background')).status,'error');assert.equal(controller.getActiveAppMode(),'normal');assert.deepEqual(projected,[true,false]);
 fail=false;assert.equal((await controller.setActiveAppMode('background')).status,'ok');assert.equal(controller.getActiveAppMode(),'background');
});

test('Custom consent is tied to the profile shown before a confirmation dialog',async()=>{
 const {createAppModeRuntime}=require('../src/app-mode'),model=require('../src/custom-mode-profile');let profile={...model.defaultCustomModeProfile(),permissionAutomationMode:'auto-tools'};
 const runtime=createAppModeRuntime({getCustomModeProfile:()=>profile});const prompt=await runtime.setMode('custom');assert.equal(prompt.status,'confirmation-required');
 profile={...profile,permissionAutomationMode:'unattended'};
 const result=await runtime.setMode('custom',{confirmed:true,confirmationToken:prompt.confirmationToken});
 assert.equal(result.status,'confirmation-required');assert.equal(runtime.getMode(),'normal');assert.equal(runtime.isAutomaticAuthorized(),false);
});
test('Custom profile changing during mode application cannot commit different unapplied rules',async()=>{
 const {createAppModeRuntime}=require('../src/app-mode'),model=require('../src/custom-mode-profile');let profile=model.defaultCustomModeProfile(),applied=[];
 const runtime=createAppModeRuntime({getCustomModeProfile:()=>profile,applyMode:async(target,_previous,options)=>{applied.push(target);if(target==='custom'&&!options.rollback)profile={...profile,petVisible:false}}});
 assert.equal((await runtime.setMode('custom')).status,'error');assert.equal(runtime.getMode(),'normal');assert.deepEqual(applied,['custom','normal']);
});

test('roaming defaults to a quiet fixed interval and Custom alone can configure it',()=>{
 const model=require('../src/custom-mode-profile');const profile=model.defaultCustomModeProfile();
 assert.equal(profile.roamIntervalSeconds,120);
 assert.equal(resolveAppModePolicy('normal',{customModeProfile:{...profile,roamIntervalSeconds:300}}).roamIntervalMs,120000);
 assert.equal(resolveAppModePolicy('custom',{customModeProfile:{...profile,roamIntervalSeconds:300}}).roamIntervalMs,300000);
 for(const seconds of [0,9,3601,1.5])assert.ok(model.validateCustomModeProfile({...profile,roamIntervalSeconds:seconds}));
 const oldProfile={...profile};delete oldProfile.roamIntervalSeconds;oldProfile.trayAlerts=false;
 const restored=model.normalizeCustomModeProfile(oldProfile);assert.equal(restored.roamIntervalSeconds,120);assert.equal(restored.trayAlerts,false);
});
