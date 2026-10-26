import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {mangaGestureAction} from '../../src/lib/manga-gesture.ts';
const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../../src/components/readers/manga-touch-surface.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function surface(){
 const calls=[],viewport={scale:1},loaded={exports:{}};
 class Element {closest(){return true;}}
 vm.runInNewContext(compiled,{exports:loaded.exports,module:loaded,window:{visualViewport:viewport},Element,
  require:name=>name==='react'?{useRef:initial=>({current:initial})}:name==='@/lib/manga-gesture'?{mangaGestureAction}:require(name)});
 const element=loaded.exports.MangaTouchSurface({direction:'rtl',onNext:()=>calls.push('next'),onPrevious:()=>calls.push('previous'),onToggle:()=>calls.push('toggle'),children:null});
 const rect={left:300,width:560};
 const event=(patch={})=>({pointerId:1,isPrimary:true,button:0,pointerType:'touch',clientX:330,clientY:100,timeStamp:0,target:null,currentTarget:{querySelector:()=>({getBoundingClientRect:()=>rect})},...patch});
 const send=(name,patch)=>element.props[name](event(patch));
 return {calls,viewport,send,Element};
}
test('edge tap fires once; repeated release is ignored; middle tap toggles',()=>{
 const s=surface();s.send('onPointerDown');s.send('onPointerUp',{timeStamp:100});assert.deepEqual(s.calls,['next']);
 s.send('onPointerUp',{timeStamp:101});assert.deepEqual(s.calls,['next']);
 s.send('onPointerDown',{clientX:580});s.send('onPointerUp',{clientX:580,timeStamp:100});assert.deepEqual(s.calls,['next','toggle']);
});
test('horizontal swipe turns once, vertical scroll and pointer cancellation do not',()=>{
 const s=surface();s.send('onPointerDown');s.send('onPointerMove',{clientX:430});s.send('onPointerUp',{clientX:430,timeStamp:150});assert.deepEqual(s.calls,['next']);
 s.send('onPointerDown');s.send('onPointerMove',{clientY:250});s.send('onPointerUp',{clientY:250,timeStamp:150});assert.deepEqual(s.calls,['next']);
 s.send('onPointerDown');s.send('onPointerCancel');s.send('onPointerUp',{timeStamp:100});assert.deepEqual(s.calls,['next']);
});
test('two fingers invalidate the sequence and the following single tap still works',()=>{
 const s=surface();s.send('onPointerDown');s.send('onPointerDown',{pointerId:2,isPrimary:false});s.send('onPointerUp',{pointerId:2,isPrimary:false,timeStamp:100});s.send('onPointerUp',{timeStamp:150});assert.deepEqual(s.calls,[]);
 s.send('onPointerDown');s.send('onPointerUp',{timeStamp:100});assert.deepEqual(s.calls,['next']);
});
test('zoomed gestures and interactive controls do not navigate',()=>{
 const s=surface();s.viewport.scale=2;s.send('onPointerDown');s.send('onPointerUp',{timeStamp:100});assert.deepEqual(s.calls,[]);
 s.viewport.scale=1;s.send('onPointerDown',{target:new s.Element()});s.send('onPointerUp',{timeStamp:100});assert.deepEqual(s.calls,[]);
 s.send('onPointerDown');s.viewport.scale=2;s.send('onPointerUp',{timeStamp:100});assert.deepEqual(s.calls,[]);
});
