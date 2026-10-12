'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
function factory(){return require('../src/mouse-button-reader');}
function ffi(functions){return {load:name=>({func:signature=>{const key=Object.keys(functions).find(key=>signature.includes(key+'(')||signature.includes(key+' ('));assert.ok(key,'unexpected FFI '+signature);return functions[key];}})};}
test('Windows button sampling uses the current high bit, ignoring the historical low bit',()=>{
 const keys=new Map([[1,1],[2,-32768],[4,0]]),reader=factory()({platform:'win32',koffi:ffi({GetAsyncKeyState:key=>keys.get(key)})});
 assert.equal(reader.read(),2);keys.set(1,-32768);keys.set(4,-32768);assert.equal(reader.read(),7);reader.stop();
});
test('macOS samples only mouse buttons from combined session state',()=>{
 const calls=[],reader=factory()({platform:'darwin',koffi:ffi({CGEventSourceButtonState:(source,button)=>{calls.push([source,button]);return button===0||button===2;}})});
 assert.equal(reader.read(),5);assert.deepEqual(calls,[[0,0],[0,1],[0,2]]);reader.stop();
});
test('X11 sampling ignores keyboard modifiers and closes/reopens its owned display',()=>{
 let opens=0,closes=0,mask=2|256|1024;
 const reader=factory()({platform:'linux',koffi:ffi({XOpenDisplay:()=>{opens++;return 1;},XCloseDisplay:()=>closes++,XDefaultRootWindow:()=>99,XQueryPointer:(_display,_root,...outputs)=>{outputs.at(-1)[0]=mask;return 1;}})});
 assert.equal(reader.read(),3);assert.equal(opens,1);mask=2|512;assert.equal(reader.read(),4);reader.stop();reader.stop();assert.equal(closes,1);assert.equal(reader.read(),4);assert.equal(opens,2);reader.stop();assert.equal(closes,2);
});
test('unsupported or unavailable native input degrades to no sample',()=>{
 const unsupported=factory()({platform:'other',koffi:{load(){throw Error('must not load')}}});assert.equal(unsupported.read(),null);unsupported.stop();
 const unavailable=factory()({platform:'linux',koffi:ffi({XOpenDisplay:()=>null,XCloseDisplay(){},XDefaultRootWindow(){},XQueryPointer(){}})});assert.equal(unavailable.read(),null);unavailable.stop();
});
