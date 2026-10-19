import "client-only";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

const SOURCE_LIMIT_BYTES = 30 * 1024 * 1024; // 30 MiB
const PAGE_LIMIT_BYTES = 6 * 1024 * 1024;    // 6 MiB
const MAX_PAGES = 200;
const TARGET_WIDTH = 1440;
const MAX_PIXELS = 16_777_216;
const MAX_EDGE = 16_000;
const CANVAS_MAX_AREA_BYTES = 67_108_864;

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("تم إلغاء العملية", "AbortError");
}

export async function openPdf(
  file: File,
  signal?: AbortSignal
): Promise<{
  pageCount: number;
  renderPage(index: number, pageSignal?: AbortSignal): Promise<Blob>;
  destroy(): Promise<void>;
}> {
  checkAbort(signal);

  if (!file || file.size === 0) {
    throw new Error("ملف PDF فارغ أو غير صالح.");
  }
  if (file.size > SOURCE_LIMIT_BYTES) {
    throw new Error("حجم ملف PDF يتجاوز الحد الأقصى المسموح به (30 ميغابايت).");
  }

  const buffer = await file.arrayBuffer();
  checkAbort(signal);

  const header = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 5));
  const isPdf =
    header.length >= 5 &&
    header[0] === 0x25 && // %
    header[1] === 0x50 && // P
    header[2] === 0x44 && // D
    header[3] === 0x46 && // F
    header[4] === 0x2d;   // -

  if (!isPdf) {
    throw new Error("الملف المحدد ليس ملف PDF صالحًا (توقيع الملف غير مطابق).");
  }

  const moduleUrl = `${window.location.origin}/vendor/pdfjs/pdf.min.mjs`;
  const pdfjs: typeof import("pdfjs-dist") = await import(/* webpackIgnore: true */ moduleUrl);
  checkAbort(signal);

  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    enableXfa: false,
    stopAtErrors: true,
    maxImageSize: MAX_PIXELS,
    canvasMaxAreaInBytes: CANVAS_MAX_AREA_BYTES,
    cMapUrl: "/vendor/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
    wasmUrl: "/vendor/pdfjs/wasm/",
  });

  let isDestroyed = false;
  const safeDestroy = async () => {
    if (isDestroyed) return;
    isDestroyed = true;
    try {
      await loadingTask.destroy();
    } catch (e) {
      if (!isAbortError(e)) {
        /* ignore expected destruction errors */
      }
    }
  };


  const abortListener = () => {
    void safeDestroy();
  };
  signal?.addEventListener("abort", abortListener, { once: true });

  let doc: PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (err: unknown) {
    signal?.removeEventListener("abort", abortListener);
    await safeDestroy();
    if (isAbortError(err)) throw err;
    if (err instanceof Error && ["PasswordException", "NeedPasswordException"].includes(err.name)) {
      throw new Error("ملف PDF مشفر أو يتطلب كلمة مرور؛ لا يمكن معالجته.");
    }
    checkAbort(signal);
    throw new Error("تعذّر قراءة ملف PDF. تأكد أنه سليم وغير محمي بكلمة مرور.");
  }

  const pageCount: number = doc.numPages;
  if (!pageCount || pageCount < 1) {
    signal?.removeEventListener("abort", abortListener);
    await safeDestroy();
    throw new Error("ملف PDF لا يحتوي على أي صفحات صالحة.");
  }
  if (pageCount > MAX_PAGES) {
    signal?.removeEventListener("abort", abortListener);
    await safeDestroy();
    throw new Error(`عدد صفحات الملف (${pageCount}) يتجاوز الحد الأقصى (${MAX_PAGES} صفحة).`);
  }

  let isRendering = false;

  return {
    pageCount,

    async renderPage(index: number, pageSignal?: AbortSignal): Promise<Blob> {
      if (isDestroyed) throw new Error("تم إغلاق مستند PDF مسبقًا.");
      if (!Number.isInteger(index) || index < 0 || index >= pageCount) {
        throw new RangeError(`فهرس الصفحة غير صالح: ${index}`);
      }
      if (isRendering) {
        throw new Error("تجري معالجة صفحة أخرى حاليًا؛ المعالجة يجب أن تكون تتابعية.");
      }
      checkAbort(signal);
      checkAbort(pageSignal);

      isRendering = true;
      let page: PDFPageProxy | null = null;
      let canvas: HTMLCanvasElement | null = null;

      const mergedAbort = new AbortController();
      const onParentAbort = () => mergedAbort.abort();
      const onPageAbort = () => mergedAbort.abort();

      signal?.addEventListener("abort", onParentAbort, { once: true });
      pageSignal?.addEventListener("abort", onPageAbort, { once: true });

      try {
        page = await doc.getPage(index + 1);
        checkAbort(mergedAbort.signal);

        const unscaledViewport = page.getViewport({ scale: 1 });
        if (![unscaledViewport.width, unscaledViewport.height].every(value => Number.isFinite(value) && value > 0)) {
          throw new Error("أبعاد الصفحة غير صالحة.");
        }
        let scale = TARGET_WIDTH / unscaledViewport.width;
        let w = Math.max(1, Math.floor(unscaledViewport.width * scale));
        let h = Math.max(1, Math.floor(unscaledViewport.height * scale));

        const maxDim = Math.max(w, h);
        if (maxDim > MAX_EDGE) {
          scale *= MAX_EDGE / maxDim;
          w = Math.max(1, Math.floor(unscaledViewport.width * scale));
          h = Math.max(1, Math.floor(unscaledViewport.height * scale));
        }

        const totalPixels = w * h;
        if (totalPixels > MAX_PIXELS) {
          scale *= Math.sqrt(MAX_PIXELS / totalPixels);
          w = Math.max(1, Math.floor(unscaledViewport.width * scale));
          h = Math.max(1, Math.floor(unscaledViewport.height * scale));
        }

        canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("تعذّر تهيئة سياق الرسم في المتصفح.");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);

        const renderTask = page.render({
          canvas,
          canvasContext: ctx,
          viewport: page.getViewport({ scale }),
        });

        const cancelRender = () => {
          try {
            renderTask.cancel();
          } catch {}
        };
        mergedAbort.signal.addEventListener("abort", cancelRender, { once: true });

        try {
          await renderTask.promise;
        } finally {
          mergedAbort.signal.removeEventListener("abort", cancelRender);
        }

        checkAbort(mergedAbort.signal);

        let blob = await new Promise<Blob | null>((resolve) =>
          canvas!.toBlob(resolve, "image/webp", 0.85)
        );

        if (!blob || blob.type !== "image/webp") {
          blob = await new Promise<Blob | null>((resolve) =>
            canvas!.toBlob(resolve, "image/jpeg", 0.9)
          );
        }

        if (!blob || (blob.type !== "image/webp" && blob.type !== "image/jpeg")) {
          throw new Error(`فشل استخراج صورة صالحة للصفحة ${index + 1}.`);
        }
        if (blob.size > PAGE_LIMIT_BYTES) {
          throw new Error(`حجم الصفحة ${index + 1} يتجاوز الحد المسموح به (6 ميغابايت).`);
        }

        checkAbort(mergedAbort.signal);
        return blob;
      } finally {
        isRendering = false;
        signal?.removeEventListener("abort", onParentAbort);
        pageSignal?.removeEventListener("abort", onPageAbort);
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        if (page) {
          try {
            page.cleanup();
          } catch {}
        }
      }
    },

    async destroy(): Promise<void> {
      signal?.removeEventListener("abort", abortListener);
      await safeDestroy();
    },
  };
}
