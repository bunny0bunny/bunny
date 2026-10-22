import "server-only";
import { withDatabaseScope } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { withSerializableTx, editableRevision, checkStaffSeriesAccess, type EditorialResult } from "@/lib/editorial";
import { getTrustedAppOrigin } from "@/lib/account-mail";
import { getMediaStorage } from "./storage";
import { sniffPage, MAX_PAGE_BYTES, MAX_SOURCE_BYTES } from "./formats";
import { PDF_UPLOAD_LIMITS, type StartUploadInput } from "./contracts";

type Tx = Prisma.TransactionClient;
type Actor = { id: string | null; role: string; nickname: string };
const fail = (error: string): EditorialResult => ({ ok: false, error });
const enabled = () => process.env.MEDIA_UPLOADS_ENABLED === "1";
const sessionMs = 2 * 60 * 60 * 1000;
const reserveMs = 5 * 60 * 1000;
export function uploadRequestGuard(request: Request): string | null {
  if (!enabled()) return "disabled";
  try { if (request.headers.get("origin") !== getTrustedAppOrigin() || request.headers.get("x-bunny-upload") !== "1") return "forbidden"; } catch { return "unavailable"; }
  return null;
}
async function quota(tx: Tx, key: string, amount: number, limit: number, windowMs: number) {
  const now = Date.now(), bucket = Math.floor(now / windowMs);
  const keyHash = `media:${key}:${bucket}`;
  const row = await tx.accountRateLimit.findUnique({ where: { keyHash } });
  if ((row?.count ?? 0) + amount > limit) return false;
  await tx.accountRateLimit.upsert({ where: { keyHash }, create: { keyHash, count: amount, windowEnd: new Date((bucket + 1) * windowMs) }, update: { count: { increment: amount } } });
  return true;
}
async function event(tx: Tx, actor: Actor, revisionId: string, chapterId: string, action: string) {
  await tx.chapterEditorialEvent.create({ data: { revisionId, chapterId, actorId: actor.id, action } });
}
async function active(tx: Tx, actor: Actor, id: string, creator = true) {
  const upload = await tx.chapterUpload.findUnique({ where: { id }, include: { revision: { include: { chapter: true } } } });
  if (!upload) return { error: "not_found" } as const;
  if (!await checkStaffSeriesAccess(tx, actor, upload.revision.chapter.seriesId) || (creator && upload.createdById !== actor.id)) return { error: "forbidden" } as const;
  if (upload.expiresAt.getTime() <= Date.now() && ["uploading", "failed"].includes(upload.state)) {
    await tx.chapterUpload.update({ where: { id }, data: { state: "cancelled", errorCode: "expired" } });
    await tx.chapterRevision.updateMany({ where: { id: upload.revisionId, pendingUploadId: id }, data: { pendingUploadId: null, version: { increment: 1 } } });
    return { error: "expired" } as const;
  }
  const latest = await tx.chapterRevision.findFirst({ where: { chapterId: upload.chapterId }, orderBy: { revisionNumber: "desc" }, select: { id: true } });
  if (latest?.id !== upload.revisionId || upload.revision.pendingUploadId !== id || upload.revision.version !== upload.revisionVersion || !["uploading", "failed"].includes(upload.state)) return { error: "conflict" } as const;
  return { upload } as const;
}
export async function startUpload(input: StartUploadInput): Promise<EditorialResult> {
  if (!enabled()) return fail("disabled");
  if (!input || typeof input.revisionId !== "string" || typeof input.sourceName !== "string" || input.sourceName.length < 1 || input.sourceName.length > 255 || !Number.isInteger(input.sourceBytes) || input.sourceBytes < 5 || input.sourceBytes > MAX_SOURCE_BYTES || !Number.isInteger(input.pageCount) || input.pageCount < 1 || input.pageCount > 200) return fail("invalid_input");
  return withSerializableTx(async (tx, actor) => {
    const found = await editableRevision(tx, actor, input); if (found.error) return fail(found.error);
    const revision = found.revision!; if (revision.chapter.series.format === "novel") return fail("invalid_input");
    // Expired sessions are explicitly detached before enforcing the one-active-profile limit.
    const expired = await tx.chapterUpload.findMany({ where: { createdById: actor.id!, state: { in: ["uploading", "failed"] }, expiresAt: { lte: new Date() } } });
    for (const item of expired) {
      await tx.chapterUpload.update({ where: { id: item.id }, data: { state: "cancelled", errorCode: "expired" } });
      if (item.revisionId !== revision.id) await tx.chapterRevision.updateMany({ where: { pendingUploadId: item.id }, data: { pendingUploadId: null, version: { increment: 1 } } });
    }
    if (await tx.chapterUpload.count({ where: { createdById: actor.id!, state: { in: ["uploading", "failed"] }, expiresAt: { gt: new Date() }, ...(revision.pendingUploadId ? { id: { not: revision.pendingUploadId } } : {}) } })) return fail("active_upload");
    if (revision.pendingUploadId) {
      const previous = await tx.chapterUpload.findUnique({ where: { id: revision.pendingUploadId } });
      if (previous?.createdById !== actor.id && actor.role !== "admin") return fail("forbidden");
    }
    if (!await quota(tx, `starts:${actor.id}`, 1, 10, 3600000)) return fail("rate_limit");
    if (revision.pendingUploadId) {
      const previous = await tx.chapterUpload.findUnique({ where: { id: revision.pendingUploadId } });
      if (previous?.createdById !== actor.id && actor.role !== "admin") return fail("forbidden");
      await tx.chapterUpload.update({ where: { id: revision.pendingUploadId }, data: { state: "superseded" } });
    }
    const upload = await tx.chapterUpload.create({ data: { revisionId: revision.id, chapterId: revision.chapterId, createdById: actor.id!, sourceName: input.sourceName.replace(/[\u0000-\u001f\u007f]/g, ""), sourceBytes: input.sourceBytes, expectedPages: input.pageCount, revisionVersion: revision.version + 1, expiresAt: new Date(Date.now() + sessionMs) } });
    const updated = await tx.chapterRevision.update({ where: { id: revision.id }, data: { pendingUploadId: upload.id, version: { increment: 1 }, status: "draft", approvedAt: null, approvedById: null, scheduledFor: null } });
    await event(tx, actor, revision.id, revision.chapterId, "start_pdf_upload");
    return { ok: true, data: { uploadId: upload.id, revisionVersion: updated.version } };
  });
}

