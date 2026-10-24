"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { PDF_UPLOAD_LIMITS, type StartUploadResponse, type UploadStatus, type UploadStatusResponse } from "@/lib/media/contracts";
import type { WorkingRevision } from "./editorial-editor";
import { boundedWait, uploadRequest as request, UploadRequestError } from "@/lib/media/upload-request";
import { assertResumeIdentity, sourcePolicyInput, uploadPdfParts, type UploadPhase } from "@/lib/media/pdf-upload-flow";

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
  onPreview?: () => void;
  previewOpened?: boolean;
  firstPageImagePath?: string;
  coverEditorHref?: string;
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
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [profile, setProfile] = useState<'balanced-v1' | 'high-v1'>('balanced-v1');
  const [keepSource, setKeepSource] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [inspection, setInspection] = useState<{ file: File; profile: typeof profile; pages: number | null } | null>(null);
  const inspectionMatches = inspection?.file === file && inspection?.profile === profile;
  const inspecting = Boolean(file && !inspectionMatches);
  const preflight = inspectionMatches && inspection?.pages !== null ? inspection : null;
  const [bytes, setBytes] = useState({ pageBytes: 0, sourceBytes: 0 });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [progress, setProgress] = useState({ ready: 0, total: 0 });
  const controller = useRef<AbortController | null>(null);
  const task = useRef<Promise<void> | null>(null);
  const upload = useRef<{ id: string | null; version: number }>({ id: props.pendingUploadId ?? null, version: props.version });
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const policyBusyRef = useRef(false);
  const cancellingRef = useRef(false);
  const attached = useRef(false);
  const recoveryRef = useRef(false);
  const lastStatusRead = useRef<string | null>(null);
  const latestProps = useRef(props);
  useEffect(() => { latestProps.current = props; });
  useEffect(() => {
    if (!file) return;
    const abort = new AbortController();
    void (async () => {
      let document: Awaited<ReturnType<typeof import('@/lib/media/pdf-client').openPdf>> | undefined;
      let pageCount: number | null = null;
      try {
        if (file.size > PDF_UPLOAD_LIMITS.sourceBytes) throw new Error('حجم PDF يتجاوز 30 ميجابايت. اختر ملفًا أصغر.');
        const { openPdf } = await import('@/lib/media/pdf-client');
        document = await openPdf(file, abort.signal, profile);
        pageCount = document.pageCount;
      } catch (cause) {
        if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'تعذّر فحص PDF. اختر الملف مرة أخرى.');
      } finally {
        try { if (document) await boundedWait(document.destroy(), 2000); } catch { /* bounded worker cleanup */ }
        if (!abort.signal.aborted) setInspection({ file, profile, pages: pageCount });
      }
    })();
    return () => abort.abort();
  }, [file, profile]);

  useEffect(() => {
    if (props.pendingUploadId || busyRef.current) return;
    const abort = new AbortController();
    void request<{ ok: true; upload: UploadStatus | null }>(`/api/uploads?revisionId=${encodeURIComponent(props.revisionId)}`, { signal: abort.signal }, { timeoutMs: 10_000 }).then(result => {
      if (!abort.signal.aborted && !busyRef.current && result.ok && result.upload?.state === 'ready') {
        setStatus(result.upload);
        setKeepSource(result.upload.keepSource);
        setBytes({pageBytes: result.upload.pageBytes, sourceBytes: result.upload.sourceReady ? result.upload.sourceBytes : 0});
        setPhase('ready');
      }
    }).catch(() => { /* Existing draft editing stays usable if policy lookup fails. */ });
    return () => abort.abort();
  }, [props.revisionId, props.pendingUploadId, props.version]);
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
    setKeepSource(current.keepSource);
    if (current.processingProfile === 'balanced-v1' || current.processingProfile === 'high-v1') setProfile(current.processingProfile);
    setBytes({pageBytes: current.pageBytes, sourceBytes: current.sourceReady ? current.sourceBytes : 0});
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
    if (!file || inspecting || preflight?.file !== file || props.disabled || props.unsaved || !props.uploadsEnabled || busyRef.current || policyBusyRef.current || cancellingRef.current || recoveryRef.current || task.current) return;
    const selected = file;
    const resumeId = props.pendingUploadId ?? upload.current.id;
    if (resumeId && (!status || !status.sourceSha256 || !status.processingProfile || !['uploading', 'failed'].includes(status.state))) return;
    const abort = new AbortController();
    controller.current = abort;
    attached.current = false;
    lastStatusRead.current = null;
    setWorking(true);
    setError(null);
    if (!resumeId) setStatus(null);
    setPhase('idle');
    setProgress({ ready: 0, total: 0 });
    // Publish ownership before preflight can synchronously fail and clear it.
    task.current = Promise.resolve().then(async () => {
      let document: Awaited<ReturnType<typeof import("@/lib/media/pdf-client").openPdf>> | undefined;
      try {
        setMessage("جارٍ التحقق من ملف PDF…");
        if (selected.size > PDF_UPLOAD_LIMITS.sourceBytes) throw new Error("حجم PDF يتجاوز 30 ميجابايت. اختر ملفًا أصغر.");
        const { openPdf } = await import("@/lib/media/pdf-client");
        document = await openPdf(selected, abort.signal, profile);
        abort.signal.throwIfAborted();
        setProgress({ ready: 0, total: document.pageCount });
        // Start/complete have finite deadlines but are not interrupted by the cancel
        // button: obtain their committed result first, or require authoritative recovery.
        const identity = { sourceSha256: document.sourceSha256, sourceBytes: selected.size, pageCount: document.pageCount, processingProfile: profile };
        let resumed: UploadStatus | undefined;
        let started: StartUploadResponse;
        if (resumeId) {
          assertResumeIdentity(status!, identity);
          const result = await request<UploadStatusResponse>(`/api/uploads/${resumeId}/resume`, json({ expectedVersion: upload.current.version, ...identity }), { timeoutMs: 10_000 });
          if (!result.ok) return;
          assertResumeIdentity(result.status, identity);
          resumed = result.status;
          setStatus(resumed);
          started = { ok: true, uploadId: resumed.uploadId, revisionVersion: resumed.revisionVersion };
        } else {
          started = await request<StartUploadResponse>("/api/uploads", json({ revisionId: props.revisionId, expectedVersion: props.version, sourceName: selected.name, ...identity, keepSource }));
        }
        if (!started.ok) return;
        const uploadId = started.uploadId;
        upload.current = { id: started.uploadId, version: started.revisionVersion };
        if (mounted.current) latestProps.current.onStarted(started.uploadId, started.revisionVersion);
        abort.signal.throwIfAborted();
        await uploadPdfParts({ file: selected, pageCount: document.pageCount, status: resumed, signal: abort.signal,
          renderPage: document.renderPage,
          putSource: () => request(`/api/uploads/${uploadId}/source`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'X-Bunny-Upload': '1' }, body: selected, signal: abort.signal }),
          putPage: (index, blob) => request(`/api/uploads/${uploadId}/pages/${index}`, { method: 'PUT', headers: { 'Content-Type': blob.type, 'X-Bunny-Upload': '1' }, body: blob, signal: abort.signal }),
          onProgress: value => { setProgress({ ready: value.ready, total: value.total }); setBytes({pageBytes: value.pageBytes, sourceBytes: value.sourceBytes}); },
          onPhase: (value, index) => { setPhase(value); setMessage(value === 'source' ? 'جارٍ رفع ملف PDF الأصلي الخاص…' : `${value === 'rendering' ? 'جارٍ تجهيز' : 'جارٍ رفع'} الصفحة ${(index ?? 0) + 1} من ${document!.pageCount}…`); },
        });
        abort.signal.throwIfAborted();
        setMessage("جارٍ إرفاق الصفحات بالمسودة…");
        setPhase('attaching');
        const completed = await request<RevisionResponse>(`/api/uploads/${started.uploadId}/complete`, json({ expectedVersion: upload.current.version }));
        if (completed.ok) {
          attached.current = true;
          upload.current = { id: null, version: completed.revision.version };
          if (mounted.current) {
            latestProps.current.onRevision(completed.revision); setPhase('ready'); setMessage("اكتمل الرفع. افتح المعاينة الخاصة وافحص الصفحات قبل إرسال النسخة للمراجعة.");
            try {
              const result = await request<UploadStatusResponse>(`/api/uploads/${started.uploadId}`, {}, { timeoutMs: 10_000 });
              if (result.ok) { setStatus(result.status); setKeepSource(result.status.keepSource); }
            } catch { setError('اكتمل الرفع؛ تعذّر قراءة سياسة الأصل. أعد تحميل الصفحة لتحديثها.'); }
          }
        }
      } catch (cause) {
        if (mounted.current) {
          setPhase('idle');
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
      setPhase(attached.current ? 'ready' : 'idle');
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

  async function updatePolicy(permanent: boolean, reviewed = false) {
    if (!status || status.state !== 'ready' || policyBusyRef.current || busyRef.current || recoveryRef.current || props.disabled) return;
    try {
      const body = sourcePolicyInput(permanent, reviewed, Boolean(props.previewOpened));
      policyBusyRef.current = true;
      setPolicyBusy(true);
      latestProps.current.onBusyChange(true);
      setError(null);
      const result = await request<UploadStatusResponse>(`/api/uploads/${status.uploadId}/source-policy`, json(body), { timeoutMs: 10_000 });
      if (result.ok) { setStatus(result.status); setKeepSource(result.status.keepSource); setMessage('حُفظت سياسة الملف الأصلي. صور القراءة باقية.'); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تأكيد سياسة الأصل. أعد تحميل الحالة قبل المحاولة مرة أخرى.');
      // A policy update is not replayed after an uncertain response.
      if (cause instanceof UploadRequestError && cause.ambiguous) requireRecovery('تعذّر تأكيد سياسة الأصل. أعد تحميل الحالة المحفوظة قبل تغييرها مرة أخرى.');
    } finally {
      policyBusyRef.current = false;
      setPolicyBusy(false);
      latestProps.current.onBusyChange(busyRef.current || recoveryRef.current);
    }
  }

  const pickerBlocked = !ready || props.disabled || busy || policyBusy || cancelling || recoveryRequired || !props.uploadsEnabled;
  const pending = Boolean(props.pendingUploadId || upload.current.id);
  const resumable = Boolean(status && ['uploading', 'failed'].includes(status.state) && status.sourceSha256 && status.processingProfile);
  const blocked = pickerBlocked || props.unsaved || inspecting || preflight?.file !== file || (pending && !resumable);
  const terminalStatus = status && ["ready", "cancelled", "superseded"].includes(status.state);
  const formatBytes = (value: number) => `${(value / (1024 * 1024)).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} MiB (${value.toLocaleString('ar-EG')} بايت)`;
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
      {pending && !busy && <div className="space-y-1 text-sm leading-7">{!terminalStatus && <p>{resumable ? 'يوجد رفع غير مكتمل. اختر نفس PDF للتحقق منه واستكمال الأجزاء الناقصة فقط. لا يستمر العمل بعد إغلاق التبويب.' : 'تعذّر استكمال هذه المحاولة بأمان. يمكنك إلغاء المحاولة ثم البدء من جديد.'}</p>}{status && <><p dir="auto" className="break-all">{status.sourceName}</p><p className="text-muted-foreground">الصفحات المستلمة: {status.readyPages} من {status.expectedPages} · الملف الأصلي: {status.sourceReady ? "مستلم" : "لم يكتمل"} · {status.state === "failed" ? "تعذّرت المحاولة" : status.state === "ready" ? "اكتمل الإرفاق بالمسودة" : terminalStatus ? "انتهت المحاولة" : "بانتظار الإكمال أو الإلغاء"}</p><p className="text-xs text-muted-foreground">مهلة المحاولة: {new Date(status.expiresAt).toLocaleString("ar-EG")}</p></>}</div>}
      <div className="space-y-2">
        <label htmlFor={inputId} className="block text-sm font-medium">اختر ملف PDF للفصل</label>
        <input ref={fileInput} id={inputId} type="file" accept="application/pdf,.pdf" disabled={pickerBlocked} tabIndex={-1} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); setMessage(""); }} className="sr-only" />
        <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-input bg-background p-3">
          <Button type="button" variant="secondary" disabled={pickerBlocked} className="min-h-11 shrink-0" aria-controls={inputId} aria-describedby={`${inputId}-file-status${props.unsaved ? ` ${inputId}-save-help` : ""}`} onClick={() => fileInput.current?.click()}>اختيار ملف PDF</Button>
          <div id={`${inputId}-file-status`} role="status" aria-live="polite" className="min-w-0 flex-1 text-sm leading-6">
            {file ? <><p dir="auto" className="break-all text-foreground">{file.name}</p><p className="text-xs text-muted-foreground">{formatBytes(file.size)} · {inspecting ? 'جارٍ فحص عدد الصفحات…' : preflight?.file === file ? `${preflight.pages} صفحة` : 'لم يكتمل الفحص'}</p></> : <p className="text-muted-foreground">لم يتم اختيار ملف بعد</p>}
          </div>
        </div>
      </div>
      <div className="space-y-3 border-t border-border/60 pt-4 text-sm leading-7">
        <label htmlFor={`${inputId}-profile`} className="block font-medium">جودة صور القراءة</label>
        <select id={`${inputId}-profile`} value={profile} disabled={pickerBlocked || pending} onChange={event => setProfile(event.target.value as typeof profile)} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-2 focus-visible:outline-primary">
          <option value="balanced-v1">متوازن — الإعداد الافتراضي</option><option value="high-v1">جودة أعلى — قد يزيد الحجم</option>
        </select>
        <p className="text-xs text-muted-foreground">حجم الصور يتحدد بعد تجهيزها؛ لا توجد نسبة توفير مضمونة. نعرض الحجم الفعلي أثناء الرفع.</p>
        {status?.state !== 'ready' && <label className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" checked={keepSource} disabled={pickerBlocked || pending} onChange={event => setKeepSource(event.target.checked)} className="mt-2 size-4 accent-primary" /><span>الاحتفاظ بملف PDF الأصلي بشكل دائم</span></label>}
        <p className="text-xs text-muted-foreground">صور القراءة تبقى محفوظة. الأصل خاص ومؤقت افتراضيًا؛ يُحذف وحده بعد اكتمال الرفع ومرور ٧ أيام، وبعد تأكيد فحص الصفحات. بعد حذفه، تتطلب إعادة المعالجة اختيار PDF مجددًا.</p>
      </div>
      <div role="status" aria-live="polite" className="space-y-2 text-sm">
        {phase !== 'idle' && <ol aria-label="مراحل رفع الفصل" className="flex flex-wrap gap-3 text-xs leading-6 text-muted-foreground">{(['source', 'rendering', 'uploading', 'attaching', 'ready'] as const).map(step => <li key={step} aria-current={phase === step ? 'step' : undefined} className={phase === step ? 'font-semibold text-primary' : ''}>{({source:'رفع الأصل',rendering:'تجهيز الصفحة',uploading:'رفع الصفحة',attaching:'إرفاق بالمسودة',ready:'جاهز للمعاينة'})[step]}</li>)}</ol>}
        {message && <p>{message}</p>}
        {progress.total > 0 && <><progress className="h-2 w-full accent-primary" max={progress.total} value={progress.ready} aria-label="الصفحات المرفوعة" /><p className="text-xs text-muted-foreground">{progress.ready} / {progress.total} صفحة مرفوعة</p></>}
        {(bytes.pageBytes > 0 || bytes.sourceBytes > 0) && <p className="text-xs leading-6 text-muted-foreground">الحجم الفعلي المستلم — صور القراءة: {formatBytes(bytes.pageBytes)} · الأصل الخاص: {formatBytes(bytes.sourceBytes)}</p>}
      </div>
      {status?.state === 'ready' && <div className="space-y-3 border-t border-border/60 pt-4 text-sm leading-7">
        <h3 className="font-semibold">فحص الصفحات وسياسة الأصل</h3>
        <p className="text-muted-foreground">{status.sourceDeletedAt ? 'حُذف الأصل المؤقت؛ صور القراءة باقية.' : status.sourceDeletingAt ? 'بدأ حذف الأصل المؤقت؛ لم يعد تغيير الاحتفاظ متاحًا.' : status.keepSource ? 'الأصل محفوظ بشكل دائم.' : status.sourceDeleteAfter ? `الأصل مؤقت. موعد الحذف بعد الفحص: ${new Date(status.sourceDeleteAfter).toLocaleString('ar-EG')}.` : 'الأصل مؤقت؛ لن يُحذف قبل تأكيد فحص الصفحات.'}</p>
        {!status.sourceDeletedAt && !status.sourceDeletingAt && <label className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" checked={keepSource} disabled={pickerBlocked} onChange={event => void updatePolicy(event.target.checked)} className="mt-2 size-4 accent-primary" /><span>الاحتفاظ بالأصل بشكل دائم</span></label>}
        {!status.sourceReviewedAt && !status.sourceDeletedAt && !status.sourceDeletingAt && <><p className="text-xs text-muted-foreground">افتح المعاينة الخاصة وافحص ترتيب الصفحات ووضوح النص، ثم أكد الفحص هنا.</p><Button type="button" variant="outline" disabled={pickerBlocked || !props.previewOpened} onClick={() => void updatePolicy(keepSource, true)} className="min-h-11">{policyBusy ? 'جارٍ الحفظ…' : 'فحصت الصفحات وأؤكد سلامة الاستيراد'}</Button></>}
        {status.sourceReviewedAt && <p className="text-xs text-muted-foreground">تأكد فحص الاستيراد في {new Date(status.sourceReviewedAt).toLocaleString('ar-EG')}.</p>}
        {props.firstPageImagePath && <div className="space-y-2"><h3 className="font-semibold">الصفحة الأولى — اقتراح للغلاف</h3><img src={props.firstPageImagePath} alt="معاينة خاصة للصفحة الأولى المقترحة كغلاف" className="max-h-72 max-w-full rounded-lg object-contain" /><p className="text-xs text-muted-foreground">اقتراح خاص لهذا الملف. تغيير غلاف العمل يتطلب اختيارًا صريحًا في محرر الغلاف.</p>{props.coverEditorHref && <a href={props.coverEditorHref} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">فتح محرر غلاف العمل واختيار الغلاف</a>}</div>}
      </div>}
      {(error || recoveryRequired) && <div className="space-y-2">{error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm leading-7 text-danger">{error}</p>}<Button type="button" variant="ghost" disabled={cancelling} className="min-h-11" onClick={() => window.location.reload()}>إعادة تحميل حالة النسخة من الخادم</Button></div>}
      <div className="flex flex-wrap gap-3">
        {phase === 'ready' && props.onPreview && <Button type="button" disabled={busy || recoveryRequired} onClick={props.onPreview} className="min-h-11">فتح المعاينة الخاصة</Button>}
        <Button type="button" onClick={start} disabled={blocked || !file} className="min-h-11">{pending ? 'التحقق من PDF واستكمال الرفع' : 'رفع الملف وتجهيز المعاينة'}</Button>
        {(busy || props.pendingUploadId) && !recoveryRequired && <Button type="button" variant="outline" onClick={cancel} disabled={cancelling} className="min-h-11">{cancelling ? "جارٍ تأكيد الإلغاء…" : "إلغاء الرفع لإعادة المحاولة"}</Button>}
      </div>
    </section>
  );
}
