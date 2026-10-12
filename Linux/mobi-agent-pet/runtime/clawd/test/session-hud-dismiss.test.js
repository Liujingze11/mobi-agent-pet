'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const file=path.join(__dirname,'../src/session-hud.js');
function harness({pinned=false,enabled=true}={}){
 const windows=[],timers=new Map();let clock=1000,point={x:160,y:160},buttons=0,stops=0;
 class Window{
  constructor(options){this.bounds={x:0,y:0,width:options.width,height:options.height};this.visible=false;this.destroyed=false;this.events=new Map();this.webContents={once:(name,fn)=>this.events.set(name,fn),send(){},isDestroyed:()=>this.destroyed,setZoomFactor(){}};windows.push(this);}
  isDestroyed(){return this.destroyed}isVisible(){return this.visible}getBounds(){return {...this.bounds}}setBounds(value){this.bounds={...value}}showInactive(){this.visible=true}hide(){this.visible=false}destroy(){this.destroyed=true;this.visible=false;this.events.get('closed')?.()}setAlwaysOnTop(){}loadFile(){}on(name,fn){this.events.set(name,fn)}
 }
 const module={exports:{}};const localRequire=createRequire(file);
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,__dirname:path.dirname(file),process,require:name=>name==='electron'?{BrowserWindow:Window,screen:{getCursorScreenPoint:()=>point}}:localRequire(name),Date:{now:()=>clock},setTimeout:(fn,ms)=>{const id={fn,ms,unref(){}};timers.set(id,id);return id},clearTimeout:id=>timers.delete(id)});
 const snapshot={sessions:[{id:'demo',state:'working',badge:'running',headless:false}],orderedIds:['demo'],accountQuota:[]};
 const ctx={win:{isDestroyed:()=>false},petHidden:false,sessionHudPinned:pinned,sessionHudEnabled:enabled,sessionHudShowQuota:false,getMiniMode:()=>false,getMiniTransitioning:()=>false,getSessionSnapshot:()=>snapshot,getPetWindowBounds:()=>({x:100,y:100,width:120,height:120}),getHitRectScreen:()=>({left:120,top:120,right:200,bottom:210}),getNearestWorkArea:()=>({x:0,y:0,width:1200,height:800}),getI18n:()=>({}),mouseButtonReader:{read:()=>buttons,stop:()=>{stops++}}};
 const hud=module.exports(ctx);
 function load(){for(const window of [...windows]){const fn=window.events.get('did-finish-load');window.events.delete('did-finish-load');fn?.();}}
 function tick(ms){const id=[...timers.values()].find(timer=>timer.ms===ms);assert.ok(id,'expected active '+ms+'ms timer');timers.delete(id);id.fn();}
 return{hud,ctx,snapshot,windows,timers,load,tick,setPoint:value=>{point=value},setButtons:value=>{buttons=value},advance:ms=>{clock+=ms},stops:()=>stops};
}
test('click just outside the HUD closes it immediately inside the old hover padding',()=>{
 const h=harness();try{h.hud.revealFromPet();h.load();const win=h.hud.getWindow();assert.equal(win.isVisible(),true);const b=win.getBounds();h.setPoint({x:b.x+b.width+8,y:b.y+12});h.setButtons(1);h.tick(16);assert.equal(win.isVisible(),false);h.hud.broadcastSessionSnapshot(h.snapshot);assert.equal(win.isVisible(),false);h.setButtons(0);h.setPoint({x:160,y:160});h.hud.revealFromPet();assert.equal(win.isVisible(),true);}finally{h.hud.cleanup();}
});
test('clicks inside the card and on the pet preserve the revealed HUD',()=>{
 const h=harness();try{h.hud.revealFromPet();h.load();const win=h.hud.getWindow(),b=win.getBounds();h.setPoint({x:b.x+20,y:b.y+12});h.setButtons(1);h.tick(16);assert.equal(win.isVisible(),true);h.setButtons(0);h.tick(16);h.setPoint({x:160,y:160});h.setButtons(1);h.tick(16);assert.equal(win.isVisible(),true);}finally{h.hud.cleanup();}
});
test('drag dismissal closes a temporary card, stops observation, and allows another double-click reveal',()=>{
 const h=harness();try{h.hud.revealFromPet();h.load();const win=h.hud.getWindow();h.hud.dismissFromInteraction();assert.equal(win.isVisible(),false);assert.equal(h.timers.size,0);assert.ok(h.stops()>0);h.hud.broadcastSessionSnapshot(h.snapshot);assert.equal(win.isVisible(),false);h.hud.revealFromPet();assert.equal(win.isVisible(),true);}finally{h.hud.cleanup();}
});
test('fixed cards retain the original pin behavior and never poll outside clicks',()=>{
 const h=harness({pinned:true});try{h.hud.syncSessionHud(h.snapshot);h.load();assert.equal(h.hud.getWindow().isVisible(),true);h.hud.dismissFromInteraction();assert.equal(h.hud.getWindow().isVisible(),true);assert.equal(h.ctx.sessionHudPinned,true);assert.equal(h.timers.size,0);}finally{h.hud.cleanup();}
});
test('moving away does not hide early, while mode gating remains intact',()=>{
 const h=harness();try{h.hud.revealFromPet();h.load();h.setPoint({x:1000,y:700});h.advance(1000);h.tick(200);assert.equal(h.hud.getWindow().isVisible(),true);}finally{h.hud.cleanup();}
 const disabled=harness({enabled:false});try{disabled.hud.revealFromPet();disabled.load();assert.equal(disabled.windows.length,0);assert.equal(disabled.timers.size,0);}finally{disabled.hud.cleanup();}
});