async function boundedBytes(request: Request, expected: number) {
  if (!request.body) throw new Error("invalid_body");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let count = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; count += part.value.length; if (count > expected) throw new Error("invalid_length"); chunks.push(part.value); } } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  if (count !== expected) throw new Error("invalid_length");
  const bytes = new Uint8Array(count); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; } return bytes;
}
export async function writeUploadAsset(id: string, index: number, request: Request): Promise<EditorialResult> {
  if (!enabled()) return fail("disabled");
  const lengthHeader = request.headers.get("content-length"); const length = Number(lengthHeader);
  if (!lengthHeader || !/^\d+$/.test(lengthHeader) || !Number.isSafeInteger(length) || length < 1 || length > (index === -1 ? MAX_SOURCE_BYTES : MAX_PAGE_BYTES) || !Number.isInteger(index) || index < -1) return fail("invalid_length");
  let bytes: Uint8Array | undefined; let mime = "application/pdf", width: number | undefined, height: number | undefined;
  if (index !== -1) { try { bytes = await boundedBytes(request, length); const page = sniffPage(bytes); mime = page.mime; width = page.width; height = page.height; if (request.headers.get("content-type")?.split(";")[0] !== mime) return fail("invalid_media"); } catch { return fail("invalid_media"); } }
  else if (request.headers.get("content-type")?.split(";")[0] !== "application/pdf" || !request.body) return fail("invalid_media");
  const reserved = await withSerializableTx(async (tx, actor) => {
    const found = await active(tx, actor, id); if (found.error) return fail(found.error); const upload = found.upload!;
    if (index >= upload.expectedPages || (index === -1 && length !== upload.sourceBytes)) return fail("invalid_input");
    const previous = await tx.mediaAsset.findUnique({ where: { uploadId_pageIndex: { uploadId: id, pageIndex: index } } });
    if (previous?.readyAt) return { ok: true, data: { alreadyReady: true } };
    if (previous && upload.state !== "failed" && Date.now() - previous.createdAt.getTime() < reserveMs) return fail("in_progress");
    if (upload.reservedBytes + length > PDF_UPLOAD_LIMITS.aggregateBytes) return fail("quota");
    if (!await quota(tx, `bytes:${actor.id}`, length, 512 * 1024 * 1024, 86400000)) return fail("quota");
    // Old pending keys remain private orphans. A retry gets a fresh immutable key.
    if (previous) {
      const oldest = await tx.mediaAsset.aggregate({ where: { uploadId: id }, _min: { pageIndex: true } });
      await tx.mediaAsset.update({ where: { id: previous.id }, data: { pageIndex: Math.min(-2, (oldest._min.pageIndex ?? -1) - 1) } });
    }
    const assetId = crypto.randomUUID().replaceAll("-", "");
    const prefix = process.env.MEDIA_STORAGE_PREFIX || "prod"; if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(prefix)) throw new Error("Invalid media prefix");
    const asset = await tx.mediaAsset.create({ data: { id: assetId, uploadId: id, chapterId: upload.chapterId, pageIndex: index, objectKey: `media/${prefix}/${id}/${assetId}.${index === -1 ? "pdf" : mime === "image/webp" ? "webp" : "jpg"}`, mime, bytes: length, width, height } });
    await tx.chapterUpload.update({ where: { id }, data: { reservedBytes: { increment: length }, state: "uploading", errorCode: null } });
    return { ok: true, data: { asset } };
  }, { invalidate: false });
  if (!reserved.ok) return reserved;
  const data = reserved.data as { alreadyReady?: boolean; asset?: { id: string; objectKey: string } }; if (data.alreadyReady) return { ok: true };
  try {
    const storage = await getMediaStorage();
    const stored = index === -1 ? await storage.putSource(data.asset!.objectKey, request.body!, length) : await storage.putPage(data.asset!.objectKey, bytes!, mime as "image/webp" | "image/jpeg");
    if (stored.bytes !== length) throw new Error("invalid_length");
    return await withSerializableTx(async (tx, actor) => {
      const found = await active(tx, actor, id); if (found.error) return fail(found.error);
      const asset = await tx.mediaAsset.findUnique({ where: { id: data.asset!.id } }); if (!asset || asset.pageIndex !== index) return fail("conflict");
      await tx.mediaAsset.update({ where: { id: asset.id }, data: { readyAt: new Date() } }); return { ok: true };
    }, { invalidate: false });
  } catch {
    await withSerializableTx(async (tx, actor) => { const found = await active(tx, actor, id); if (found.error) return fail(found.error); const asset = await tx.mediaAsset.findUnique({ where: { id: data.asset!.id } }); if (!asset || asset.pageIndex !== index) return fail("conflict"); await tx.chapterUpload.update({ where: { id }, data: { state: "failed", errorCode: "storage_failed" } }); return { ok: true }; }, { invalidate: false });
    return fail("storage_failed");
  }
}
export async function completeUpload(id: string, expectedVersion: number): Promise<EditorialResult> {
  if (!enabled()) return fail("disabled");
  return withSerializableTx(async (tx, actor) => {
    const ready = await tx.chapterUpload.findUnique({ where: { id }, include: { revision: { include: { chapter: true } } } });
    if (ready?.state === "ready") {
      if (ready.createdById !== actor.id || !await checkStaffSeriesAccess(tx, actor, ready.revision.chapter.seriesId)) return fail("forbidden");
      if (expectedVersion !== ready.revisionVersion || ready.revision.version !== ready.revisionVersion + 1) return fail("conflict");
      return { ok: true, revision: ready.revision };
    }
    const found = await active(tx, actor, id); if (found.error) return fail(found.error); const upload = found.upload!;
    if (expectedVersion !== upload.revisionVersion) return fail("conflict");
    const assets = await tx.mediaAsset.findMany({ where: { uploadId: id, pageIndex: { gte: -1 } }, orderBy: { pageIndex: "asc" } });
    if (upload.state !== "uploading" || assets.length !== upload.expectedPages + 1 || assets.some((asset, i) => !asset.readyAt || asset.chapterId !== upload.chapterId || asset.pageIndex !== i - 1 || (i > 0 && (!asset.width || !asset.height)))) return fail("incomplete");
    const revision = await tx.chapterRevision.update({ where: { id: upload.revisionId }, data: { pagesJson: assets.slice(1).map(asset => ({ pageIndex: asset.pageIndex, imagePath: `/api/media/${asset.id}`, width: asset.width!, height: asset.height! })), pendingUploadId: null, status: "draft", version: { increment: 1 } } });
    await tx.chapterUpload.update({ where: { id }, data: { state: "ready", errorCode: null } });
    await event(tx, actor, revision.id, revision.chapterId, "complete_pdf_upload"); return { ok: true, revision };
  });
}
export async function cancelUpload(id: string, expectedVersion: number): Promise<EditorialResult> {
  if (!enabled()) return fail("disabled");
  return withSerializableTx(async (tx, actor) => {
    const found = await active(tx, actor, id, false); if (found.error) return fail(found.error); const upload = found.upload!;
    if (upload.createdById !== actor.id && actor.role !== "admin") return fail("forbidden");
    if (expectedVersion !== upload.revisionVersion) return fail("conflict");
    await tx.chapterUpload.update({ where: { id }, data: { state: "cancelled" } });
    const revision = await tx.chapterRevision.update({ where: { id: upload.revisionId }, data: { pendingUploadId: null, version: { increment: 1 } } });
    await event(tx, actor, revision.id, revision.chapterId, "cancel_pdf_upload"); return { ok: true, revision };
  });
}
export async function uploadStatus(id: string): Promise<EditorialResult> {
  if (!enabled()) return fail("disabled");
  return withSerializableTx(async (tx, actor) => {
    // Resolve expiry here as well, so abandoned sessions can be explicitly cleared by polling.
    const checked = await active(tx, actor, id, false); if (checked.error && !["expired", "conflict"].includes(checked.error)) return fail(checked.error);
    const upload = await tx.chapterUpload.findUnique({ where: { id }, include: { revision: { include: { chapter: true } }, assets: { select: { pageIndex: true, readyAt: true } } } });
    if (!upload) return fail("not_found"); if (!await checkStaffSeriesAccess(tx, actor, upload.revision.chapter.seriesId)) return fail("forbidden");
    return { ok: true, data: { status: { uploadId: id, state: upload.state, expectedPages: upload.expectedPages, readyPages: upload.assets.filter(a => a.pageIndex >= 0 && a.readyAt).length, sourceReady: upload.assets.some(a => a.pageIndex === -1 && a.readyAt), revisionVersion: upload.revision.version, errorCode: upload.errorCode, expiresAt: upload.expiresAt.toISOString() } } };
  }, { invalidate: false });
}
const safeErrors: Record<string, string> = { unauthenticated: "سجّل الدخول بحساب موثّق", forbidden: "غير مسموح بهذا الإجراء", conflict: "تغيّرت النسخة؛ حدّث الصفحة", disabled: "رفع ملفات PDF غير متاح حاليًا", incomplete: "لم يكتمل رفع صفحات الفصل", expired: "انتهت جلسة الرفع؛ ابدأ من جديد", quota: "تجاوز الرفع الحد المسموح", rate_limit: "محاولات كثيرة؛ حاول لاحقًا", in_progress: "يجري رفع هذه الصفحة؛ انتظر ثم أعد المحاولة" };
export function uploadResponse(result: EditorialResult) {
  if (result.ok) return Response.json({ ok: true, ...(result.revision ? { revision: result.revision } : {}), ...(result.data as object ?? {}) }, { headers: { "Cache-Control": "private, no-store" } });
  const code = result.error ?? "unavailable";
  return Response.json({ ok: false, code, error: safeErrors[code] ?? "تعذّر الرفع؛ تحقق من الملف وحاول مجددًا" }, { status: code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : code === "not_found" || code === "disabled" ? 404 : ["quota", "rate_limit"].includes(code) ? 429 : ["conflict", "in_progress", "incomplete", "expired"].includes(code) ? 409 : ["storage_failed", "unavailable"].includes(code) ? 503 : 400, headers: { "Cache-Control": "private, no-store" } });
}
export async function guardedUploadRoute(request: Request, action: () => Promise<EditorialResult>) { const error = uploadRequestGuard(request); if (error) return uploadResponse(fail(error)); try { return uploadResponse(await withDatabaseScope(action)); } catch (error) { return uploadResponse(fail(error instanceof SyntaxError ? "invalid_input" : "unavailable")); } }
