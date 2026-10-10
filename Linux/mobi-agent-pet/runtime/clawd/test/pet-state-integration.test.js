'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const loader=require('../src/theme-loader');loader.init(path.resolve(__dirname,'../src'));
function fixture(){const messages=[];const ctx={theme:loader.loadTheme('mobi-a'),doNotDisturb:false,miniMode:false,miniTransitioning:false,playSound(){},sendToRenderer:(...x)=>messages.push(x),sendToHitWin(){},syncHitWin(){},buildContextMenu(){},buildTrayMenu(){},miniPeekIn(){},miniPeekOut(){},pendingPermissions:[],t:x=>x,getCursorScreenPoint:()=>({x:0,y:0})};return{ctx,messages,state:require('../src/state')(ctx)}};
test('real desktop state ingress and IPC expose only canonical states',()=>{const h=fixture();try{for(const [input,want] of [['thinking','working'],['sweeping','working'],['notification','waiting'],['attention','complete'],['sleeping','idle'],['mini-working','working']]){h.state.applyState(input);assert.equal(h.state.getCurrentState(),want);}h.state.applyState('invented');assert.equal(h.state.getCurrentState(),'working');assert.ok(h.messages.filter(x=>x[0]==='state-change').every(x=>['idle','roam','working','waiting','complete','error','held'].includes(x[1])));}finally{h.state.cleanup()}});
test('held state in main process survives task events until release',()=>{const h=fixture();try{h.state.applyState('working');h.state.setPetHeld(true);h.state.applyState('error');assert.equal(h.state.getCurrentState(),'held');h.state.setPetHeld(false);assert.equal(h.state.getCurrentState(),'error');}finally{h.state.cleanup()}});
test('theme cleanup releases the host drag lock before restoring a new plan',()=>{const h=fixture();let releases=0;h.ctx.cancelPetHeld=()=>releases++;try{h.state.setPetHeld(true);h.state.cleanup();assert.equal(releases,1);h.state.refreshTheme();assert.equal(h.state.getCurrentState(),'idle');}finally{h.state.cleanup()}});
test('failed status observers cannot block canonical desktop updates',()=>{const h=fixture();h.ctx.onStateChanged=()=>{throw new Error('observer failed')};try{assert.doesNotThrow(()=>h.state.applyState('working'));assert.equal(h.state.getCurrentState(),'working');assert.equal(h.messages.filter(x=>x[0]==='state-change').at(-1)[1],'working');}finally{h.state.cleanup()}});
test('re-resolving an unrelated permission preserves a muted waiting session',()=>{const h=fixture(),sounds=[];h.ctx.playSound=name=>sounds.push(name);try{h.state.sessions.set('muted',{state:'notification',muteNotificationSound:true,updatedAt:Date.now(),headless:false});h.state.clearPermissionNotification('unrelated');assert.equal(h.state.getCurrentState(),'waiting');assert.deepEqual(sounds,[]);}finally{h.state.cleanup()}});

test('SessionEnd sweeping resolves remaining tasks instead of leaving work without sessions',()=>{
 const h=fixture();try{
  h.state.updateSession('ending','working','PreToolUse');
  h.state.updateSession('ending','sweeping','SessionEnd');
  assert.equal(h.state.sessions.size,0);
  assert.equal(h.state.getCurrentState(),'idle');
  for(const input of ['sweeping','carrying']){
   h.state.updateSession('operation',input,'WorktreeRemove');
   assert.equal(h.state.getCurrentState(),h.state.resolveDisplayState(),'housekeeping follows live tasks');
  }
 }finally{h.state.cleanup()}
});

test('automatic display allows waiting and held but rejects roam without overwriting the task',()=>{
 const h=fixture();const policy=require('../src/app-mode').resolveAppModePolicy('automatic');
 h.ctx.allowNotificationAnimation=()=>policy.allowNotificationAnimation;
 h.ctx.getAllowedPetStates=()=>policy.allowedPetStates;
 try{
  h.state.applyState('working');
  h.state.setState('notification');assert.equal(h.state.getCurrentState(),'waiting');
  h.state.setPetHeld(true);assert.equal(h.state.getCurrentState(),'held');h.state.setPetHeld(false);assert.equal(h.state.getCurrentState(),'waiting');
  h.state.applyState('roam');assert.equal(h.state.getCurrentState(),'waiting');
 }finally{h.state.cleanup()}
});

test('entering Background cancels a held override before Normal restores task display',async()=>{
 const h=fixture(),{createAppModeController}=require('../src/app-mode');
 const controller=createAppModeController({cancelPetHeld:()=>h.state.setPetHeld(false),resolveDisplayState:h.state.resolveDisplayState,applyState:(...args)=>h.state.applyState(...args)});
 h.ctx.getAllowedPetStates=()=>controller.getEffectiveAppModePolicy().allowedPetStates;
 try{
  h.state.applyState('working');h.state.setPetHeld(true);
  await controller.setActiveAppMode('background');
  assert.equal(h.state.getCurrentState(),'idle');
  await controller.setActiveAppMode('normal');
  assert.equal(h.state.getCurrentState(),'idle');
 }finally{h.state.cleanup()}
});

