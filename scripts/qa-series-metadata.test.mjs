import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),folder=path.join(root,'.local-preview/series-metadata-tests');await mkdir(folder,{recursive:true});
const mocks={
 'server-only':'',
 '@/lib/db':'export const db=new Proxy({},{get:(_,key)=>globalThis.seriesTestDb[key]});',
 '@/lib/queries':'export const currentProfileOrNull=async()=>({id:"admin",role:"admin"});',
 '@/lib/editorial':'export const withSerializableTx=async work=>work(globalThis.seriesTestDb,{id:"admin",role:globalThis.seriesTxRole??"admin"});',
 '@/lib/notifications':'export const notifyNewChapter=async()=>{};export const notifyCommentLike=async()=>{};',
 'next/cache':'export const revalidatePath=()=>{};',
 '@/lib/team-access':'export const isStaffRole=role=>["admin","editor","contributor"].includes(role);export const isAssignableRole=()=>true;export const isAssignedToSeries=async()=>true;',
};
const out=path.join(folder,'actions.mjs');await build({stdin:{contents:"export{upsertSeries}from'./src/lib/actions';",resolveDir:root,loader:'ts'},outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'ports',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]!==undefined?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],resolveDir:root}));}}]});
const {upsertSeries}=await import(pathToFileURL(out));
const input={id:'series',slug:'existing',titleAr:'عمل اختبار',synopsisAr:'وصف كاف للفحص المحلي فقط، دون أي محتوى حقيقي.',format:'novel',category:'novel',status:'ongoing',author:'QA',genres:['دراما'],isFeatured:false};
function setup({chapters=1,role='admin'}={}){const existing={id:'series',slug:'existing',category:'manga',format:'manga',_count:{chapters}};let writes=0;globalThis.seriesTxRole=role;globalThis.seriesTestDb={series:{findUnique:async()=>existing,update:async({data})=>{writes++;return{...existing,...data}},create:async()=>{writes++;throw Object.assign(new Error('duplicate'),{code:'P2002'})}}};return()=>writes;}
test('series with any chapter cannot change reading format or existing links',async()=>{const writes=setup();const r=await upsertSeries(input);assert.equal(r.ok,false);assert.match(r.error,/طريقة القراءة/);assert.equal(writes(),0);});
test('manga to webtoon also preserves existing published reader URLs',async()=>{const writes=setup();const r=await upsertSeries({...input,format:'webtoon',category:'manhwa'});assert.equal(r.ok,false);assert.equal(writes(),0);});
test('empty series may correct its format before adding content',async()=>{const writes=setup({chapters:0});const r=await upsertSeries(input);assert.equal(r.ok,true);assert.equal(writes(),1);});
test('metadata-only edits remain allowed for series with chapters',async()=>{const writes=setup();const r=await upsertSeries({...input,format:'manga',category:'manga'});assert.equal(r.ok,true);assert.equal(writes(),1);});
test('server enforces the immutable slug promised by the form',async()=>{const writes=setup();const r=await upsertSeries({...input,slug:'changed',format:'manga',category:'manga'});assert.equal(r.ok,false);assert.equal(writes(),0);});
test('transaction actor must still be admin after preflight authentication',async()=>{const writes=setup({chapters:0,role:'contributor'});const r=await upsertSeries(input);assert.equal(r.ok,false);assert.equal(writes(),0);});
test('duplicate creation returns an editable known error instead of throwing',async()=>{setup();const{id,...newInput}=input;const r=await upsertSeries(newInput);assert.equal(r.ok,false);assert.match(r.error,/المعرّف.*مستخدم/);});
