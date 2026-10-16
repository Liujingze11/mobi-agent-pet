'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const model=require('../src/custom-mode-profile');
const source=path.join(__dirname,'../src/custom-mode-editor.js');
async function fixture(){
 const dom=new JSDOM('<main id="content"></main>',{runScripts:'outside-only'}),window=dom.window,writes=[];
 window.MobiCustomModeProfile=model;
 window.settingsAPI={getModeConfig:async()=>({mode:'normal',profile:model.defaultCustomModeProfile()}),saveCustomMode:async(profile,options)=>{writes.push({profile,options});return {status:'ok',profile}}};
 const core={state:{activeTab:'custom-mode',snapshot:{lang:'en'}},tabs:{},helpers:{t:key=>key,showSettingsConfirmModal:async()=>'confirm'}};
 window.eval(fs.readFileSync(source,'utf8'));window.MobiCustomModeEditor.init(core);core.tabs['custom-mode'].render(window.document.getElementById('content'));
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
  assert.equal(field('permissionAutomationMode').querySelector('option[value="unattended"]').textContent,'Full Access');
  for (const [key, value] of Object.entries(model.defaultCustomModeProfile())) {
    if (typeof value === 'boolean') assert.equal(field(key).getAttribute('role'), 'switch', key);
  }
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

test('task card editor keeps state, context and quota switches with no elapsed field',async()=>{
 const h=await fixture();try{
  const field=id=>h.window.document.querySelector('[data-custom-mode-field="'+id+'"]');
  assert.equal(field('hudElapsed'),null);
  for(const id of ['hudStateLabels','hudContext','hudQuota'])assert.equal(field(id).getAttribute('role'),'switch');
  h.window.document.querySelector('[data-custom-mode-save]').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(Object.hasOwn(h.writes[0].profile,'hudElapsed'),false);
 }finally{h.dom.window.close()}
});

test('Custom editor removes idle power saving and keeps the separate working keep-awake switch',async()=>{
 const h=await fixture();try{
  assert.equal(h.window.document.querySelector('[data-custom-mode-field="lowPowerIdle"]'),null);
  const wake=h.window.document.querySelector('[data-custom-mode-field="keepAwake"]');assert.equal(wake.getAttribute('role'),'switch');wake.click();
  h.window.document.querySelector('[data-custom-mode-save]').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.writes[0].profile.keepAwake,true);assert.equal(Object.hasOwn(h.writes[0].profile,'lowPowerIdle'),false);
 }finally{h.dom.window.close()}
});

test('Custom window controls retain cross-display size and fullscreen but retire edge pinning and mini',async()=>{
 const h=await fixture();try{
  const field=id=>h.window.document.querySelector('[data-custom-mode-field="'+id+'"]');
  assert.equal(field('allowEdgePinning'),null);assert.equal(field('miniModeEnabled'),null);
  assert.equal(field('keepSizeAcrossDisplays').getAttribute('role'),'switch');assert.equal(field('fullscreenOverlay').getAttribute('role'),'switch');
 }finally{h.dom.window.close()}
});

test('secondary settings collapse without losing edited state and interval when saved',async()=>{
 const h=await fixture();try{
  const field=id=>h.window.document.querySelector('[data-custom-mode-field="'+id+'"]');
  for(const id of ['petVisible','trayAlerts','agentBubbles','permissionAutomationMode','sessionHud'])assert.equal(field(id).closest('details'),null);
  const working=h.window.document.querySelector('[data-custom-mode-state="working"]');
  const petPane=working.closest('details');assert.equal(petPane.dataset.customModeSection,'more');assert.equal(petPane.open,false);
  assert.equal(working.closest('[data-custom-mode-group]').dataset.customModeGroup,'pet');
  assert.strictEqual(field('roamIntervalSeconds').closest('details'),petPane);
  const pane=field('hudQuota').closest('details');assert.ok(pane);assert.equal(pane.open,false);
  assert.equal(h.window.document.querySelectorAll('details').length,1);
  for(const id of ['hudQuota','keepAwake','notificationSeconds','permissionSeconds','flashIntervalMs','flashDurationMs','hudStateLabels','hudContext','keepSizeAcrossDisplays','fullscreenOverlay'])assert.strictEqual(field(id).closest('details'),pane);
  pane.open=true;petPane.open=true;working.click();const interval=field('roamIntervalSeconds');interval.value='300';interval.dispatchEvent(new h.window.Event('input'));
  pane.open=false;petPane.open=false;
  field('trayAlerts').click();h.window.document.querySelector('[data-custom-mode-save]').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.writes[0].profile.roamIntervalSeconds,300);assert.ok(!h.writes[0].profile.states.includes('working'));assert.equal(h.writes[0].profile.trayAlerts,false);
 }finally{h.dom.window.close()}
});