test('Background rejects direct held activation even when it arrives after cancellation',()=>{
 const h=fixture();h.ctx.getAllowedPetStates=()=>[];
 try{h.state.setPetHeld(true);assert.equal(h.state.getCurrentState(),'idle');}finally{h.state.cleanup()}
});

test('late input drag lock cannot reacquire Background held state or physical lock',async()=>{
 const h=fixture(),{createAppModeController}=require('../src/app-mode'),{registerPetInteractionIpc}=require('../src/pet-interaction-ipc');
 let locked=false;
 const controller=createAppModeController({cancelPetHeld:()=>{locked=false;h.state.setPetHeld(false)},resolveDisplayState:h.state.resolveDisplayState,applyState:(...args)=>h.state.applyState(...args)});
 h.ctx.getAllowedPetStates=()=>controller.getEffectiveAppModePolicy().allowedPetStates;
 const listeners=new Map(),owner={},ipcMain={on:(channel,handler)=>listeners.set(channel,handler),removeListener:channel=>listeners.delete(channel)};
 const noWindowEffects=Object.fromEntries(['showContextMenu','moveWindowForDrag','setIdlePaused','isMiniTransitioning','sendToRenderer','recoverVisiblePetAfterRendererLoad','setMouseOverPet','beginDragSnapshot','clearDragSnapshot','syncHitWin','isMiniMode','checkMiniModeSnap','hasPetWindow','getPetWindowBounds','getCurrentPixelSize','computeDragEndBounds','applyPetWindowBounds','flushRuntimeStateToPrefs','reassertWinTopmost','scheduleHwndRecovery','repositionFloatingBubbles','exitMiniMode','getFocusableLocalHudSessionIds','focusLog','showDashboard','focusSession','revealSessionHud','setLowPowerIdlePaused','statPath','openTerminalAt'].map(name=>[name,()=>{}]));
 const input=registerPetInteractionIpc({...noWindowEffects,ipcMain,getCurrentState:h.state.getCurrentState,getCurrentSvg:h.state.getCurrentSvg,isInputSender:event=>event.sender===owner,isPetHeldAllowed:()=>controller.getEffectiveAppModePolicy().allowedPetStates.includes('held'),setDragLocked:value=>{locked=value},setPetHeld:h.state.setPetHeld});
 const drag=value=>listeners.get('drag-lock')({sender:owner},value);
 try{
  h.state.updateSession('task','working','PreToolUse');drag(true);assert.equal(h.state.getCurrentState(),'held');
  await controller.setActiveAppMode('background');assert.equal(h.state.getCurrentState(),'idle');
  drag(true);assert.equal(locked,false);assert.equal(h.state.getCurrentState(),'idle');
  drag(false);await controller.setActiveAppMode('normal');assert.equal(h.state.getCurrentState(),'working');
 }finally{input.dispose();h.state.cleanup()}
});

test('Custom excludes task states with immediate idle fallback while preserving Agent status',()=>{
 const h=fixture();h.ctx.fallbackDisabledPetStates=()=>true;
 h.ctx.getAllowedPetStates=()=>['idle','error','held'];
 try{h.state.applyState('error');h.state.updateSession('custom-task','working','PreToolUse');
  assert.equal(h.state.getCurrentState(),'idle');assert.equal(h.state.sessions.get('custom-task').state,'working');
 }finally{h.state.cleanup()}
});
test('frames from a state removed by a Custom edit cannot update the pet visual',()=>{
 const h=fixture();let states=['idle','working'];h.ctx.getAllowedPetStates=()=>states;
 try{h.state.applyState('working');const frame={...h.state.getPetStateSnapshot(),file:h.state.getSvgOverride('working')};states=['idle'];assert.equal(h.state.reportPetActionFrame(frame),false);}finally{h.state.cleanup()}
});

test('idle playback wait follows the enabled actions and current sequence/random plan',()=>{
 const h=fixture();const actions=require('../src/pet-action-plan');const plan=actions.defaultPlan(h.ctx.theme);
 const selected=plan.states.idle.actions.slice(0,2);assert.equal(selected.length,2);
 plan.states.idle={mode:'sequence',actions:selected};
 h.ctx.theme={...h.ctx.theme,_userOverrides:{actionPlan:plan},actionDurations:{...h.ctx.theme.actionDurations,[selected[0].file]:8000,[selected[1].file]:6000}};
 try{
  h.state.refreshTheme();assert.equal(h.state.getIdlePlaybackDuration(),14000);
  plan.states.idle.mode='random';h.state.refreshTheme();assert.equal(h.state.getIdlePlaybackDuration(),8000);
  selected[0].enabled=false;h.state.refreshTheme();assert.equal(h.state.getIdlePlaybackDuration(),6000);
 }finally{h.state.cleanup()}
});
