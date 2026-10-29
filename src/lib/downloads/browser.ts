import { ImagePdf, pageTiles } from './pdf';

type ManifestPage = { assetId: string; width: number; height: number; bytes: number; mime: string };
type Manifest = { filename: string; fingerprint: string; pages: ManifestPage[] };
let preparing = false;

async function manifest(chapterId: string, signal: AbortSignal): Promise<Manifest> {
  const response = await fetch(`/api/chapters/${chapterId}/download`, { method: 'POST', signal, cache: 'no-store', headers: { 'X-Chapter-Download': '1' } });
  const data = await response.json();
  if (!response.ok || data.ok !== true) throw new Error(typeof data.error === 'string' ? data.error : 'unavailable');
  if (typeof data.filename !== 'string' || data.filename.length > 180 || !data.filename.endsWith('.pdf') ||
    typeof data.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(data.fingerprint) || !Array.isArray(data.pages) || !data.pages.length || data.pages.length > 200) throw new Error('invalid_image');
  for (const page of data.pages) {
    if (!/^[a-zA-Z0-9]+$/.test(page.assetId) || !['image/jpeg', 'image/webp'].includes(page.mime) ||
      !Number.isSafeInteger(page.bytes) || page.bytes < 1 || page.bytes > 6 * 1024 * 1024) throw new Error('invalid_image');
    pageTiles(page.width, page.height);
  }
  return data;
}

async function pageBlob(response: Response, page: ManifestPage, signal: AbortSignal): Promise<Blob> {
  if (!response.ok) {
    let code = 'unavailable';
    try { const data = await response.json(); if (typeof data.error === 'string') code = data.error; } catch { /* Generic failure for upstream non-JSON responses. */ }
    throw new Error(code);
  }
  if (response.headers.get('content-type')?.split(';')[0] !== page.mime || !response.body) throw new Error('invalid_image');
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) !== page.bytes) { await response.body.cancel(); throw new Error('invalid_image'); }
  const reader = response.body.getReader();
  const chunks: BlobPart[] = []; let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > page.bytes) throw new Error('invalid_image');
      chunks.push(new Uint8Array(chunk.value));
    }
    if (bytes !== page.bytes) throw new Error('invalid_image');
    return new Blob(chunks, { type: page.mime });
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('invalid_image')), 'image/jpeg', 0.92));
}

/** Native browser decoding avoids putting WebP/WASM memory on the hosting Worker. */
export async function prepareChapterDownload(chapterId: string, options: {
  signal: AbortSignal; onProgress: (current: number, total: number) => void;
}): Promise<{ blob: Blob; filename: string }> {
  options.signal.throwIfAborted();
  if (!/^[a-zA-Z0-9]+$/.test(chapterId)) throw new Error('not_found');
  if (preparing) throw new Error('busy');
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') throw new Error('unsupported_browser');
  preparing = true;
  let canvas: HTMLCanvasElement | undefined;
  try {
    canvas = document.createElement('canvas');
    const source = await manifest(chapterId, options.signal);
    const pdf = new ImagePdf();
    options.onProgress(0, source.pages.length);
    for (const [index, page] of source.pages.entries()) {
      options.signal.throwIfAborted();
      const response = await fetch(`/api/chapters/${chapterId}/download/pages/${page.assetId}?fingerprint=${source.fingerprint}`, {
        signal: options.signal, cache: 'no-store', headers: { 'X-Chapter-Download': '1' },
      });
      const image = await pageBlob(response, page, options.signal);
      options.signal.throwIfAborted();
      const bitmap = await createImageBitmap(image, { imageOrientation: 'none' });
      try {
        if (bitmap.width !== page.width || bitmap.height !== page.height) throw new Error('invalid_image');
        for (const tile of pageTiles(page.width, page.height)) {
          options.signal.throwIfAborted();
          canvas.width = tile.width; canvas.height = tile.height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('unsupported_browser');
          context.fillStyle = '#ffffff'; context.fillRect(0, 0, tile.width, tile.height);
          context.drawImage(bitmap, 0, tile.sourceY, page.width, tile.sourceHeight, 0, 0, tile.width, tile.height);
          const jpeg = await encodeJpeg(canvas);
          options.signal.throwIfAborted();
          pdf.addJpeg(new Uint8Array(await jpeg.arrayBuffer()), tile.width, tile.height);
        }
      } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
      options.onProgress(index + 1, source.pages.length);
    }
    // Reject a mixed/stale result if publishing, withdrawal or permissions changed.
    const current = await manifest(chapterId, options.signal);
    if (current.fingerprint !== source.fingerprint) throw new Error('conflict');
    options.signal.throwIfAborted();
    return { blob: pdf.finish(), filename: current.filename };
  } finally { if (canvas) { canvas.width = 0; canvas.height = 0; } preparing = false; }
}
