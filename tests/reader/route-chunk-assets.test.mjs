import{test}from'node:test';import assert from'node:assert/strict';
import{serveRouteChunk}from'../../src/lib/route-chunk-assets.mjs';
import{prepareRouteChunks}from'../../scripts/prepare-route-chunks.mjs';
import{mkdtemp,mkdir,writeFile,readFile,rm}from'node:fs/promises';
import path from'node:path';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
test('known dynamic chunk paths resolve through a flat static alias',async()=>{
 const target='/_next/static/route-chunks/'+'a'.repeat(64)+'.js';
 const aliases={'/_next/static/chunks/app/read/[slug]/page-abc.js':target},calls=[];
 const env={ASSETS:{fetch:async request=>{calls.push(request.url);return new Response('verified script',{headers:{'content-type':'application/javascript'}});}}};
 const response=await serveRouteChunk(new Request('https://example.com/_next/static/chunks/app/read/%5Bslug%5D/page-abc.js'),env,aliases);
 assert.equal(await response.text(),'verified script');assert.deepEqual(calls,['https://example.com'+target]);
 assert.equal(await serveRouteChunk(new Request('https://example.com/api/private'),env,aliases),null);
 assert.equal(await serveRouteChunk(new Request('https://example.com/_next/static/chunks/missing.js'),env,aliases),null);
 assert.equal(await serveRouteChunk(new Request('https://example.com/_next/static/chunks/app/read/%5Bslug%5D/page-abc.js',{method:'POST'}),env,aliases),null);
});
test('generation aliases only bracket-named framework chunks and preserves exact bytes',async t=>{
 const prefix=path.join(tmpdir(),'bunyora-route-chunks-'),output=await mkdtemp(prefix);
 t.after(async()=>{assert.ok(path.resolve(output).startsWith(path.resolve(prefix)));await rm(output,{recursive:true,force:true});});
 const chunks=path.join(output,'assets/_next/static/chunks');await mkdir(path.join(chunks,'app/[slug]'),{recursive:true});
 await writeFile(path.join(chunks,'app/[slug]/page.js'),'window.testChunk=true;');
 await writeFile(path.join(chunks,'normal.js'),'normal');await writeFile(path.join(chunks,'app/[slug]/private.pdf'),'private');
 assert.equal(await prepareRouteChunks(output),1);
 const generated=await readFile(path.join(output,'route-chunk-aliases.mjs'),'utf8');
 const aliases=JSON.parse(generated.slice('export default '.length).trim().replace(/;$/,''));
 const original='/_next/static/chunks/app/[slug]/page.js',alias=aliases[original];
 assert.match(alias,/^\/_next\/static\/route-chunks\/[a-f0-9]{64}\.js$/);
 assert.equal(await readFile(path.join(output,'assets',alias),'utf8'),'window.testChunk=true;');
 assert.ok(alias.includes(createHash('sha256').update('window.testChunk=true;').digest('hex')));
});
