import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceSeriesCover, coverObjectKey, currentCoverKey, readCoverBytes } from '../src/lib/media/cover-policy.ts';
function setup(role='admin') {
 let path='/old.webp', put=0, removed=0, reads=0;
 const tx={role,findSeries:async()=>({coverPath:path}),reserve:async()=>true,replaceSeries:async(id,previous,next)=>{if(path!==previous)return false;path=next;return true}};
 const deps={transaction:async work=>work(tx),inspect:()=>({mime:'image/webp',width:600,height:900}),storage:{putPage:async()=>{put++},deleteObject:async()=>{removed++}},newId:()=> 'abc123',prefix:'prod'};
 return {deps,tx,get path(){return path},set path(v){path=v},get put(){return put},get removed(){return removed}};
}
const input={seriesId:'series1',previous:'/old.webp',consent:'public-cover',bytes:new Uint8Array(30),mime:'image/webp'};
test('only explicit current independent cover resolves; chapter/private paths never do',()=>{
 const path='/api/covers/series1/abc123.webp';
 assert.equal(currentCoverKey('series1','abc123.webp',path,'prod'),'media/prod/covers-series1/abc123.webp');
 for(const previous of ['/api/media/abc123', '/api/covers/other/abc123.webp','',path+'?x']) assert.equal(currentCoverKey('series1','abc123.webp',previous,'prod'),null);
 assert.equal(currentCoverKey('../series','abc123.webp',path,'prod'),null);
 assert.throws(()=>coverObjectKey('series1','abc123.webp','../prod'));
});
test('admin replacement stores a separate immutable asset before CAS and does not delete old cover',async()=>{
 const s=setup();const result=await replaceSeriesCover(input,s.deps);
 assert.equal(result.ok,true);assert.equal(s.path,'/api/covers/series1/abc123.webp');assert.equal(s.put,1);assert.equal(s.removed,0);
});
for(const role of ['contributor','editor','reader']) test(`${role} cannot upload or publish a cover`,async()=>{
 const s=setup(role);assert.equal((await replaceSeriesCover(input,s.deps)).error,'forbidden');assert.equal(s.put,0);assert.equal(s.path,input.previous);
});
test('consent, mime, dimensions and size rejected before storage',async()=>{
 for(const patch of [{consent:''},{mime:'image/svg+xml'},{bytes:new Uint8Array(0)},{bytes:new Uint8Array(2*1024*1024+1)}]) {const s=setup();assert.equal((await replaceSeriesCover({...input,...patch},s.deps)).ok,false);assert.equal(s.put,0)}
 const s=setup();s.deps.inspect=()=>({mime:'image/webp',width:20000,height:20000});assert.equal((await replaceSeriesCover(input,s.deps)).ok,false);assert.equal(s.put,0);
});
test('storage failure retains previous cover',async()=>{const s=setup();s.deps.storage.putPage=async()=>{throw Error('private detail')};assert.equal((await replaceSeriesCover(input,s.deps)).error,'storage_failed');assert.equal(s.path,input.previous)});
test('rate limit refuses storage without changing current cover',async()=>{const s=setup();s.tx.reserve=async()=>false;assert.equal((await replaceSeriesCover(input,s.deps)).error,'rate_limit');assert.equal(s.put,0);assert.equal(s.path,input.previous)});
test('stale edit rejected before upload',async()=>{const s=setup();s.path='/new.webp';assert.equal((await replaceSeriesCover(input,s.deps)).error,'conflict');assert.equal(s.put,0)});
test('concurrent change or revoked role during storage cannot replace current cover',async()=>{
 for(const revoke of [false,true]){const s=setup();s.deps.storage.putPage=async()=>{if(revoke)s.tx.role='editor';else s.path='/other.webp'};const r=await replaceSeriesCover(input,s.deps);assert.equal(r.error,revoke?'forbidden':'conflict');assert.equal(s.removed,1);assert.notEqual(s.path,'/api/covers/series1/abc123.webp')}
});
test('uncertain database commit never deletes the possibly active new cover',async()=>{const s=setup();s.tx.replaceSeries=async(id,old,path)=>{s.path=path;throw Error('lost commit response')};await assert.rejects(replaceSeriesCover(input,s.deps));assert.equal(s.removed,0)});
test('body reader rejects incorrect length and cancels an oversized stream',async()=>{
 let cancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(11))},cancel(){cancelled=true}});
 await assert.rejects(readCoverBytes(new Request('http://localhost',{method:'POST',body:stream,duplex:'half'}),10));assert.equal(cancelled,true);
 await assert.rejects(readCoverBytes(new Request('http://localhost',{method:'POST',body:new Uint8Array(20)}),10));
 const b=await readCoverBytes(new Request('http://localhost',{method:'POST',body:new Uint8Array(20)}),20);assert.equal(b.length,20);
});