test('quota ring clicks remain usable and dismissal never discards quota data',()=>{
 const h=harness();h.ctx.sessionHudShowQuota=true;h.snapshot.accountQuota=[{codexQuota:{group:{codexFiveHour:{usedPercent:20}}}}];
 try{h.hud.revealFromPet();h.load();const ring=h.hud.getQuotaRingWindow();assert.ok(ring.isVisible());const b=ring.getBounds();h.setPoint({x:b.x+12,y:b.y+12});h.setButtons(1);h.tick(16);assert.equal(ring.isVisible(),true);assert.equal(h.hud.getWindow().isVisible(),true);h.hud.dismissFromInteraction();assert.equal(ring.isVisible(),false);assert.equal(h.snapshot.accountQuota.length,1);h.setPoint({x:160,y:160});h.setButtons(0);h.hud.revealFromPet();assert.equal(ring.isVisible(),true);}finally{h.hud.cleanup();}
});
test('unavailable native sampling does not hide early',()=>{
 const h=harness();h.ctx.mouseButtonReader.read=()=>null;
 try{h.hud.revealFromPet();h.load();assert.ok(![...h.timers.values()].some(timer=>timer.ms===16));assert.equal(h.hud.getWindow().isVisible(),true);h.setPoint({x:1000,y:700});h.advance(1000);h.tick(200);assert.equal(h.hud.getWindow().isVisible(),true);}finally{h.hud.cleanup();}
});
test('quota-only reveal retains its independent eligibility and outside dismissal',()=>{
 const h=harness({enabled:false});h.ctx.sessionHudShowQuota=true;h.snapshot.sessions=[];h.snapshot.orderedIds=[];h.snapshot.accountQuota=[{codexQuota:{group:{codexFiveHour:{usedPercent:20}}}}];
 try{h.hud.revealFromPet();h.load();assert.equal(h.hud.getWindow(),null);const ring=h.hud.getQuotaRingWindow();assert.ok(ring.isVisible());const b=ring.getBounds();h.setPoint({x:b.x-8,y:b.y+12});h.setButtons(1);h.tick(16);assert.equal(ring.isVisible(),false);h.setButtons(0);h.setPoint({x:160,y:160});h.hud.revealFromPet();assert.equal(ring.isVisible(),true);}finally{h.hud.cleanup();}
});

