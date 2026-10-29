import { afterEach, expect, test } from 'bun:test';
import sharp from 'sharp';
import { prepareChapterDownload } from '../../src/lib/downloads/browser';

const oldFetch = globalThis.fetch;
const oldBitmap = globalThis.createImageBitmap;
const oldDocument = globalThis.document;
afterEach(() => { globalThis.fetch = oldFetch; globalThis.createImageBitmap = oldBitmap; globalThis.document = oldDocument; });
const manifest = { ok: true, filename: 'Work - Chapter 7.6.pdf', fingerprint: 'a'.repeat(64), pages: [{ assetId: 'asset1', width: 20, height: 30, mime: 'image/webp', bytes: 4 }] };

function platform() {
  let closed = 0;
  globalThis.createImageBitmap = (async () => ({ width: 20, height: 30, close() { closed++; } })) as unknown as typeof createImageBitmap;
  globalThis.document = { createElement() {
    const canvas = { width: 0, height: 0, getContext() { return { fillStyle: '', fillRect() {}, drawImage() {} }; }, toBlob(callback: (blob: Blob) => void) {
      void sharp({ create: { width: canvas.width, height: canvas.height, channels: 3, background: 'white' } }).jpeg().toBuffer().then(buffer => callback(new Blob([buffer])));
    } };
    return canvas;
  } } as unknown as Document;
  return () => closed;
}

test('prepares PDF sequentially and confirms current content before returning it', async () => {
  const closed = platform();
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => { calls.push(url); return url.includes('/pages/') ? new Response(new Uint8Array(4), { headers: { 'Content-Type': 'image/webp' } }) : Response.json(manifest); }) as typeof fetch;
  const progress: number[] = [];
  const result = await prepareChapterDownload('chapter1', { signal: new AbortController().signal, onProgress: current => progress.push(current) });
  expect(result.filename).toBe(manifest.filename);
  expect(result.blob.type).toBe('application/pdf');
  expect(closed()).toBe(1);
  expect(calls.length).toBe(3);
  expect(progress).toEqual([0, 1]);
});

test('withdrawal or replacement during generation discards the result and releases bitmap', async () => {
  const closed = platform(); let checks = 0;
  globalThis.fetch = (async (url: string) => url.includes('/pages/') ? new Response(new Uint8Array(4), { headers: { 'Content-Type': 'image/webp' } }) : Response.json(++checks === 1 ? manifest : { ...manifest, fingerprint: 'b'.repeat(64) })) as typeof fetch;
  await expect(prepareChapterDownload('chapter1', { signal: new AbortController().signal, onProgress() {} })).rejects.toThrow('conflict');
  expect(closed()).toBe(1);
});

test('rejects oversized body before decode, and cancellation never starts a fetch', async () => {
  const closed = platform();
  let fetched = 0;
  globalThis.fetch = (async (url: string) => { fetched++; return url.includes('/pages/') ? new Response(new Uint8Array(5), { headers: { 'Content-Type': 'image/webp' } }) : Response.json(manifest); }) as typeof fetch;
  await expect(prepareChapterDownload('chapter1', { signal: new AbortController().signal, onProgress() {} })).rejects.toThrow('invalid_image');
  expect(closed()).toBe(0);
  const abort = new AbortController(); abort.abort(); const before = fetched;
  await expect(prepareChapterDownload('chapter1', { signal: abort.signal, onProgress() {} })).rejects.toThrow();
  expect(fetched).toBe(before);
});
