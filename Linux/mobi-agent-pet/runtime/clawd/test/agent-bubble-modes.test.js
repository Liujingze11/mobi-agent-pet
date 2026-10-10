"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveAppModePolicy,createAppModeController}=require('../src/app-mode');
const model=require('../src/custom-mode-profile');
const permission=require('../src/permission');

test('fixed presets show Agent bubbles only in Normal and Background, with tray alerts in all three',()=>{
  for(const [mode,enabled] of [['normal',true],['background',true],['automatic',false]]) {
    const p=resolveAppModePolicy(mode,{hideBubbles:true,customModeProfile:{agentBubbles:false,trayAlerts:false}});
    assert.equal(p.trayAlerts,true,mode+' tray reminders');
    assert.equal(p.permissionBubblePolicy.enabled,enabled,mode+' approvals');
    assert.equal(p.notificationBubblePolicy.enabled,enabled,mode+' notifications');
  }
});
test('Background hides the pet without activating DND or granting automatic approvals',async()=>{
  let hidden=false,dnd=true;
  const c=createAppModeController({hidePet:()=>{hidden=true},isPetHidden:()=>hidden,enableDoNotDisturb:()=>{dnd=true},disableDoNotDisturb:()=>{dnd=false}});
  await c.setActiveAppMode('background');
  assert.equal(hidden,true);assert.equal(dnd,false);
  assert.equal(c.resolvePermissionAutomationMode(c.capturePermissionRequest()),'off');
});
test('one Custom bubble switch controls both card types and cannot re-enable pet following',()=>{
  const profile={...model.defaultCustomModeProfile(),agentBubbles:false};
  const p=resolveAppModePolicy('custom',{customModeProfile:profile,bubbleFollowPet:true});
  assert.equal(p.permissionBubblePolicy.enabled,false);
  assert.equal(p.notificationBubblePolicy.enabled,false);
  assert.notEqual(p.bubbleFollowPet,true);
  const old=model.normalizeCustomModeProfile({permissionBubbles:false,notificationBubbles:false,bubbleFollow:true,trayAlerts:false,notificationSeconds:14});
  assert.equal(old.agentBubbles,false);assert.equal(old.trayAlerts,false);assert.equal(old.notificationSeconds,14);
  assert.equal(Object.hasOwn(old,'bubbleFollow'),false);
  assert.equal(model.normalizeCustomModeProfile({permissionBubbles:false,notificationBubbles:true}).agentBubbles,true);
});
test('even obsolete follow settings cannot move bubble stacks away from the bottom-right corner',()=>{
  assert.deepEqual(permission.__test.computeBubbleStackLayout({followPet:true,bubbleWidth:340,bubbleHeights:[150,150],margin:8,gap:6,workArea:{x:0,y:0,width:1920,height:1080},hitRect:{left:800,top:400,right:920,bottom:500},hudReservedOffset:90}),[
    {x:1572,y:766,width:340,height:150},{x:1572,y:922,width:340,height:150},
  ]);
});
test('all bubble payloads carry the originating Agent identity, including passive and family cards',()=>{
  const api=permission({sessions:new Map([['s',{agentId:'gemini-cli'}]]),subscribeShortcuts:()=>()=>{}});
  for(const [entry,want] of [[{agentId:'opencode'},'opencode'],[{isCodexUserInputNotify:true},'codex'],[{isKimiNotify:true},'kimi-cli'],[{sessionId:'s'},'gemini-cli'],[{},'claude-code']]) {
    assert.equal(api.buildPermissionBubblePayload(entry).agentId,want);
  }
});
test('hidden pet states still produce completion and error tray reminders through the production Agent callback',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const {createTrayStatusLightController,resolveTrayStatus,shouldPulseTrayForAgentEvent}=require('../src/tray-status-light');
  const tray=createTrayStatusLightController({setIcon:()=>{},timers:{setTimeout:()=>1,setInterval:()=>2,clearTimeout(){},clearInterval(){}}});
  const main=fs.readFileSync(require('node:path').join(__dirname,'../src/main.js'),'utf8');
  const callback=main.match(/onTrayAgentEvent: (\(input\) => \{[\s\S]*?\n  \}),/)[1];
  let pending=false;
  const invoke=vm.runInNewContext(callback,{trayStatusController:tray,doNotDisturb:false,shouldPulseTrayForAgentEvent,getEffectiveAppModePolicy:()=>resolveAppModePolicy('background'),hasPendingPermissionForTray:()=>pending,flashTaskbar:()=>tray.complete(),syncTrayStatus:state=>tray.setStatus(resolveTrayStatus({state,hasPendingPermission:pending}))});
  for(const state of ['complete','attention']) {
    tray.stop();invoke({state,event:'Stop'});assert.equal(tray.getPhase(),'completion');
  }
  invoke({state:'error',event:'PostToolUseFailure'});assert.equal(tray.getStatus(),'error');tray.stop();
  pending=true;invoke({state:'complete',event:'Stop'});assert.equal(tray.getStatus(),'question');tray.stop();
});
