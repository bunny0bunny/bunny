import { afterAll, afterEach, expect, mock, test } from "bun:test";

mock.module("client-only", () => ({}));
let transferred = false;
let cleanupCount = 0;
let destroyCount = 0;
let failRender = false;
let renderGate: Promise<void> | null = null;
let cancelCount = 0;
let rejectRender: ((e: Error) => void) | null = null;
let webpSupported = true;
let inspectionFails = false;
let calls: Array<{ mime: string; quality: number; width: number; height: number }> = [];
let canvases: Array<{ width: number; height: number }> = [];
const page = {
  getViewport: ({ scale }: { scale: number }) => ({ width: 528 * scale, height: 792 * scale, transform: [scale, 0, 0, -scale, 0, 792 * scale] }),
  getOperatorList: async () => {
    if (inspectionFails) throw new Error("inspection unavailable");
    return { fnArray: [10, 12, 85, 11], argsArray: [null, [528, 0, 0, 792, 0, 0], ["img", 1067, 1600], null] };
  },
  render: () => ({ promise: failRender ? Promise.reject(new Error("render failed")) : renderGate ?? Promise.resolve(), cancel: () => { cancelCount++; rejectRender?.(new DOMException("cancelled", "AbortError")); } }),
  cleanup: () => { cleanupCount++; },
};
const pdfjs = {
  OPS: { dependency: 1, save: 10, restore: 11, transform: 12, paintImageXObject: 85, paintInlineImageXObject: 86 },
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: ({ data }: { data: Uint8Array }) => {
    structuredClone(data.buffer, { transfer: [data.buffer] }); transferred = true;
    return { promise: Promise.resolve({ numPages: 1, getPage: async () => page }), destroy: async () => { destroyCount++; } };
  },
};
mock.module("https://pdf.test/vendor/pdfjs/pdf.min.mjs", () => pdfjs);
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
Object.assign(globalThis, {
  window: { location: { origin: "https://pdf.test" } },
  document: { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: "", fillRect() {} }), toBlob(cb: (b: Blob) => void, mime: string, quality: number) {
      calls.push({ mime, quality, width: this.width, height: this.height });
      cb(new Blob(["image"], { type: mime === "image/webp" && !webpSupported ? "image/png" : mime }));
    } };
    canvases.push(canvas); return canvas;
  } },
});
const { openPdf } = await import("../../src/lib/media/pdf-client");
const file = () => new File(["%PDF-1.7\nfixture"], "chapter.pdf");
afterEach(() => { transferred = false; cleanupCount = destroyCount = cancelCount = 0; failRender = inspectionFails = false; renderGate = null; rejectRender = null; webpSupported = true; calls = []; canvases = []; });
afterAll(() => { Object.assign(globalThis, { window: originalWindow, document: originalDocument }); });

test("fingerprints original bytes before PDF.js transfers them and defaults to balanced WebP", async () => {
  const pdf = await openPdf(file());
  expect(pdf.sourceSha256).toBe("f581fc87f30296eff11777c3ce1b9a8b7077071ad8abedfcba317fef0c807224");
  expect(transferred).toBe(true);
  await pdf.renderPage(0);
  expect(calls[0]).toEqual({ mime: "image/webp", quality: 0.8, width: 1066, height: 1600 });
  expect(cleanupCount).toBe(1);
  expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
  await pdf.destroy(); await pdf.destroy(); expect(destroyCount).toBe(1);
});
test("high profile uses WebP85 and falls back to JPEG90 when needed", async () => {
  webpSupported = false;
  const pdf = await openPdf(file(), undefined, "high-v1");
  expect((await pdf.renderPage(0)).type).toBe("image/jpeg");
  expect(calls.map(c => [c.mime, c.quality])).toEqual([["image/webp", 0.85], ["image/jpeg", 0.9]]);
  await pdf.destroy();
});
test("unavailable image inspection falls back to full reader resolution", async () => {
  inspectionFails = true;
  const pdf = await openPdf(file()); await pdf.renderPage(0);
  expect(calls[0]).toMatchObject({ width: 1440, height: 2160 });
  await pdf.destroy();
});
test("invalid sources and already cancelled work never reach PDF.js", async () => {
  await expect(openPdf(new File(["<html>"], "fake.pdf"))).rejects.toThrow("توقيع");
  await expect(openPdf(new File([], "empty.pdf"))).rejects.toThrow();
  const controller = new AbortController(); controller.abort();
  await expect(openPdf(file(), controller.signal)).rejects.toHaveProperty("name", "AbortError");
  expect(transferred).toBe(false);
});
test("render failure frees the canvas and page and permits another sequential attempt", async () => {
  const pdf = await openPdf(file()); failRender = true;
  await expect(pdf.renderPage(0)).rejects.toThrow("render failed");
  expect(cleanupCount).toBe(1); expect(canvases[0].width).toBe(0);
  failRender = false; await pdf.renderPage(0); await pdf.destroy();
});
test("concurrent pages are rejected and cancellation releases page resources", async () => {
  const pdf = await openPdf(file());
  renderGate = new Promise((_, reject) => { rejectRender = reject; });
  const controller = new AbortController();
  const pending = pdf.renderPage(0, controller.signal);
  await new Promise(resolve => setTimeout(resolve, 0));
  await expect(pdf.renderPage(0)).rejects.toThrow("تتابعية");
  controller.abort(); await expect(pending).rejects.toHaveProperty("name", "AbortError");
  expect(cancelCount).toBe(1); expect(cleanupCount).toBe(1); expect(canvases[0].width).toBe(0);
  await pdf.destroy();
});
