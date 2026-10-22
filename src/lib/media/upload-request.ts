/** Browser-only request boundary. Never retries mutations or displays response HTML. */
export class UploadRequestError extends Error {
  status?: number;
  code?: string;
  ambiguous: boolean;
  kind: "http" | "network" | "timeout" | "aborted" | "response";
  constructor(message: string, details: { status?: number; code?: string; ambiguous?: boolean; kind: UploadRequestError["kind"] }) {
    super(message);
    this.name = "UploadRequestError";
    this.status = details.status;
    this.code = details.code;
    this.ambiguous = details.ambiguous ?? false;
    this.kind = details.kind;
  }
}
const codeMessages: Record<string, string> = {
  disabled: "رفع ملفات PDF غير متاح حاليًا على الموقع.",
  invalid_length: "لم يصل الملف كاملًا إلى الخادم. ألغِ المحاولة ثم أعد رفع الملف كاملًا.",
  conflict: "تغيّرت نسخة الفصل. أعد تحميل حالة النسخة من الخادم قبل المحاولة.",
  expired: "انتهت مهلة الرفع. أعد تحميل النسخة ثم ابدأ من جديد.",
  in_progress: "ما زال الخادم يعالج الصفحة. افحص حالة الرفع قبل المحاولة.",
  incomplete: "لم يستلم الخادم كل صفحات الفصل. افحص حالة الرفع أو ألغِ المحاولة.",
  active_upload: "يوجد رفع غير مكتمل لحسابك. أعد تحميل النسخة لإظهاره أو إلغائه.",
  storage_failed: "تعذّر حفظ الملف في المخزن. افحص حالة الرفع ثم ألغِ المحاولة لإعادتها.",
  invalid_media: "تنسيق الصفحة غير مدعوم. عدّل ملف PDF ثم أعد رفعه كاملًا.",
};
function httpMessage(status: number, code?: string) {
  if (status === 401) return "انتهت جلسة تسجيل الدخول. سجّل الدخول ثم افتح النسخة مجددًا.";
  if (status === 403) return "لا توجد صلاحية لتنفيذ الرفع. أعد تحميل الصفحة وتحقق من حساب الفريق.";
  if (status === 413) return "تجاوز الملف الحجم الذي يقبله الخادم. قلّل الحجم ثم ارفع الملف كاملًا.";
  if (status === 429) return "محاولات كثيرة أو تجاوز للحد المسموح. انتظر قبل إعادة المحاولة.";
  if (code && codeMessages[code]) return codeMessages[code];
  if (status >= 500) return "تعذّر على الخادم إكمال الطلب. افحص حالة النسخة قبل إعادة المحاولة.";
  if (status === 404) return "لم يُعثر على جلسة الرفع. أعد تحميل النسخة من الخادم.";
  return "رفض الخادم طلب الرفع. أعد تحميل حالة النسخة وتحقق من الملف.";
}

export async function uploadRequest<T extends { ok: boolean }>(path: string, options: RequestInit = {}, policy: { timeoutMs?: number } = {}): Promise<T> {
  const timeoutMs = policy.timeoutMs ?? (options.method === "PUT" ? 120_000 : 30_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error("Invalid upload request deadline");
  if (options.signal?.aborted) throw new UploadRequestError("أُلغيت المحاولة قبل إرسال الطلب إلى الخادم.", { kind: "aborted", ambiguous: false });
  const abort = new AbortController();
  const uncertainMutation = options.method?.toUpperCase() === "POST";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let interrupt: ((error: UploadRequestError) => void) | undefined;
  const stopped = new Promise<never>((_resolve, reject) => { interrupt = reject; });
  const stop = (kind: "aborted" | "timeout") => {
    interrupt?.(new UploadRequestError(kind === "timeout" ? "انتهت مهلة انتظار الخادم. افحص حالة الرفع قبل المحاولة." : "توقفت المحاولة. جارٍ التحقق من الحالة المحفوظة على الخادم.", { kind, ambiguous: uncertainMutation }));
    abort.abort();
  };
  const externalAbort = () => stop("aborted");
  options.signal?.addEventListener("abort", externalAbort, { once: true });
  timeout = setTimeout(() => stop("timeout"), timeoutMs);
  try {
    return await Promise.race([stopped, (async () => {
      const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options, signal: abort.signal });
      const result = await response.json().catch(() => null);
      const code = typeof result?.code === "string" ? result.code : undefined;
      if (!response.ok || result?.ok === false) throw new UploadRequestError(httpMessage(response.status, code), { kind: "http", status: response.status, code, ambiguous: uncertainMutation && response.status >= 500 });
      if (!result || result.ok !== true) throw new UploadRequestError("وصل رد غير مكتمل من الخادم. افحص حالة النسخة قبل المحاولة.", { kind: "response", status: response.status, ambiguous: uncertainMutation });
      return result as T;
    })()]);
  } catch (cause) {
    if (cause instanceof UploadRequestError) throw cause;
    throw new UploadRequestError("انقطع الاتصال أثناء الرفع. افحص حالة النسخة قبل إعادة المحاولة.", { kind: "network", ambiguous: uncertainMutation });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", externalAbort);
  }
}

/** Stops waiting only; callers must retain their task lock until the real task ends. */
export async function boundedWait<T>(value: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([value, new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new UploadRequestError("انتهت مهلة انتظار توقف المحاولة. أعد تحميل حالة النسخة قبل أي رفع جديد.", { kind: "timeout", ambiguous: true })), timeoutMs); })]);
  } finally { clearTimeout(timeout); }
}
