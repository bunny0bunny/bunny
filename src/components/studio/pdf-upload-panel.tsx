"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PDF_UPLOAD_LIMITS, type StartUploadResponse, type UploadStatus, type UploadStatusResponse } from "@/lib/media/contracts";
import type { WorkingRevision } from "./editorial-editor";

type Props = {
  revisionId: string;
  version: number;
  pendingUploadId?: string | null;
  uploadsEnabled: boolean;
  disabled: boolean;
  unsaved: boolean;
  onBusyChange: (busy: boolean) => void;
  onStarted: (uploadId: string, version: number) => void;
  onRevision: (revision: WorkingRevision) => void;
};
type RevisionResponse = { ok: true; revision: WorkingRevision } | { ok: false; error: string; code: string };

async function request<T extends { ok: boolean }>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
  const result = await response.json().catch(() => null);
  if (!result || !response.ok || !result.ok) throw new Error(result?.error ?? "تعذّر الاتصال بالخادم. تحقق من الاتصال ثم أعد المحاولة.");
  return result as T;
}
const json = (value: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json", "X-Bunny-Upload": "1" }, body: JSON.stringify(value) });

export function PdfUploadPanel(props: Props) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [progress, setProgress] = useState({ ready: 0, total: 0 });
  const controller = useRef<AbortController | null>(null);
  const task = useRef<Promise<void> | null>(null);
  const upload = useRef<{ id: string | null; version: number }>({ id: props.pendingUploadId ?? null, version: props.version });
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const cancellingRef = useRef(false);
  const attached = useRef(false);
  const latestProps = useRef(props);
  useEffect(() => { latestProps.current = props; });
  useEffect(() => {
    if (!busyRef.current && !cancellingRef.current) upload.current = { id: props.pendingUploadId ?? null, version: props.version };
  }, [props.pendingUploadId, props.version]);

  useEffect(() => {
    mounted.current = true;
    const warn = (event: BeforeUnloadEvent) => { if (busyRef.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { mounted.current = false; controller.current?.abort(); window.removeEventListener("beforeunload", warn); };
  }, []);

  useEffect(() => {
    if (!props.pendingUploadId || busyRef.current) return;
    const abort = new AbortController();
    request<UploadStatusResponse>(`/api/uploads/${props.pendingUploadId}`, { signal: abort.signal }).then((result) => {
      if (result.ok) {
        setStatus(result.status);
        upload.current.version = result.status.revisionVersion;
        latestProps.current.onStarted(result.status.uploadId, result.status.revisionVersion);
      }
    }).catch((cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "تعذّر قراءة حالة الرفع. أعد تحميل الصفحة أو حاول إلغاء الرفع."); });
    return () => abort.abort();
  }, [props.pendingUploadId]);

  function setWorking(value: boolean) {
    busyRef.current = value;
    if (mounted.current) { setBusy(value); latestProps.current.onBusyChange(value || cancellingRef.current); }
  }

  function start() {
    if (!file || props.disabled || props.unsaved || !props.uploadsEnabled || props.pendingUploadId || busyRef.current || cancellingRef.current) return;
    const selected = file;
    const abort = new AbortController();
    controller.current = abort;
    attached.current = false;
    setWorking(true);
    setError(null);
    setStatus(null);
    setProgress({ ready: 0, total: 0 });
    task.current = (async () => {
      let document: Awaited<ReturnType<typeof import("@/lib/media/pdf-client").openPdf>> | undefined;
      try {
        setMessage("جارٍ التحقق من ملف PDF…");
        if (selected.size > PDF_UPLOAD_LIMITS.sourceBytes) throw new Error("حجم PDF يتجاوز 30 ميجابايت. اختر ملفًا أصغر.");
        const { openPdf } = await import("@/lib/media/pdf-client");
        document = await openPdf(selected, abort.signal);
        abort.signal.throwIfAborted();
        setProgress({ ready: 0, total: document.pageCount });
        // Do not abort start: obtain its committed ID before a concurrent cancellation.
        const started = await request<StartUploadResponse>("/api/uploads", json({ revisionId: props.revisionId, expectedVersion: props.version, sourceName: selected.name, sourceBytes: selected.size, pageCount: document.pageCount }));
        if (!started.ok) return;
        upload.current = { id: started.uploadId, version: started.revisionVersion };
        if (mounted.current) latestProps.current.onStarted(started.uploadId, started.revisionVersion);
        abort.signal.throwIfAborted();
        setMessage("جارٍ رفع ملف PDF الأصلي الخاص…");
        // Content-Length is supplied by the browser for these Blob bodies.
        await request(`/api/uploads/${started.uploadId}/source`, { method: "PUT", headers: { "Content-Type": "application/pdf", "X-Bunny-Upload": "1" }, body: selected, signal: abort.signal });
        let totalBytes = selected.size;
        for (let index = 0; index < document.pageCount; index++) {
          abort.signal.throwIfAborted();
          setMessage(`جارٍ تجهيز ورفع الصفحة ${index + 1} من ${document.pageCount}…`);
          const blob = await document.renderPage(index, abort.signal);
          totalBytes += blob.size;
          if (totalBytes > PDF_UPLOAD_LIMITS.aggregateBytes) throw new Error("إجمالي حجم الملف والصور يتجاوز 200 ميجابايت. قلّل حجم PDF ثم أعد رفع الملف كاملًا.");
          if (blob.size > PDF_UPLOAD_LIMITS.pageBytes || !["image/webp", "image/jpeg"].includes(blob.type)) throw new Error("تعذّر تجهيز صفحة بحجم وتنسيق مدعومين. عدّل PDF ثم أعد المحاولة.");
          await request(`/api/uploads/${started.uploadId}/pages/${index}`, { method: "PUT", headers: { "Content-Type": blob.type, "X-Bunny-Upload": "1" }, body: blob, signal: abort.signal });
          setProgress({ ready: index + 1, total: document.pageCount });
        }
        abort.signal.throwIfAborted();
        setMessage("جارٍ إرفاق الصفحات بالمسودة…");
        const completed = await request<RevisionResponse>(`/api/uploads/${started.uploadId}/complete`, json({ expectedVersion: upload.current.version }));
        if (completed.ok) {
          attached.current = true;
          upload.current = { id: null, version: completed.revision.version };
          if (mounted.current) { latestProps.current.onRevision(completed.revision); setMessage("اكتمل الرفع. افتح المعاينة الخاصة وافحص الصفحات قبل إرسال النسخة للمراجعة."); }
        }
      } catch (cause) {
        if (mounted.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : "تعذّر تجهيز الملف. ألغِ المحاولة ثم أعد رفع الملف كاملًا.");
      } finally {
        try { await document?.destroy(); } catch { /* The abort may already have destroyed the worker. */ }
        setWorking(false);
      }
    })();
  }

  async function cancel() {
    if (cancellingRef.current) return;
    cancellingRef.current = true;
    setCancelling(true);
    props.onBusyChange(true);
    controller.current?.abort();
    try {
      await task.current;
      const current = upload.current;
      if (current.id) {
        const result = await request<RevisionResponse>(`/api/uploads/${current.id}/cancel`, json({ expectedVersion: current.version }));
        if (result.ok) {
          upload.current = { id: null, version: result.revision.version };
          latestProps.current.onRevision(result.revision);
        }
      }
      setStatus(null);
      setError(null);
      setMessage(attached.current ? "اكتمل إرفاق الصفحات قبل تأكيد الإلغاء. افحص المعاينة الخاصة؛ لم تُنشر النسخة." : "أُلغي الرفع. يمكنك اختيار ملف وإعادة الرفع من البداية؛ صفحات المسودة السابقة محفوظة.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذّر تأكيد الإلغاء. تبقى إجراءات النسخة محظورة؛ حاول الإلغاء مرة أخرى.");
    } finally {
      cancellingRef.current = false;
      setCancelling(false);
      latestProps.current.onBusyChange(false);
    }
  }

  const blocked = props.disabled || props.unsaved || busy || cancelling || Boolean(props.pendingUploadId) || !props.uploadsEnabled;
  return (
    <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-5" aria-labelledby={`${inputId}-heading`} aria-busy={busy || cancelling}>
      <h2 id={`${inputId}-heading`} className="text-base font-bold">رفع فصل من PDF</h2>
      <p className="text-sm leading-7 text-muted-foreground">تُجهّز الصفحات في متصفحك دون اشتراك. أبقِ هذه الصفحة مفتوحة حتى اكتمال الرفع. يبقى الملف الأصلي خاصًا، والصفحات مسودة للمعاينة والمراجعة؛ لن تُنشر تلقائيًا.</p>
      <p className="text-xs leading-6 text-muted-foreground">حتى 30 ميجابايت و200 صفحة. لتعديل الصفحات أو ترتيبها، عدّل PDF خارجيًا ثم استبدل الملف كاملًا.</p>
      {!props.uploadsEnabled && <p role="status" className="text-sm text-muted-foreground">رفع PDF غير مفعّل حاليًا على هذا الموقع.</p>}
      {props.unsaved && <p className="text-sm text-gold">احفظ عنوان الفصل وتغييرات المسودة أولًا لبدء رفع PDF.</p>}
      {props.pendingUploadId && !busy && <div className="space-y-1 text-sm leading-7"><p>يوجد رفع غير مكتمل. لا يستمر تجهيز الصفحات بعد إغلاق التبويب. ألغِ المحاولة الحالية ثم ابدأ رفع الملف كاملًا من جديد.</p>{status && <><p className="text-muted-foreground">الصفحات المستلمة: {status.readyPages} من {status.expectedPages} · الملف الأصلي: {status.sourceReady ? "مستلم" : "لم يكتمل"} · {status.state === "failed" ? "تعذّرت المحاولة" : "بانتظار الإكمال أو الإلغاء"}{status.errorCode ? " — تحتاج المحاولة إلى إلغاء وإعادة رفع." : ""}</p><p className="text-xs text-muted-foreground">تنتهي مهلة المحاولة: {new Date(status.expiresAt).toLocaleString("ar-EG")}</p>{["ready", "cancelled", "superseded"].includes(status.state) && <Button type="button" variant="outline" className="min-h-11" onClick={() => window.location.reload()}>إعادة تحميل آخر نسخة محفوظة</Button>}</>}</div>}
      <div className="space-y-2">
        <label htmlFor={inputId} className="block text-sm font-medium">اختر ملف PDF للفصل</label>
        <input id={inputId} type="file" accept="application/pdf,.pdf" disabled={blocked} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); setMessage(""); }} className="block min-h-11 w-full min-w-0 rounded-md border border-input bg-background p-2 text-sm file:me-3 file:min-h-11 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" />
      </div>
      <div role="status" aria-live="polite" className="space-y-2 text-sm">
        {message && <p>{message}</p>}
        {progress.total > 0 && <><progress className="h-2 w-full accent-primary" max={progress.total} value={progress.ready} aria-label="الصفحات المرفوعة" /><p className="text-xs text-muted-foreground">{progress.ready} / {progress.total} صفحة مرفوعة</p></>}
      </div>
      {error && <div className="space-y-2"><p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm leading-7 text-danger">{error}</p><Button type="button" variant="ghost" disabled={busy || cancelling} className="min-h-11" onClick={() => window.location.reload()}>إعادة تحميل حالة النسخة من الخادم</Button></div>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={start} disabled={blocked || !file} className="min-h-11">رفع الملف كاملًا وتجهيز المعاينة</Button>
        {(busy || props.pendingUploadId) && <Button type="button" variant="outline" onClick={cancel} disabled={cancelling} className="min-h-11">{cancelling ? "جارٍ تأكيد الإلغاء…" : "إلغاء الرفع لإعادة المحاولة"}</Button>}
      </div>
    </section>
  );
}
