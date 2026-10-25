import "server-only";
import { getTrustedAppOrigin } from "@/lib/account-mail";
import { withDatabaseScope } from "@/lib/db";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const BODY_LIMIT = 16384;
const messages: Record<string, string> = {
  unauthenticated: "سجّل الدخول بحساب مؤكد لإدارة طلباتك.",
  forbidden: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  not_found: "لم نعثر على الطلب المطلوب.",
  invalid_input: "راجع البيانات المطلوبة وحاول مرة أخرى.",
  conflict: "تغيّر الطلب. أعد تحميل حالته قبل المحاولة مرة أخرى.",
  quota: "يمكن إرسال ثلاثة طلبات جديدة خلال ٢٤ ساعة. يمكنك متابعة طلباتك الحالية.",
  quota_exceeded: "يمكن إرسال ثلاثة طلبات جديدة خلال ٢٤ ساعة. يمكنك متابعة طلباتك الحالية.",
  rate_limit: "محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مجددًا.",
  rate_limited: "محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مجددًا.",
  unavailable: "تعذّر حفظ الطلب الآن. احتفظ بالبيانات وحاول مرة أخرى.",
  invalid_merge: "اختر طلبًا مستقلًا من نفس التصنيف لتجميع الطلبات.",
  group_limit: "وصلت مجموعة الطلبات إلى الحد المسموح. أبقِ الطلب مستقلًا.",
  series_unavailable: "اختر عملًا منشورًا ومتاحًا للقراء قبل تحديد حالة متاح.",
  invalid_series: "اختر عملًا منشورًا ومتاحًا للقراء قبل تحديد حالة متاح.",
  body_too_large: "الرسالة طويلة جدًا. اختصرها وحاول مرة أخرى.",
};

export function contentRequestResponse<T>(result: Result<T>): Response {
  const headers = { "Cache-Control": "private, no-store" };
  if (result.ok) return Response.json({ ok: true, ...result.data }, { headers });
  const code = Object.hasOwn(messages, result.error) ? result.error : "invalid_input";
  const status = code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "conflict" ? 409 : ["rate_limit", "rate_limited", "quota", "quota_exceeded"].includes(code) ? 429 : code === "unavailable" ? 503 : code === "body_too_large" ? 413 : 400;
  return Response.json({ ok: false, code, error: messages[code] }, { status, headers });
}

async function readObject(request: Request): Promise<Record<string, unknown>> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > BODY_LIMIT)) throw new RangeError("body_too_large");
  if (!request.body) throw new SyntaxError("invalid_input");
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) { await reader.cancel(); throw new RangeError("body_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  const value: unknown = JSON.parse(new TextDecoder().decode(buffer));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SyntaxError("invalid_input");
  return value as Record<string, unknown>;
}

export async function guardedContentRequest<T>(request: Request, work: (body: Record<string, unknown>) => Promise<Result<T>>): Promise<Response> {
  try {
    if (request.headers.get("origin") !== getTrustedAppOrigin() || request.headers.get("x-bunny-request") !== "1") return contentRequestResponse({ ok: false, error: "forbidden" });
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return contentRequestResponse({ ok: false, error: "invalid_input" });
    const input = await readObject(request);
    return contentRequestResponse(await withDatabaseScope(() => work(input)));
  } catch (error) {
    return contentRequestResponse({ ok: false, error: error instanceof RangeError ? "body_too_large" : error instanceof SyntaxError ? "invalid_input" : "unavailable" });
  }
}