test('open sections and unsaved values survive rerender; invalid hidden input reveals its section',async()=>{
 const h=await fixture();try{
  const field=id=>h.window.document.querySelector('[data-custom-mode-field="'+id+'"]');
  const interval=field('notificationSeconds'),pane=interval.closest('details');assert.ok(pane);pane.open=true;
  interval.value='20';interval.dispatchEvent(new h.window.Event('input'));
  h.core.state.snapshot.lang='zh';const parent=h.window.document.getElementById('content');parent.replaceChildren();h.core.tabs['custom-mode'].render(parent);
  assert.equal(field('notificationSeconds').value,'20');assert.equal(field('notificationSeconds').closest('details').open,true);
  const invalid=field('permissionSeconds');invalid.closest('details').open=false;invalid.value='-1';invalid.dispatchEvent(new h.window.Event('input'));invalid.dispatchEvent(new h.window.Event('invalid'));
  assert.equal(invalid.closest('details').open,true);assert.equal(h.writes.length,0);
  const roam=field('roamIntervalSeconds');const petPane=roam.closest('details');assert.strictEqual(petPane,invalid.closest('details'));petPane.open=false;
  roam.value='0';roam.dispatchEvent(new h.window.Event('input'));roam.dispatchEvent(new h.window.Event('invalid'));
  assert.equal(petPane.open,true);assert.equal(h.writes.length,0);
 }finally{h.dom.window.close()}
});

test('help buttons explain all five unclear features using bundled screenshots without editing settings',async()=>{
 const h=await fixture();try{
  for(const key of ['trayAlerts','agentBubbles','sessionHud','hudQuota','keepAwake']){
   const button=h.window.document.querySelector(`[data-custom-mode-help="${key}"]`);
   assert.ok(button,`help for ${key}`);assert.equal(button.type,'button');
   const input=h.window.document.querySelector(`[data-custom-mode-field="${key}"]`),before=input.checked;
   button.focus();button.click();
   const dialog=h.window.document.querySelector('dialog[open]');assert.ok(dialog);
   const images=[...dialog.querySelectorAll('img')];assert.ok(images.length>0);
   for(const img of images){assert.ok(img.alt);assert.ok(fs.existsSync(path.resolve(path.dirname(source),img.getAttribute('src'))));}
   assert.equal(input.checked,before);assert.equal(h.writes.length,0);
   dialog.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   assert.equal(h.window.document.querySelector('dialog'),null);assert.equal(h.window.document.activeElement,button);
  }
  const wake=h.window.document.querySelector('[data-custom-mode-field="keepAwake"]');
  h.window.document.querySelector(`label[for="${wake.id}"]`).click();assert.equal(wake.checked,true);
 }finally{h.dom.window.close()}
});

test('quota help separates account usage from context and help closes on outside click',async()=>{
 const h=await fixture();try{
  h.window.document.querySelector('[data-custom-mode-help="hudQuota"]').click();
  const dialog=h.window.document.querySelector('dialog');assert.match(dialog.textContent,/account/i);assert.match(dialog.textContent,/context/i);
  dialog.click();assert.equal(h.window.document.querySelector('dialog'),null);
  h.window.document.querySelector('[data-custom-mode-help="keepAwake"]').click();
  const wake=h.window.document.querySelector('dialog');assert.match(wake.textContent,/sleep/i);assert.match(wake.textContent,/screen/i);
  wake.querySelector('button').click();assert.equal(h.window.document.querySelector('dialog'),null);
 }finally{h.dom.window.close()}
});


test('preset buttons fill the entire local draft and edits save as Custom without touching built-in modes',async()=>{
 const h=await fixture();try{
  const field=key=>h.window.document.querySelector(`[data-custom-mode-field="${key}"]`);
  const primaryFields=[...h.window.document.querySelectorAll('[data-custom-mode-field]')].filter(x=>!x.closest('details')).map(x=>x.dataset.customModeField);
  assert.deepEqual(primaryFields,['petVisible','trayAlerts','agentBubbles','permissionAutomationMode','sessionHud']);
  assert.equal(h.window.document.querySelector('[data-custom-mode-state=roam]').closest('details').dataset.customModeSection,'more');
  for(const mode of ['normal','background','automatic']){
   const before=require('../src/app-mode').resolveAppModePolicy(mode);
   const button=h.window.document.querySelector(`[data-custom-mode-preset="${mode}"]`);assert.ok(button);assert.equal(button.type,'button');button.click();
   const profile=model.builtInModeProfile(mode);
   for(const [key,value] of Object.entries(profile)){
    if(typeof value==='boolean')assert.equal(field(key).checked,value,key);
    else if(typeof value==='number'&&key!=='version')assert.equal(Number(field(key).value),value,key);
    else if(key==='permissionAutomationMode')assert.equal(field(key).value,value);
   }
   assert.deepEqual([...h.window.document.querySelectorAll('[data-custom-mode-state]')].filter(x=>x.checked).map(x=>x.dataset.customModeState),profile.states);
   assert.equal(h.writes.length,0);assert.equal(h.window.document.querySelector(`[data-custom-mode-preset="${mode}"]`).getAttribute('aria-pressed'),'true');
   field('trayAlerts').click();field('keepAwake').click();
   h.window.document.querySelector('[data-custom-mode-save]').click();await new Promise(resolve=>setImmediate(resolve));
   const expected={...profile,trayAlerts:!profile.trayAlerts,keepAwake:!profile.keepAwake};
   assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].profile)),expected);
   assert.deepEqual(require('../src/app-mode').resolveAppModePolicy(mode),before);
   h.writes.length=0;
  }
 }finally{h.dom.window.close()}
});