test('temporary cards close after five seconds without mouse movement or data loss',()=>{
 const h=harness();try{h.hud.revealFromPet();h.load();const card=h.hud.getWindow();h.advance(4000);h.tick(200);assert.equal(card.isVisible(),true);h.tick(5000);assert.equal(card.isVisible(),false);assert.equal(h.timers.size,0);assert.equal(h.snapshot.sessions.length,1);h.hud.revealFromPet();assert.equal(card.isVisible(),true);}finally{h.hud.cleanup();}
});
test('session updates do not extend the deadline, but another double-click refreshes it',()=>{
 const h=harness();try{h.hud.revealFromPet();h.load();const original=[...h.timers.values()].find(timer=>timer.ms===5000);assert.ok(original);h.hud.broadcastSessionSnapshot(h.snapshot);assert.ok(h.timers.has(original));h.advance(4000);h.hud.revealFromPet();assert.ok(!h.timers.has(original));original.fn();assert.equal(h.hud.getWindow().isVisible(),true,'stale timeout must not close a refreshed card');h.tick(5000);assert.equal(h.hud.getWindow().isVisible(),false);}finally{h.hud.cleanup();}
});
test('pinning cancels expiry and unpinning starts a fresh five-second deadline',()=>{
 const h=harness();try{h.hud.revealFromPet();h.load();h.ctx.sessionHudPinned=true;h.hud.handlePinnedChanged(true);assert.equal(h.timers.size,0);assert.equal(h.hud.getWindow().isVisible(),true);h.ctx.sessionHudPinned=false;h.hud.handlePinnedChanged(false);h.tick(5000);assert.equal(h.hud.getWindow().isVisible(),false);}finally{h.hud.cleanup();}
});
test('early outside dismissal cancels the old timeout so a reopened card gets its full deadline',()=>{
 const h=harness();try{h.hud.revealFromPet();h.load();const original=[...h.timers.values()].find(timer=>timer.ms===5000);assert.ok(original);const b=h.hud.getWindow().getBounds();h.setPoint({x:b.x+b.width+8,y:b.y+12});h.setButtons(1);h.tick(16);assert.equal(h.hud.getWindow().isVisible(),false);h.setButtons(0);h.setPoint({x:160,y:160});h.hud.revealFromPet();original.fn();assert.equal(h.hud.getWindow().isVisible(),true);h.tick(5000);assert.equal(h.hud.getWindow().isVisible(),false);}finally{h.hud.cleanup();}
});
test('quota-only overlays use the same five-second expiry and cleanup cancels every timer',()=>{
 const h=harness({enabled:false});h.ctx.sessionHudShowQuota=true;h.snapshot.sessions=[];h.snapshot.orderedIds=[];h.snapshot.accountQuota=[{codexQuota:{group:{codexFiveHour:{usedPercent:20}}}}];
 try{h.hud.revealFromPet();h.load();const ring=h.hud.getQuotaRingWindow();assert.ok(ring.isVisible());h.tick(5000);assert.equal(ring.isVisible(),false);h.hud.revealFromPet();h.hud.cleanup();assert.equal(h.timers.size,0);}finally{h.hud.cleanup();}
});

test('hidden task and quota windows stay reusable despite legacy idle power flags',()=>{
 const h=harness();h.ctx.lowPowerIdleMode=true;h.ctx.sessionHudShowQuota=true;h.snapshot.accountQuota=[{codexQuota:{group:{codexFiveHour:{usedPercent:20}}}}];
 try{
  h.hud.revealFromPet();h.load();const card=h.hud.getWindow(),ring=h.hud.getQuotaRingWindow();assert.ok(card.isVisible());assert.ok(ring.isVisible());
  h.tick(5000);assert.equal(card.isVisible(),false);assert.equal(ring.isVisible(),false);
  assert.ok(![...h.timers.values()].some(t=>t.ms===30000));h.advance(30000);
  assert.equal(card.isDestroyed(),false);assert.equal(ring.isDestroyed(),false);
  h.hud.revealFromPet();assert.strictEqual(h.hud.getWindow(),card);assert.strictEqual(h.hud.getQuotaRingWindow(),ring);
 }finally{h.hud.cleanup()}
});
