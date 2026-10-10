'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), path=require('node:path');
const loader=require('../src/theme-loader');
const model=require('../src/pet-action-plan');
const context=require('../src/theme-context');
loader.init(path.resolve(__dirname,'../src'));
test('loaded pet themes expose only seven runtime states and a default plan before saving',()=>{
 for(const name of ['mobi-a','mobi-b','mobi-c']) {
  const theme=loader.loadTheme(name);
  assert.deepEqual(Object.keys(theme.states),['idle','roam','working','waiting','complete','error','held']);
  const plan=context(theme).getRendererConfig().actionPlan;
  assert.ok(plan,'default plan must be active before save');
  assert.deepEqual(plan.states.working.actions.map(a=>a.file),['working.svg']);
 }
});
test('effective plans preserve assignments without mutating saved settings and remove unavailable files',()=>{
 assert.equal(typeof model.resolveEffectivePlan,'function');
 const saved={version:1,states:{idle:{mode:'random',actions:[{file:'idle.svg',enabled:true,durationMs:5000}]},working:{mode:'sequence',actions:[{file:'sleeping.svg',enabled:true,durationMs:5000},{file:'gone.svg',enabled:true,durationMs:5000}]}}};
 const before=JSON.stringify(saved);
 const theme=loader.loadTheme('mobi-a'); theme._userOverrides={actionPlan:saved};
 const plan=model.resolveEffectivePlan(theme);
 assert.deepEqual(plan.states.working.actions.map(a=>a.file),['sleeping.svg']);
 assert.equal(JSON.stringify(saved),before);
});
test('seven-state theme input does not require legacy thinking or sleep bindings',()=>{
 const {validateTheme}=require('../src/theme-schema');
 const raw={schemaVersion:1,name:'Seven',version:'1.0.0',viewBox:{x:0,y:0,width:160,height:180},states:{idle:['idle.svg'],working:['working.svg'],roam:[],waiting:[],complete:[],error:[],held:[]},eyeTracking:{enabled:false},miniMode:{supported:false}};
 assert.deepEqual(validateTheme(raw),[]);
});

test('missing saved idle falls back only to available defaults, without editing preferences',()=>{
 const saved={version:1,states:{idle:{mode:'random',actions:[{file:'gone.svg',enabled:true,durationMs:5000}]}}};
 const theme={states:{idle:['gone.svg','ok.svg']},_availablePetActionFiles:['ok.svg'],_userOverrides:{actionPlan:saved}};
 const before=JSON.stringify(saved);
 assert.deepEqual(model.resolveEffectivePlan(theme).states.idle.actions.map(a=>a.file),['ok.svg']);
 assert.equal(JSON.stringify(saved),before);
 theme._availablePetActionFiles=[];
 assert.throws(()=>model.resolveEffectivePlan(theme),/idle action/i);
});