test('top reset restores Custom defaults locally; preset redraw retains the More settings fold',async()=>{
 const h=await fixture();try{
  const pane=h.window.document.querySelector('[data-custom-mode-section=more]');pane.open=true;
  assert.equal(h.window.document.querySelectorAll('details').length,1);
  h.window.document.querySelector('[data-custom-mode-preset=automatic]').click();
  assert.equal(h.window.document.querySelector('[data-custom-mode-section=more]').open,true);
  const reset=h.window.document.querySelector('[data-custom-mode-reset]');assert.ok(reset.closest('.custom-mode-presets'));reset.click();
  assert.equal(h.writes.length,0);assert.equal(h.window.document.querySelector('[data-custom-mode-section=more]').open,true);
  assert.ok([...h.window.document.querySelectorAll('[data-custom-mode-preset]')].every(x=>x.getAttribute('aria-pressed')==='false'));
  h.window.document.querySelector('[data-custom-mode-save]').click();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].profile)),model.defaultCustomModeProfile());
 }finally{h.dom.window.close()}
});

test('preset and reset buttons remain disabled while Save is pending, including after language rerender',async()=>{
 const h=await fixture();try{
  let finish;h.window.settingsAPI.saveCustomMode=()=>new Promise(resolve=>{finish=resolve});
  h.window.document.querySelector('[data-custom-mode-preset=background]').click();
  h.window.document.querySelector('[data-custom-mode-save]').click();await new Promise(resolve=>setImmediate(resolve));
  h.core.state.snapshot.lang='zh';const parent=h.window.document.getElementById('content');parent.replaceChildren();h.core.tabs['custom-mode'].render(parent);
  for(const button of parent.querySelectorAll('[data-custom-mode-preset],[data-custom-mode-reset]'))assert.equal(button.disabled,true);
  finish({status:'ok',profile:model.builtInModeProfile('background')});await new Promise(resolve=>setImmediate(resolve));
  for(const button of parent.querySelectorAll('[data-custom-mode-preset],[data-custom-mode-reset]'))assert.equal(button.disabled,false);
  assert.equal(parent.querySelector('[data-custom-mode-preset=background]').getAttribute('aria-pressed'),'true');
 }finally{h.dom.window.close()}
});

test('additional field and module help uses screenshots without toggling folds or changing the draft',async()=>{
 const h=await fixture();try{
  const doc=h.window.document;
  const snapshot=()=>JSON.stringify([...doc.querySelectorAll('[data-custom-mode-field],[data-custom-mode-state]')].map(x=>[x.dataset.customModeField||x.dataset.customModeState,x.type==='checkbox'?x.checked:x.value]));
  const before=snapshot();
  for(const key of ['permissionAutomationMode','hudContext','pet','alerts','keepSizeAcrossDisplays']){
   const button=doc.querySelector(`[data-custom-mode-help="${key}"]`);assert.ok(button,`help for ${key}`);
   const pane=button.closest('details'),wasOpen=pane?.open;
   button.focus();button.click();const dialog=doc.querySelector('dialog[open]');assert.ok(dialog);
   if(pane)assert.equal(pane.open,wasOpen,`help must not toggle ${key}`);
   const images=[...dialog.querySelectorAll('img')];assert.ok(images.length>0);
   for(const img of images)assert.ok(fs.existsSync(path.resolve(path.dirname(source),img.getAttribute('src'))));
   assert.equal(snapshot(),before);assert.equal(h.writes.length,0);
   dialog.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(doc.activeElement,button);
  }
  assert.equal(doc.querySelectorAll('[data-custom-mode-help]').length,10);
  for(const key of ['roamIntervalSeconds','notificationSeconds','permissionSeconds','flashIntervalMs','flashDurationMs'])assert.equal(doc.querySelector(`[data-custom-mode-help="${key}"]`),null);
 }finally{h.dom.window.close()}
});
