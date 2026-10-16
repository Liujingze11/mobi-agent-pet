'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{EventEmitter}=require('node:events');
const loader=require('../src/theme-loader'),model=require('../src/pet-action-plan'),{handleStatePost}=require('../src/server-route-state');
loader.init(path.resolve(__dirname,'../src'));
function fixture(){
 const theme=loader.loadTheme('mobi-a'),plan=model.defaultPlan(theme);plan.states.working.actions=[{file:'collapsing.svg',enabled:true,durationMs:10000}];theme._userOverrides={actionPlan:plan};
 const frames=[],events=[],ctx={theme,doNotDisturb:false,miniMode:false,miniTransitioning:false,pendingPermissions:[],playSound(){},syncHitWin(){},sendToHitWin(){},sendToRenderer:(channel,state,file,snapshot)=>{if(channel==='state-change')frames.push({state,file,...snapshot})},buildContextMenu(){},buildTrayMenu(){},miniPeekIn(){},miniPeekOut(){},t:x=>x,onAgentEvent:input=>events.push(input)};
 const state=require('../src/state')(ctx);
 function post(input){return new Promise(resolve=>{const req=new EventEmitter(),res={writeHead(code){this.statusCode=code},end(){resolve(this.statusCode)}};
 handleStatePost(req,res,{ctx:{...ctx,STATE_SVGS:state.STATE_SVGS,sessions:state.sessions,isAgentEnabled:()=>true,setState:state.setState,updateSession:state.updateSession},createRequestHookRecorder:()=>({acceptedUnlessDnd(){},droppedInvalidAgent(){},droppedByDnd(){},droppedByDisabled(){}}),shouldDropForDnd:()=>false,codexOfficialTurns:new Map()});
 req.emit('data',Buffer.from(JSON.stringify({agent_id:'claude-code',session_id:'flow',...input})));req.emit('end');
 });}
 return{ctx,state,frames,events,post};
}
test('real Agent ingress preserves raw events while configured actions and held state use the seven-state contract',async()=>{
 const h=fixture();try{
  assert.equal(await h.post({state:'thinking',event:'UserPromptSubmit'}),200);
  assert.equal(h.state.getCurrentState(),'working');assert.equal(h.state.getCurrentSvg(),'collapsing.svg');
  assert.equal(h.events.at(-1).state,'thinking');
  h.state.setPetHeld(true);assert.equal(h.state.getCurrentState(),'held');
  assert.equal(await h.post({state:'error',event:'PostToolUseFailure'}),200);assert.equal(h.state.getCurrentState(),'held');
  h.state.setPetHeld(false);assert.equal(h.state.getCurrentState(),'error');
  h.ctx.miniMode=true;h.state.applyState('working');assert.equal(h.state.getCurrentState(),'working');
  assert.ok(h.frames.every(f=>['idle','roam','working','waiting','complete','error','held'].includes(f.state)));
  const oldFrame=h.frames.at(-1);h.ctx.theme=loader.loadTheme('mobi-b');h.state.refreshTheme();
  assert.equal(h.state.reportPetActionFrame(oldFrame),false);
  assert.equal(h.state.reportPetActionFrame({...h.state.getPetStateSnapshot(),file:'unassigned.svg'}),false);
 }finally{h.state.cleanup()}
});

test('canonical HTTP waiting and completion use existing lifecycles while history retains input',async()=>{
 const h=fixture();try{
  assert.equal(await h.post({state:'waiting',event:'Notification'}),200);
  assert.equal(h.state.getCurrentState(),'waiting');
  assert.equal(h.state.sessions.get(h.events.at(-1).sessionId).recentEvents.at(-1).state,'waiting');
  assert.equal(await h.post({state:'working',event:'PreToolUse'}),200);
  assert.equal(await h.post({state:'complete',event:'PostCompact'}),200);
  assert.equal(h.state.getCurrentState(),'complete');
  assert.equal(h.events.at(-1).state,'complete');
  assert.equal(h.state.sessions.get(h.events.at(-1).sessionId).recentEvents.at(-1).state,'complete');
  assert.equal(h.state.sessions.get(h.events.at(-1).sessionId).state,'idle','completion must not become a persistent task');
 }finally{h.state.cleanup()}
});
