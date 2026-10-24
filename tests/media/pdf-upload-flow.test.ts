import { expect, test } from "bun:test";
import { assertResumeIdentity, uploadPdfParts, sourcePolicyInput } from "../../src/lib/media/pdf-upload-flow";
const identity = { sourceSha256: 'a'.repeat(64), sourceBytes: 12, pageCount: 3, processingProfile: 'balanced-v1' as const };
const status = { sourceSha256: identity.sourceSha256, sourceBytes: 12, expectedPages: 3, processingProfile: 'balanced-v1', sourceReady: true, readyPageIndices: [0, 2], pageBytes: 8 };
test('resume refuses a different file or processing profile before sending bytes', () => {
  expect(() => assertResumeIdentity(status, identity)).not.toThrow();
  for (const changed of [{sourceSha256:'b'.repeat(64)}, {sourceBytes:13}, {pageCount:4}, {processingProfile:'high-v1' as const}]) expect(() => assertResumeIdentity(status, {...identity,...changed})).toThrow();
  expect(() => assertResumeIdentity({...status,sourceSha256:null}, identity)).toThrow();
});
test('resumed runner skips only server verified source and page indexes sequentially', async () => {
  const events: string[] = []; const progress: unknown[] = [];
  await uploadPdfParts({ file: new Blob(['source']), pageCount: 3, status,
    signal: new AbortController().signal,
    renderPage: async (index: number) => { events.push(`render:${index}`); return new Blob(['page'],{type:'image/webp'}); },
    putSource: async () => {events.push('source');}, putPage: async (index: number) => {events.push(`put:${index}`);},
    onProgress: (value: unknown) => progress.push(value), onPhase: (phase: string) => events.push(phase),
  });
  expect(events).toEqual(['rendering','render:1','uploading','put:1']);
  expect(progress.at(-1)).toEqual({ready:3,total:3,pageBytes:12,sourceBytes:12});
});
test('fresh runner reports source then render/upload separately and stops at first failure', async () => {
  const events: string[] = [];
  await expect(uploadPdfParts({file:new Blob(['source']),pageCount:3,signal:new AbortController().signal,
    renderPage:async (i:number)=>{events.push(`render:${i}`);return new Blob(['page'],{type:'image/webp'});},
    putSource:async()=>{events.push('source');},putPage:async(i:number)=>{events.push(`put:${i}`);throw Error('offline');},onProgress:()=>{},onPhase:(s:string)=>events.push(s),
  })).rejects.toThrow('offline');
  expect(events).toEqual(['source','source','rendering','render:0','uploading','put:0']);
});
test('review confirmation needs preview opened; permanent policy remains independently editable', () => {
  expect(() => sourcePolicyInput(false,true,false)).toThrow();
  expect(sourcePolicyInput(false,true,true)).toEqual({keepSource:false,reviewed:true});
  expect(sourcePolicyInput(true,false,false)).toEqual({keepSource:true});
});
test('aborted runner dispatches no source, render or page upload', async () => {
  const abort = new AbortController(); abort.abort();
  let calls = 0;
  await expect(uploadPdfParts({ file:new Blob(['source']),pageCount:3,signal:abort.signal,
    renderPage:async()=>{calls++;return new Blob(['page'],{type:'image/webp'});},
    putSource:async()=>{calls++;},putPage:async()=>{calls++;},onProgress:()=>{},onPhase:()=>{},
  })).rejects.toThrow();
  expect(calls).toBe(0);
});
