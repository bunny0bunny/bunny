import{test}from'node:test';import assert from'node:assert/strict';
import{getWorkTitle,getWorkTitles,workTitleIssue}from'../../src/lib/work-title.ts';
test('English is primary, Arabic is secondary, and stored values are not changed',()=>{
 const work={titleOriginal:' Strobe Edge ',titleAr:' وميض الضوء '};
 assert.deepEqual(getWorkTitles(work),{primary:'Strobe Edge',secondary:'وميض الضوء'});
 assert.equal(getWorkTitle(work),'Strobe Edge');assert.equal(work.titleAr,' وميض الضوء ');
});
test('legacy Arabic-only works keep their title; duplicate secondary titles are hidden',()=>{
 assert.deepEqual(getWorkTitles({titleAr:'وميض الضوء',titleOriginal:'  '}),{primary:'وميض الضوء',secondary:null});
 assert.deepEqual(getWorkTitles({titleAr:'Strobe Edge',titleOriginal:'Strobe Edge'}),{primary:'Strobe Edge',secondary:null});
});
test('new works require an English title and Arabic is optional; legacy edits remain possible',()=>{
 assert.ok(workTitleIssue({titleAr:'عنوان عربي'}));
 assert.equal(workTitleIssue({titleOriginal:'Strobe Edge',titleAr:''}),null);
 assert.equal(workTitleIssue({id:'existing',titleAr:'عنوان عربي'}),null);
 assert.ok(workTitleIssue({id:'existing',titleAr:'',titleOriginal:''}));
});
