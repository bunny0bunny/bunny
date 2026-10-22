"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { PDF_UPLOAD_LIMITS, type StartUploadResponse, type UploadStatus, type UploadStatusResponse } from "@/lib/media/contracts";
import type { WorkingRevision } from "./editorial-editor";
import { boundedWait, uploadRequest as request, UploadRequestError } from "@/lib/media/upload-request";

type Props = {
  revisionId: string;
  version: number;
  pendingUploadId?: string | null;
  uploadsEnabled: boolean;
  disabled: boolean;
  unsaved: boolean;
  onSaveDraft: () => void;
  onBusyChange: (busy: boolean) => void;
  onStarted: (uploadId: string, version: number) => void;
  onRevision: (revision: WorkingRevision) => void;
};
type RevisionResponse = { ok: true; revision: WorkingRevision } | { ok: false; error: string; code: string };

const json = (value: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json", "X-Bunny-Upload": "1" }, body: JSON.stringify(value) });
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function PdfUploadPanel(props: Props) {
  const inputId = useId();
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [progress, setProgress] = useState({ ready: 0, total: 0 });
  const controller = useRef<AbortController | null>(null);
  const task = useRef<Promise<void> | null>(null);
  const upload = useRef<{ id: string | null; version: number }>({ id: props.pendingUploadId ?? null, version: props.version });
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const cancellingRef = useRef(false);
  const attached = useRef(false);
  const recoveryRef = useRef(false);
  const lastStatusRead = useRef<string | null>(null);
  const latestProps = useRef(props);
  useEffect(() => { latestProps.current = props; });
  useEffect(() => {
    if (!busyRef.current && !cancellingRef.current && !recoveryRef.current) upload.current = { id: props.pendingUploadId ?? null, version: props.version };
  }, [props.pendingUploadId, props.version]);

  useEffect(() => {
    mounted.current = true;
    const warn = (event: BeforeUnloadEvent) => { if (busyRef.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { mounted.current = false; controller.current?.abort(); window.removeEventListener("beforeunload", warn); };
  }, []);

  useEffect(() => {
    if (!props.pendingUploadId || busy || cancelling || recoveryRequired || lastStatusRead.current === props.pendingUploadId) return;
    const abort = new AbortController();
    void refreshStatus(props.pendingUploadId, abort.signal).catch((cause: unknown) => { if (!abort.signal.aborted && mounted.current) setError(cause instanceof Error ? cause.message : "تعذّر قراءة حالة الرفع. أعد تحميل الصفحة أو حاول إلغاء الرفع."); });
    return () => abort.abort();
  }, [props.pendingUploadId, busy, cancelling, recoveryRequired]);

  function requireRecovery(text: string) {
    recoveryRef.current = true;
    if (mounted.current) { setRecoveryRequired(true); setMessage(text); latestProps.current.onBusyChange(true); }
  }

  async function refreshStatus(id: string, signal?: AbortSignal) {
    const result = await request<UploadStatusResponse>(`/api/uploads/${id}`, { signal }, { timeoutMs: 10_000 });
    if (!result.ok || !mounted.current || signal?.aborted || (signal && (busyRef.current || cancellingRef.current))) return;
    const current = result.status;
    lastStatusRead.current = id;
    setStatus(current);
    setProgress({ ready: current.readyPages, total: current.expectedPages });
    upload.current = { id: current.uploadId, version: current.revisionVersion };
    if (["ready", "cancelled", "superseded"].includes(current.state)) {
      attached.current = current.state === "ready";
      requireRecovery(current.state === "ready" ? "اكتمل إرفاق الصفحات على الخادم. أعد تحميل النسخة لرؤية المعاينة المحفوظة؛ لم تُنشر النسخة." : "انتهت محاولة الرفع على الخادم. أعد تحميل آخر نسخة محفوظة قبل بدء محاولة أخرى.");
    } else {
      latestProps.current.onStarted(current.uploadId, current.revisionVersion);
    }
  }

  function setWorking(value: boolean) {
    busyRef.current = value;
    if (mounted.current) { setBusy(value); latestProps.current.onBusyChange(value || cancellingRef.current || recoveryRef.current); }
  }

  function start() {
    if (!file || props.disabled || props.unsaved || !props.uploadsEnabled || props.pendingUploadId || upload.current.id || busyRef.current || cancellingRef.current || recoveryRef.current || task.current) return;
    const selected = file;
    const abort = new AbortController();
    controller.current = abort;
    attached.current = false;
    lastStatusRead.current = null;
    setWorking(true);
    setError(null);
    setStatus(null);
    setProgress({ ready: 0, total: 0 });
    // Publish ownership before preflight can synchronously fail and clear it.
    task.current = Promise.resolve().then(async () => {
      let document: Awaited<ReturnType<typeof import("@/lib/media/pdf-client").openPdf>> | undefined;
      try {
        setMessage("جارٍ التحقق من ملف PDF…");
        if (selected.size > PDF_UPLOAD_LIMITS.sourceBytes) throw new Error("حجم PDF يتجاوز 30 ميجابايت. اختر ملفًا أصغر.");
        const { openPdf } = await import("@/lib/media/pdf-client");
        document = await openPdf(selected, abort.signal);
        abort.signal.throwIfAborted();
        setProgress({ ready: 0, total: document.pageCount });
        // Start/complete have finite deadlines but are not interrupted by the cancel
        // button: obtain their committed result first, or require authoritative recovery.
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
        if (mounted.current) {
          setMessage("");
          setError(abort.signal.aborted ? "توقفت المحاولة. تحقّق من الحالة المحفوظة قبل أي رفع جديد." : cause instanceof Error ? cause.message : "تعذّر تجهيز الملف. ألغِ المحاولة ثم أعد رفع الملف كاملًا.");
          const knownId = upload.current.id;
          if (knownId) {
            try { await refreshStatus(knownId); }
            catch { requireRecovery("تعذّر تأكيد حالة الرفع. أعد تحميل النسخة؛ لا تبدأ رفعًا جديدًا قبل ظهور الحالة المحفوظة."); }
          } else if (cause instanceof UploadRequestError && (cause.ambiguous || cause.code === "active_upload")) {
            requireRecovery("قد يكون الخادم قد بدأ الرفع رغم غياب الرد. أعد تحميل النسخة لإظهار المحاولة الحالية؛ لن نكرر الطلب تلقائيًا.");
          }
        }
      } finally {
        try { if (document) await boundedWait(document.destroy(), 2000); } catch { /* A stopped PDF worker must not leave the interface busy. */ }
        task.current = null;
        setWorking(false);
      }
    });
  }

  async function cancel() {
    if (cancellingRef.current) return;
    cancellingRef.current = true;
    lastStatusRead.current = null;
    setCancelling(true);
    props.onBusyChange(true);
    controller.current?.abort();
    try {
      await boundedWait(task.current ?? Promise.resolve(), 5000);
      if (recoveryRef.current) return;
      const current = upload.current;
      if (current.id) {
        const result = await request<RevisionResponse>(`/api/uploads/${current.id}/cancel`, json({ expectedVersion: current.version }), { timeoutMs: 10_000 });
        if (result.ok) {
          upload.current = { id: null, version: result.revision.version };
          latestProps.current.onRevision(result.revision);
        }
      }
      setStatus(null);
      setError(null);
      if (!attached.current) setProgress({ ready: 0, total: 0 });
      setMessage(attached.current ? "اكتمل إرفاق الصفحات قبل تأكيد الإلغاء. افحص المعاينة الخاصة؛ لم تُنشر النسخة." : "أُلغي الرفع. يمكنك اختيار ملف وإعادة الرفع من البداية؛ صفحات المسودة السابقة محفوظة.");
    } catch (cause) {
      setMessage("");
      setError(cause instanceof Error ? cause.message : "تعذّر تأكيد الإلغاء. تبقى إجراءات النسخة محظورة؛ حاول الإلغاء مرة أخرى.");
      if (task.current) requireRecovery("المحاولة ما زالت تتوقف. أعد تحميل حالة النسخة قبل أي رفع جديد؛ قد تكون بعض الملفات وصلت إلى الخادم.");
      else if (upload.current.id) {
        try { await refreshStatus(upload.current.id); }
        catch { requireRecovery("تعذّر تأكيد الإلغاء من الخادم. أعد تحميل حالة النسخة قبل أي رفع جديد."); }
      }
    } finally {
      cancellingRef.current = false;
      setCancelling(false);
      latestProps.current.onBusyChange(busyRef.current || recoveryRef.current);
    }
  }

  const pickerBlocked = !ready || props.disabled || busy || cancelling || recoveryRequired || Boolean(props.pendingUploadId) || !props.uploadsEnabled;
  const blocked = pickerBlocked || props.unsaved;
  const terminalStatus = status && ["ready", "cancelled", "superseded"].includes(status.state);
  return (
    <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-5" aria-labelledby={`${inputId}-heading`} aria-busy={busy || cancelling}>
      <h2 id={`${inputId}-heading`} className="text-base font-bold">رفع فصل من PDF</h2>
      <p className="text-sm leading-7 text-muted-foreground">تُجهّز الصفحات في متصفحك دون اشتراك. أبقِ هذه الصفحة مفتوحة حتى اكتمال الرفع. يبقى الملف الأصلي خاصًا، والصفحات مسودة للمعاينة والمراجعة؛ لن تُنشر تلقائيًا.</p>
      <p className="text-xs leading-6 text-muted-foreground">حتى 30 ميجابايت و200 صفحة. لتعديل الصفحات أو ترتيبها، عدّل PDF خارجيًا ثم استبدل الملف كاملًا.</p>
      {!props.uploadsEnabled && <p role="status" className="text-sm text-muted-foreground">رفع PDF غير مفعّل حاليًا على هذا الموقع.</p>}
      {props.unsaved && <div className="space-y-2 rounded-lg border border-gold/30 bg-gold/5 p-3">
        <p id={`${inputId}-save-help`} className="text-sm leading-7 text-gold">يمكنك اختيار الملف الآن. احفظ تغييرات المسودة لتفعيل الرفع؛ سيبقى الملف الذي اخترته جاهزًا.</p>
        <Button type="button" variant="outline" disabled={pickerBlocked} className="min-h-11" onClick={props.onSaveDraft}>حفظ تغييرات المسودة</Button>
      </div>}
      {props.pendingUploadId && !busy && <div className="space-y-1 text-sm leading-7">{!terminalStatus && <p>يوجد رفع غير مكتمل. لا يستمر تجهيز الصفحات بعد إغلاق التبويب. ألغِ المحاولة الحالية ثم ابدأ رفع الملف كاملًا من جديد.</p>}{status && <><p className="text-muted-foreground">الصفحات المستلمة: {status.readyPages} من {status.expectedPages} · الملف الأصلي: {status.sourceReady ? "مستلم" : "لم يكتمل"} · {status.state === "failed" ? "تعذّرت المحاولة" : status.state === "ready" ? "اكتمل الإرفاق بالمسودة" : terminalStatus ? "انتهت المحاولة" : "بانتظار الإكمال أو الإلغاء"}{status.errorCode && !terminalStatus ? " — تحتاج المحاولة إلى إلغاء وإعادة رفع." : ""}</p><p className="text-xs text-muted-foreground">مهلة المحاولة: {new Date(status.expiresAt).toLocaleString("ar-EG")}</p></>}</div>}
      <div className="space-y-2">
        <label htmlFor={inputId} className="block text-sm font-medium">اختر ملف PDF للفصل</label>
        <input ref={fileInput} id={inputId} type="file" accept="application/pdf,.pdf" disabled={pickerBlocked} tabIndex={-1} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); setMessage(""); }} className="sr-only" />
        <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-input bg-background p-3">
          <Button type="button" variant="secondary" disabled={pickerBlocked} className="min-h-11 shrink-0" aria-controls={inputId} aria-describedby={`${inputId}-file-status${props.unsaved ? ` ${inputId}-save-help` : ""}`} onClick={() => fileInput.current?.click()}>اختيار ملف PDF</Button>
          <div id={`${inputId}-file-status`} role="status" aria-live="polite" className="min-w-0 flex-1 text-sm leading-6">
            {file ? <><p dir="auto" className="break-all text-foreground">{file.name}</p><p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toLocaleString("ar-EG", { maximumFractionDigits: 1 })} ميجابايت</p></> : <p className="text-muted-foreground">لم يتم اختيار ملف بعد</p>}
          </div>
        </div>
      </div>
      <div role="status" aria-live="polite" className="space-y-2 text-sm">
        {message && <p>{message}</p>}
        {progress.total > 0 && <><progress className="h-2 w-full accent-primary" max={progress.total} value={progress.ready} aria-label="الصفحات المرفوعة" /><p className="text-xs text-muted-foreground">{progress.ready} / {progress.total} صفحة مرفوعة</p></>}
      </div>
      {(error || recoveryRequired) && <div className="space-y-2">{error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm leading-7 text-danger">{error}</p>}<Button type="button" variant="ghost" disabled={cancelling} className="min-h-11" onClick={() => window.location.reload()}>إعادة تحميل حالة النسخة من الخادم</Button></div>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={start} disabled={blocked || !file} className="min-h-11">رفع الملف كاملًا وتجهيز المعاينة</Button>
        {(busy || props.pendingUploadId) && !recoveryRequired && <Button type="button" variant="outline" onClick={cancel} disabled={cancelling} className="min-h-11">{cancelling ? "جارٍ تأكيد الإلغاء…" : "إلغاء الرفع لإعادة المحاولة"}</Button>}
      </div>
    </section>
  );
}
