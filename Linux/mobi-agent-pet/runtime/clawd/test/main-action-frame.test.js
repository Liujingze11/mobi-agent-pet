'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createPetStateController}=require('../src/pet-state-controller');
const {defaultPlan}=require('../src/pet-action-plan');
function harness(){
 const file=path.join(__dirname,'../src/main.js'),source=fs.readFileSync(file,'utf8');const start=source.indexOf('updateActionVisual: (event, payload) => {'),end=source.indexOf('\n    recoverVisiblePetAfterRendererLoad:',start);const callback=source.slice(start+'updateActionVisual:'.length,end).trim().replace(/,$/,'');
 const owner={},frames=[],timers=[],plan=defaultPlan({states:{idle:['rest.svg'],attention:['short.svg','long.svg']},actionDurations:{'short.svg':4000,'long.svg':6000}});plan.states.complete.mode='random';
 const controller=createPetStateController({getPlan:()=>plan,resolveTaskState:()=> 'idle',timers:{setTimeout(fn,ms){timers.push(ms);return timers.length},clearTimeout(){}}});controller.request('complete');
 const update=vm.runInNewContext('('+callback+')',{win:{isDestroyed:()=>false,webContents:owner},_state:{reportPetActionFrame(frame){if(controller.reportFrame(frame))frames.push(frame.file)}}});
 return{update,owner,frames,timers,snapshot:controller.getSnapshot(),controller};
}
test('main IPC validates generation and uses the selected native action duration',()=>{const h=harness();h.update({sender:h.owner},{...h.snapshot,file:'short.svg',returnAfterMs:500});assert.deepEqual(h.frames,['short.svg']);assert.equal(h.timers.at(-1),4000);h.controller.cleanup();});
test('main IPC rejects foreign windows, unassigned files and late frames',()=>{const h=harness();h.update({sender:{}},{...h.snapshot,file:'short.svg'});h.update({sender:h.owner},{...h.snapshot,file:'unassigned.svg'});h.controller.refreshPlan();h.update({sender:h.owner},{...h.snapshot,file:'short.svg'});assert.deepEqual(h.frames,[]);h.controller.cleanup();});

test('both real renderer crash callbacks release the physical lock and controller held state',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
 const callbacks=[];
 const inputPrefix='onRenderProcessGone: ';
 const inputStart=source.indexOf(inputPrefix),inputEnd=source.indexOf('\n    },',inputStart);
 callbacks.push(source.slice(inputStart+inputPrefix.length,inputEnd)+'\n    }');
 const renderPrefix='win.webContents.on("render-process-gone", ';
 const renderStart=source.indexOf(renderPrefix),renderEnd=source.indexOf('\n  });',renderStart);
 callbacks.push(source.slice(renderStart+renderPrefix.length,renderEnd)+'\n  }');
 for(const callback of callbacks){
  const h=harness();h.controller.request('working');h.controller.setHeld(true);h.controller.request('error');
  let dragLocked=true;
  const context={petWindowRuntime:{setDragLocked:x=>{dragLocked=x},clearDragSnapshot(){},reloadWindowWebContents(){}},_state:{setPetHeld:x=>h.controller.setHeld(x)},safeConsoleError(){},setLowPowerIdlePaused(){},idlePaused:true,mouseOverPet:true,win:{}};
  const helperStart=source.indexOf('function cancelPetHold()');
  if(helperStart>=0){const helperEnd=source.indexOf('\n}',helperStart)+2;vm.runInNewContext(source.slice(helperStart,helperEnd),context);}
  vm.runInNewContext('('+callback+')',context)({reason:'crashed'},{reason:'crashed'});
  assert.equal(dragLocked,false);assert.equal(h.controller.getState(),'error');h.controller.cleanup();
 }
});

test('ordinary reload of either pet window cancels a held controller before loading',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
 for(const windowName of ['win','hitWin']){
  const prefix=windowName+'.webContents.on("did-start-loading", ';
  const start=source.indexOf(prefix),end=source.indexOf('\n  });',start);
  assert.ok(start>=0,'loading recovery registered for '+windowName);
  const h=harness();h.controller.request('working');h.controller.setHeld(true);
  const context={_state:{setPetHeld:x=>h.controller.setHeld(x)},petWindowRuntime:{setDragLocked(){},clearDragSnapshot(){}},setLowPowerIdlePaused(){}};
  const helperStart=source.indexOf('function cancelPetHold()');
  if(helperStart>=0) vm.runInNewContext(source.slice(helperStart,source.indexOf('\n}',helperStart)+2),context);
  vm.runInNewContext('('+source.slice(start+prefix.length,end)+'\n  })',context)();
  assert.equal(h.controller.getState(),'working');h.controller.cleanup();
 }
});
