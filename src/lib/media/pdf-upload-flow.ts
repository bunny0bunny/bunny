import { PDF_UPLOAD_LIMITS } from './contracts';

export type PdfIdentity = { sourceSha256: string; sourceBytes: number; pageCount: number; processingProfile: 'balanced-v1' | 'high-v1' };
type ResumeParts = { sourceSha256: string | null; sourceBytes: number; expectedPages: number; processingProfile: string | null; sourceReady: boolean; readyPageIndices: number[]; pageBytes: number };
export type UploadProgress = { ready: number; total: number; pageBytes: number; sourceBytes: number };
export type UploadPhase = 'idle' | 'source' | 'rendering' | 'uploading' | 'attaching' | 'ready';

export function assertResumeIdentity(status: ResumeParts, identity: PdfIdentity) {
  if (!status.sourceSha256 || status.sourceSha256 !== identity.sourceSha256 || status.sourceBytes !== identity.sourceBytes || status.expectedPages !== identity.pageCount || status.processingProfile !== identity.processingProfile) {
    throw new Error('الملف أو إعداد الجودة لا يطابق محاولة الرفع. اختر نفس PDF ونفس الجودة؛ لم تُرسل أي صفحات.');
  }
}

/** Runs one render and one upload at a time; the authoritative resume response is the only skip list. */
export async function uploadPdfParts(options: {
  file: Blob; pageCount: number; status?: ResumeParts; signal: AbortSignal;
  renderPage: (index: number, signal?: AbortSignal) => Promise<Blob>;
  putSource: () => Promise<unknown>; putPage: (index: number, blob: Blob) => Promise<unknown>;
  onProgress: (value: UploadProgress) => void; onPhase: (value: UploadPhase, index?: number) => void;
}) {
  const { status, signal } = options;
  const received = new Set((status?.readyPageIndices ?? []).filter(index => Number.isInteger(index) && index >= 0 && index < options.pageCount));
  let pageBytes = status?.pageBytes ?? 0;
  let sourceBytes = status?.sourceReady ? status.sourceBytes : 0;
  const report = () => options.onProgress({ ready: received.size, total: options.pageCount, pageBytes, sourceBytes });
  signal.throwIfAborted();
  report();
  if (!status?.sourceReady) {
    options.onPhase('source');
    await options.putSource();
    sourceBytes = options.file.size;
    report();
  }
  for (let index = 0; index < options.pageCount; index++) {
    signal.throwIfAborted();
    if (received.has(index)) continue;
    options.onPhase('rendering', index);
    const blob = await options.renderPage(index, signal);
    signal.throwIfAborted();
    if (options.file.size + pageBytes + blob.size > PDF_UPLOAD_LIMITS.aggregateBytes) throw new Error('إجمالي حجم الملف والصور يتجاوز 200 ميجابايت. عدّل PDF ثم أعد المحاولة.');
    if (blob.size > PDF_UPLOAD_LIMITS.pageBytes || !['image/webp', 'image/jpeg'].includes(blob.type)) throw new Error('تعذّر تجهيز صفحة بحجم وتنسيق مدعومين. عدّل PDF ثم أعد المحاولة.');
    options.onPhase('uploading', index);
    await options.putPage(index, blob);
    pageBytes += blob.size;
    received.add(index);
    report();
  }
}

export function sourcePolicyInput(keepSource: boolean, reviewed: boolean, previewOpened: boolean) {
  if (reviewed && !previewOpened) throw new Error('افتح المعاينة الخاصة وافحص الصفحات أولًا.');
  return { keepSource, ...(reviewed ? { reviewed: true } : {}) };
}
