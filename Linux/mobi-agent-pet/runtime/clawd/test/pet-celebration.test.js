"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createConfetti,createPetCelebration}=require('../src/pet-celebration');
const theme={_id:'mobi-a',_builtin:true},screenFrame={state:'complete',file:'celebration-screen.svg',replay:true};
function harness(){
 const windows=[],timers=new Set();let allowed=true;
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;windows.push(this);}
  isDestroyed(){return !!this.destroyed;}
  destroy(){this.destroyed=true;this.emit('closed');}
  setIgnoreMouseEvents(value){this.ignore=value;}
  setAlwaysOnTop(){} setVisibleOnAllWorkspaces(){}
  setBounds(bounds){this.bounds=bounds;}
  loadURL(url){this.url=url;return Promise.resolve();}
  showInactive(){this.shown=true;}
 }
 const effect=createPetCelebration({BrowserWindow:Window,screen:{getDisplayMatching:()=>({bounds:{x:-1920,y:0,width:1920,height:1080}})},getPetBounds:()=>({x:-500,y:700,width:200,height:220}),isAllowed:()=>allowed,timers:{setTimeout(fn,ms){const t={fn,ms};timers.add(t);return t;},clearTimeout(t){timers.delete(t);}}});
 return {effect,windows,timers,disable:()=>allowed=false};
}
for (const roleId of ['mobi-a','mobi-b','mobi-c']) test(`${roleId} screen confetti opens a full-display, click-through effect only for the dedicated action`,async()=>{
 const theme={_id:roleId,_builtin:true};
 const h=harness();h.effect.playFrame(theme,{state:'complete',file:'attention.svg'});assert.equal(h.windows.length,0);
 h.effect.playFrame(theme,screenFrame);await Promise.resolve();assert.equal(h.windows.length,1);const w=h.windows[0];
 assert.deepEqual(w.bounds,{x:-1920,y:0,width:1920,height:1080});assert.equal(w.ignore,true);assert.equal(w.shown,true);
 assert.equal(w.options.focusable,false);assert.equal(w.options.transparent,true);assert.equal(w.options.skipTaskbar,true);
 assert.equal(w.options.webPreferences.nodeIntegration,false);assert.equal(w.options.webPreferences.sandbox,true);
 const timer=[...h.timers][0];assert.equal(timer.ms,8000);timer.fn();assert.equal(w.destroyed,true);
});
test('external or unsupported themes cannot open the desktop confetti overlay',()=>{
 for(const theme of [{_id:'mobi-b',_builtin:false},{_id:'mobi-c',_builtin:false},{_id:'custom-pet',_builtin:true},null]){
  const h=harness();h.effect.playFrame(theme,screenFrame);assert.equal(h.windows.length,0);assert.equal(h.timers.size,0);
 }
});
test('frame action and interrupted or hidden pets cancel screen rain without late resurrection',async()=>{
 const h=harness();h.effect.playFrame(theme,screenFrame);h.effect.playFrame(theme,{state:'complete',file:'attention.svg'});
 await Promise.resolve();assert.equal(h.windows[0].destroyed,true);assert.equal(h.windows[0].shown,undefined);assert.equal(h.timers.size,0);
 h.effect.playFrame(theme,screenFrame);h.effect.stateChanged('held');assert.equal(h.windows[1].destroyed,true);
 h.disable();h.effect.playFrame(theme,screenFrame);assert.equal(h.windows.length,2);
});
test('duplicate frame reports keep rain running, while a new animation cycle restarts it',async()=>{
 const h=harness();h.effect.playFrame(theme,screenFrame);await Promise.resolve();
 h.effect.playFrame(theme,{...screenFrame,replay:false});assert.equal(h.windows.length,1);assert.equal(h.windows[0].destroyed,undefined);
 h.effect.playFrame(theme,screenFrame);assert.equal(h.windows.length,2);assert.equal(h.windows[0].destroyed,true);assert.equal(h.timers.size,1);h.effect.stop();
});
test('both rain sizes enter at the top and cover all regions while falling down',()=>{
 for(const [width,height] of [[160,180],[1920,1080]]){
  const particles=createConfetti(width,height);assert.ok(particles.length>=144);
  for(const p of particles){assert.ok(p.yStart<0&&p.yEnd>height);assert.ok(p.delayMs>=800&&p.delayMs+p.fallMs<8000);}
  const points=particles.map(p=>({...p,y:p.yStart+(p.yEnd-p.yStart)*(3500-p.delayMs)/p.fallMs})).filter(p=>p.y>=0&&p.y<height);
  for(let row=0;row<3;row++)for(let col=0;col<4;col++)assert.ok(points.some(p=>Math.floor(p.x/(width/4))===col&&Math.floor(p.y/(height/3))===row));
 }
});
