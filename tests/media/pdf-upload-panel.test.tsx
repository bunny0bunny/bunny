import { beforeEach, expect, mock, test } from 'bun:test';
import * as React from 'react';
let slots: any[] = [], cursor = 0, effects: (() => unknown)[] = [];
const actualReact = {...React};
mock.module('react', () => ({...actualReact,
  useId:()=> 'pdf', useSyncExternalStore:()=>true,
  useState:(initial:any)=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],(next:any)=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
  useRef:(initial:any)=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useEffect:(effect:any,deps:any[]=[])=>{const i=cursor++;if(!(i in slots)||deps.some((v,j)=>v!==slots[i][j])){slots[i]=deps;effects.push(effect);}},
}));
Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(){},removeEventListener(){},location:{reload:mock()}}});
mock.module('../../src/components/ui/button',()=>({Button:(props:any)=>React.createElement('button',props)}));
let openedHash = 'a'.repeat(64);
const rendered: number[] = [];
mock.module('../../src/lib/media/pdf-client',()=>({openPdf:async()=>({sourceSha256:openedHash,pageCount:3,renderPage:async(index:number)=>{rendered.push(index);return new Blob(['page'],{type:'image/webp'});},destroy:async()=>{}})}));
const calls: {url:string,body:any}[]=[];
const status = { uploadId:'up',state:'uploading',expectedPages:3,readyPages:2,readyPageIndices:[0,2],sourceReady:true,sourceBytes:12,pageBytes:8,sourceSha256:'a'.repeat(64),processingProfile:'balanced-v1',revisionVersion:2,errorCode:null,expiresAt:'2030-01-01',sourceName:'chapter.pdf',keepSource:false,sourceReviewedAt:null,sourceDeleteAfter:null,sourceDeletedAt:null,sourceDeletingAt:null };
let current:any;
mock.module('../../src/lib/media/upload-request',()=>({
  boundedWait:(value:any)=>value,
  UploadRequestError:class extends Error {},
  uploadRequest:async(url:string,init:any={})=>{calls.push({url,body:typeof init.body==='string'?JSON.parse(init.body):null});if(url.includes('?revisionId='))return{ok:true,upload:current};if(url.endsWith('/resume'))return{ok:true,status:{...current,readyPageIndices:[0,1]}};if(url.endsWith('/complete'))return{ok:true,revision:{id:'rev',version:3,pagesJson:[]}};if(url.endsWith('/source-policy')){current={...current,...JSON.parse(init.body),sourceReviewedAt:JSON.parse(init.body).reviewed?'2026-10-25':null};return{ok:true,status:current};}return{ok:true,status:current};},
}));
const {PdfUploadPanel}=await import('../../src/components/studio/pdf-upload-panel');
let props:any;
function render(){cursor=0;const tree=PdfUploadPanel(props);const pending=effects;effects=[];for(const effect of pending)effect();return tree;}
async function settle(){await new Promise(resolve=>setTimeout(resolve,0));return render();}
function find(node:any,predicate:(n:any)=>boolean):any{if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of React.Children.toArray(node.props?.children)){const found=find(child,predicate);if(found)return found;}}
function text(node:any):string{return React.Children.toArray(node?.props?.children).map((c:any)=>typeof c==='object'?text(c):String(c)).join('');}
const button=(tree:any,label:string)=>find(tree,n=>n.props?.onClick&&text(n).includes(label));
beforeEach(()=>{slots=[];cursor=0;effects=[];calls.length=0;rendered.length=0;openedHash='a'.repeat(64);current={...status};props={revisionId:'rev',version:2,pendingUploadId:'up',uploadsEnabled:true,disabled:false,unsaved:false,onSaveDraft(){},onBusyChange(){},onStarted(){},onRevision(){},onPreview(){}};});
test('resume handler uses fresh server response and completes once without starting a new upload',async()=>{
  let tree=render();tree=await settle();
  find(tree,n=>n.props?.type==='file').props.onChange({target:{files:[new File(['123456789012'],'same.pdf')]}});
  render();tree=await settle();tree=await settle();
  button(tree,'التحقق من PDF').props.onClick();await settle();await settle();
  expect(rendered).toEqual([2]);
  expect(calls.filter(c=>c.url==='/api/uploads')).toHaveLength(0);
  expect(calls.filter(c=>c.url.endsWith('/source'))).toHaveLength(0);
  expect(calls.filter(c=>c.url.endsWith('/complete'))).toHaveLength(1);
  expect(calls.find(c=>c.url.endsWith('/resume'))?.body).toEqual({expectedVersion:2,sourceSha256:'a'.repeat(64),sourceBytes:12,pageCount:3,processingProfile:'balanced-v1'});
});
test('failed upload with matching identity can resume and only uploads server missing pages',async()=>{
  current={...status,state:'failed',errorCode:'storage_failed'};
  let tree=render();tree=await settle();
  find(tree,n=>n.props?.type==='file').props.onChange({target:{files:[new File(['123456789012'],'same.pdf')]}});
  render();tree=await settle();tree=await settle();
  const resume=button(tree,'التحقق من PDF');
  expect(resume.props.disabled).toBe(false);
  resume.props.onClick();await settle();await settle();
  expect(calls.filter(c=>c.url.endsWith('/resume'))).toHaveLength(1);
  expect(rendered).toEqual([2]);
  expect(calls.filter(c=>c.url.endsWith('/source'))).toHaveLength(0);
  expect(calls.filter(c=>c.url.endsWith('/complete'))).toHaveLength(1);
  expect(calls.filter(c=>c.url==='/api/uploads'||c.url.endsWith('/cancel'))).toHaveLength(0);
});
test('pending upload keeps picker usable and mismatch never sends resume or bytes',async()=>{
  let tree=render();tree=await settle();
  const input=find(tree,n=>n.props?.type==='file');expect(input.props.disabled).toBe(false);
  openedHash='b'.repeat(64);
  input.props.onChange({target:{files:[new File(['123456789012'],'different.pdf')]}});
  render();tree=await settle();tree=await settle();
  const start=button(tree,'التحقق من PDF');expect(start.props.disabled).toBe(false);start.props.onClick();
  await settle();tree=await settle();
  expect(calls.some(c=>c.url.endsWith('/resume'))).toBe(false);
  expect(text(find(tree,n=>n.props?.role==='alert'))).toContain('لا يطابق');
});
test('changing quality immediately invalidates preflight until the selected profile is inspected',async()=>{
  props={...props,pendingUploadId:null};current=null;
  let tree=render();tree=await settle();
  find(tree,n=>n.props?.type==='file').props.onChange({target:{files:[new File(['123456789012'],'same.pdf')]}});
  render();tree=await settle();tree=await settle();
  expect(button(tree,'رفع الملف وتجهيز').props.disabled).toBe(false);
  find(tree,n=>n.type==='select').props.onChange({target:{value:'high-v1'}});
  tree=render();
  expect(button(tree,'رفع الملف وتجهيز').props.disabled).toBe(true);
  expect(text(find(tree,n=>n.props?.id==='pdf-file-status'))).toContain('جارٍ فحص');
  tree=await settle();tree=await settle();
  expect(button(tree,'رفع الملف وتجهيز').props.disabled).toBe(false);
});
test('completed upload requires preview before explicit reviewed action and permits retention change',async()=>{
  current={...status,state:'ready'};props={...props,pendingUploadId:null};
  let tree=render();tree=await settle();
  expect(button(tree,'فحصت الصفحات').props.disabled).toBe(true);
  props={...props,previewOpened:true};tree=render();
  expect(button(tree,'فحصت الصفحات').props.disabled).toBe(false);
  await button(tree,'فحصت الصفحات').props.onClick();tree=await settle();
  expect(calls.find(c=>c.url.endsWith('/source-policy'))?.body).toEqual({keepSource:false,reviewed:true});
  const checkbox=find(tree,n=>n.props?.type==='checkbox');await checkbox.props.onChange({target:{checked:true}});await settle();
  expect(calls.filter(c=>c.url.endsWith('/source-policy')).at(-1)?.body).toEqual({keepSource:true});
});
