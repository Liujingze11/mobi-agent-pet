'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const model=require('../src/custom-mode-profile');
const source=path.join(__dirname,'../src/settings-tab-custom-mode.js');
async function fixture(){
 const dom=new JSDOM('<main id="content"></main>',{runScripts:'outside-only'}),window=dom.window,writes=[];
 window.MobiCustomModeProfile=model;
 window.settingsAPI={getModeConfig:async()=>({mode:'normal',profile:model.defaultCustomModeProfile()}),saveCustomMode:async(profile,options)=>{writes.push({profile,options});return {status:'ok',profile}}};
 const core={state:{activeTab:'custom-mode',snapshot:{lang:'en'}},tabs:{},helpers:{t:key=>key,showSettingsConfirmModal:async()=>'confirm'}};
 window.eval(fs.readFileSync(source,'utf8'));window.ClawdSettingsTabCustomMode.init(core);core.tabs['custom-mode'].render(window.document.getElementById('content'));
 await new Promise(resolve=>setImmediate(resolve));return{dom,window,core,writes};
}
test('Custom editor exposes one Agent bubble switch, removes following, and saves both kinds together',async()=>{
 const h=await fixture();try{
  const field=id=>h.window.document.querySelector('[data-custom-mode-field="'+id+'"]');
  assert.ok(field('agentBubbles'));
  for(const retired of ['permissionBubbles','notificationBubbles','bubbleFollow'])assert.equal(field(retired),null);
  field('agentBubbles').click();h.window.document.querySelector('[data-custom-mode-save]').click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].profile.agentBubbles,false);
 }finally{h.dom.window.close()}
});
test('custom editor is the only mode behavior editor, requires idle, and has no sound option',async()=>{
 const h=await fixture();try{
  const field=id=>h.window.document.querySelector('[data-custom-mode-field="'+id+'"]');
  assert.ok(field('petVisible'));assert.ok(field('trayAlerts'));assert.ok(field('permissionAutomationMode'));
  const idle=h.window.document.querySelector('[data-custom-mode-state="idle"]');assert.equal(idle.disabled,true);assert.equal(idle.checked,true);
  assert.equal(h.window.document.querySelector('[data-custom-mode-field*="sound"]'),null);
  const working=h.window.document.querySelector('[data-custom-mode-state="working"]');working.click();
  field('trayAlerts').click();h.window.document.querySelector('[data-custom-mode-save]').click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].profile.trayAlerts,false);assert.ok(!h.writes[0].profile.states.includes('working'));
 }finally{h.dom.window.close()}
});
test('editing or reset is local until Save, and cancelling automation consent keeps the draft',async()=>{
 const h=await fixture();try{
  const selector=h.window.document.querySelector('[data-custom-mode-field="permissionAutomationMode"]');selector.value='unattended';selector.dispatchEvent(new h.window.Event('change'));
  assert.equal(h.writes.length,0);
  h.window.settingsAPI.saveCustomMode=async()=>({status:'confirmation-required'});
  h.core.helpers.showSettingsConfirmModal=async()=>'cancel';
  h.window.document.querySelector('[data-custom-mode-save]').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(selector.value,'unattended');assert.equal(h.writes.length,0);
 }finally{h.dom.window.close()}
});

test('pending Save stays disabled through a language rerender and becomes usable afterward',async()=>{
 const h=await fixture();try{
  let finish;h.window.settingsAPI.saveCustomMode=()=>new Promise(resolve=>{finish=resolve});
  h.window.document.querySelector('[data-custom-mode-save]').click();await new Promise(resolve=>setImmediate(resolve));
  h.core.state.snapshot.lang='zh';const parent=h.window.document.getElementById('content');parent.replaceChildren();h.core.tabs['custom-mode'].render(parent);
  assert.equal(parent.querySelector('[data-custom-mode-save]').disabled,true);
  finish({status:'ok',profile:model.defaultCustomModeProfile()});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(parent.querySelector('[data-custom-mode-save]').disabled,false);
  assert.equal(parent.querySelector('[data-custom-mode-state="idle"]').disabled,true);
 }finally{h.dom.window.close()}
});
test('active automatic approval consent requires an explicit confirm before retrying Save',async()=>{
 const h=await fixture();try{
  const calls=[];h.window.settingsAPI.saveCustomMode=async(profile,options)=>{calls.push(options);return options?.confirmed?{status:'ok',profile}:{status:'confirmation-required'}};
  h.core.helpers.showSettingsConfirmModal=async()=> 'confirm';
  h.window.document.querySelector('[data-custom-mode-save]').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,2);assert.equal(calls[1].confirmed,true);
 }finally{h.dom.window.close()}
});

test('Custom editor saves the roaming interval explicitly without changing the active preset',async()=>{
 const h=await fixture();try{
  const input=h.window.document.querySelector('[data-custom-mode-field="roamIntervalSeconds"]');assert.ok(input);assert.equal(input.value,'120');
  input.value='300';input.dispatchEvent(new h.window.Event('input'));assert.equal(h.writes.length,0);
  h.window.document.querySelector('[data-custom-mode-save]').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].profile.roamIntervalSeconds,300);
 }finally{h.dom.window.close()}
});
