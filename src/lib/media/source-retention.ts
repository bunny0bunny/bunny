import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withSerializableTx, checkStaffSeriesAccess, type EditorialResult } from "@/lib/editorial";
import { getMediaStorage, validateMediaKey } from "./storage";
import { toUploadStatus } from "./upload-status";
import { sourceDeletionDate, sourceDeletionEligible } from "./source-retention-policy";

const fail = (error: string): EditorialResult => ({ ok: false, error });
const statusInclude = { revision: { include: { chapter: true } }, assets: { select: { pageIndex: true, readyAt: true, bytes: true } } } as const;

export async function latestRevisionUpload(revisionId: string): Promise<EditorialResult> {
  if (process.env.MEDIA_UPLOADS_ENABLED !== "1") return fail("disabled");
  if (!revisionId || typeof revisionId !== "string") return fail("invalid_input");
  return withSerializableTx(async (tx, actor) => {
    const revision = await tx.chapterRevision.findUnique({ where: { id: revisionId }, include: { chapter: true } });
    if (!revision || revision.chapter.deletedAt) return fail("not_found");
    if (!await checkStaffSeriesAccess(tx, actor, revision.chapter.seriesId)) return fail("forbidden");
    const upload = await tx.chapterUpload.findFirst({ where: { revisionId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: statusInclude });
    return { ok: true, data: { upload: upload ? toUploadStatus(upload) : null } };
  }, { invalidate: false });
}

export async function changeSourcePolicy(id: string, input: { keepSource: boolean; reviewed?: boolean }): Promise<EditorialResult> {
  if (process.env.MEDIA_UPLOADS_ENABLED !== "1") return fail("disabled");
  if (!input || typeof input.keepSource !== "boolean" || (input.reviewed !== undefined && typeof input.reviewed !== "boolean")) return fail("invalid_input");
  return withSerializableTx(async (tx, actor) => {
    const upload = await tx.chapterUpload.findUnique({ where: { id }, include: statusInclude });
    if (!upload || upload.revision.chapter.deletedAt) return fail("not_found");
    if (!await checkStaffSeriesAccess(tx, actor, upload.revision.chapter.seriesId) || (actor.role !== "admin" && upload.createdById !== actor.id)) return fail("forbidden");
    if (upload.sourceDeletingAt || upload.sourceDeletedAt) return fail("conflict");
    // Legacy uploads cannot be enrolled into automatic deletion retroactively.
    if (!input.keepSource && (!upload.sourceSha256 || !upload.processingProfile)) return fail("conflict");
    if (input.reviewed && (upload.state !== "ready" || !upload.completedAt)) return fail("incomplete");
    const changed = await tx.chapterUpload.updateMany({ where: { id, sourceDeletingAt: null, sourceDeletedAt: null }, data: {
      keepSource: input.keepSource,
      sourceDeleteAfter: input.keepSource || !upload.completedAt ? null : sourceDeletionDate(upload.completedAt),
      ...(input.reviewed ? { sourceReviewedAt: upload.sourceReviewedAt ?? new Date() } : {}),
    } });
    if (changed.count !== 1) return fail("conflict");
    const updated = await tx.chapterUpload.findUniqueOrThrow({ where: { id }, include: statusInclude });
    return { ok: true, data: { status: toUploadStatus(updated) } };
  }, { invalidate: false });
}

async function claimSource(tx: Prisma.TransactionClient, id: string, now: Date): Promise<EditorialResult> {
  const upload = await tx.chapterUpload.findUnique({ where: { id }, include: { assets: true, chapter: { select: { deletedAt: true, series: { select: { deletedAt: true } } } } } });
  if (!upload || upload.chapter.deletedAt || upload.chapter.series.deletedAt || !sourceDeletionEligible(upload, now)) return fail("ineligible");
  const source = upload.assets.find(asset => asset.pageIndex === -1);
  if (!source || !source.readyAt || source.mime !== "application/pdf" || source.chapterId !== upload.chapterId || source.bytes !== upload.sourceBytes || !source.objectKey.endsWith(`/${upload.id}/${source.id}.pdf`)) return fail("unsafe_source");
  try { validateMediaKey(source.objectKey); } catch { return fail("unsafe_source"); }
  const pages = upload.assets.filter(asset => asset.pageIndex >= 0).sort((a, b) => a.pageIndex - b.pageIndex);
  if (pages.length !== upload.expectedPages || pages.some((page, i) => page.pageIndex !== i || !page.readyAt || page.chapterId !== upload.chapterId || !page.width || !page.height || page.bytes < 1 || !["image/jpeg", "image/webp"].includes(page.mime))) return fail("unsafe_pages");
  const path = `/api/media/${source.id}`;
  // Protect public projections, all historical snapshots, and cover references.
  if (await tx.chapterPage.count({ where: { imagePath: path } }) ||
      await tx.chapterRevision.count({ where: { pagesJson: { array_contains: [{ imagePath: path }] } } }) ||
      await tx.series.count({ where: { coverPath: path } })) return fail("referenced_source");
  // This write conflicts with policy changes in the serializable transaction.
  const claimed = await tx.chapterUpload.updateMany({ where: { id, keepSource: false, sourceDeletedAt: null, sourceDeletingAt: upload.sourceDeletingAt }, data: { sourceDeletingAt: upload.sourceDeletingAt ?? now } });
  return claimed.count === 1 ? { ok: true, data: { id: source.id, objectKey: source.objectKey, uploadId: id } } : fail("conflict");
}

/** Only new, completed PDF sources. Failed deletes retain their claim and retry safely. */
export async function maintainCompletedSources(options: { limit?: number; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(10, Math.trunc(options.limit ?? 5) || 5));
  const summary = { examined: 0, deleted: 0, failed: 0, skipped: 0 };
  if (process.env.MEDIA_UPLOADS_ENABLED !== "1") return summary;
  const candidates = await withSerializableTx(async tx => ({ ok: true, data: await tx.chapterUpload.findMany({
    where: { chapter: { deletedAt: null, series: { deletedAt: null } }, state: "ready", keepSource: false, completedAt: { not: null }, sourceSha256: { not: null }, processingProfile: { not: null }, sourceReviewedAt: { not: null }, sourceDeletedAt: null, sourceDeleteAfter: { lte: now } },
    orderBy: [{ sourceDeleteAfter: "asc" }, { id: "asc" }], select: { id: true }, take: limit,
  }) }), { system: true, invalidate: false });
  if (!candidates.ok) return summary;
  for (const candidate of candidates.data as { id: string }[]) {
    summary.examined++;
    const result = await withSerializableTx(tx => claimSource(tx, candidate.id, now), { system: true, invalidate: false });
    if (!result.ok) { summary.skipped++; continue; }
    const source = result.data as { id: string; objectKey: string; uploadId: string };
    try {
      await (await getMediaStorage()).deleteObject(source.objectKey);
      const finalized = await withSerializableTx(async tx => {
        const upload = await tx.chapterUpload.findUnique({ where: { id: source.uploadId } });
        const asset = await tx.mediaAsset.findUnique({ where: { id: source.id } });
        if (!upload?.sourceDeletingAt || upload.keepSource || (asset && (asset.uploadId !== source.uploadId || asset.pageIndex !== -1 || asset.mime !== "application/pdf" || asset.objectKey !== source.objectKey))) return fail("conflict");
        if (asset) await tx.mediaAsset.delete({ where: { id: source.id } });
        await tx.chapterUpload.update({ where: { id: source.uploadId }, data: { sourceDeletedAt: upload.sourceDeletedAt ?? now } });
        return { ok: true };
      }, { system: true, invalidate: false });
      if (finalized.ok) summary.deleted++; else summary.failed++;
    } catch { summary.failed++; }
  }
  return summary;
}

const abandonedGraceMs = 24 * 60 * 60 * 1000;
const abandonedReserveMs = 5 * 60 * 1000;
async function lockAbandonedReferences(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1500ms'");
  await tx.$executeRawUnsafe('LOCK TABLE "ChapterUpload", "MediaAsset", "ChapterPage", "ChapterRevision", "Series" IN SHARE ROW EXCLUSIVE MODE');
}
async function abandonedCandidate(tx: Prisma.TransactionClient, id: string, now: Date, prefix: string) {
  const asset = await tx.mediaAsset.findUnique({ where: { id }, include: { chapter: { select: { deletedAt: true, series: { select: { deletedAt: true } } } } } });
  if (!asset || asset.chapter.deletedAt || asset.chapter.series.deletedAt) return null;
  const upload = await tx.chapterUpload.findUnique({ where: { id: asset.uploadId } });
  // Superseded reservation keys are immutable tombstones: neither the reader
  // nor draft attachment can select an index below -1, even on a ready upload.
  const orphan = asset.pageIndex < -1;
  if (!upload || (!orphan && (!["cancelled", "uploading", "failed", "superseded"].includes(upload.state) ||
      upload.expiresAt.getTime() > now.getTime() - abandonedGraceMs)) ||
      !/^[a-f0-9]{64}$/.test(upload.sourceSha256 ?? "") || !["balanced-v1", "high-v1"].includes(upload.processingProfile ?? "") ||
      asset.createdAt.getTime() > now.getTime() - abandonedReserveMs || asset.chapterId !== upload.chapterId) return null;
  const extension = ({ "application/pdf": "pdf", "image/webp": "webp", "image/jpeg": "jpg" } as Record<string, string>)[asset.mime];
  if (!extension || asset.objectKey !== `media/${prefix}/${upload.id}/${asset.id}.${extension}` ||
      (asset.mime === "application/pdf" ? asset.pageIndex >= 0 : asset.pageIndex === -1 || asset.pageIndex >= upload.expectedPages)) return null;
  try { validateMediaKey(asset.objectKey); } catch { return null; }
  const path = `/api/media/${asset.id}`;
  // Conservative substring protection includes malformed historical snapshots and
  // decorated paths; false positives retain an orphan rather than risking content.
  const [reference] = await tx.$queryRaw<{ retained: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM "ChapterPage" WHERE strpos("imagePath", ${path}) > 0)
      OR EXISTS(SELECT 1 FROM "ChapterRevision" WHERE strpos("pagesJson"::text, ${path}) > 0)
      OR EXISTS(SELECT 1 FROM "Series" WHERE strpos("coverPath", ${path}) > 0) AS retained`;
  return reference?.retained === false ? { asset, upload, orphan } : null;
}
async function boundedAbandonedDelete(key: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getMediaStorage().then(storage => storage.deleteObject(key)),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("storage_timeout")), 3000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

/** New expired attempts and immutable reservation tombstones; shared object budget. */
export async function maintainAbandonedUploads(options: { limit?: number; now?: Date } = {}) {
  const summary = { examined: 0, deleted: 0, failed: 0, skipped: 0 };
  if (process.env.MEDIA_UPLOADS_ENABLED !== "1") return summary;
  const now = options.now ?? new Date(), prefix = process.env.MEDIA_STORAGE_PREFIX || "prod";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(prefix)) return summary;
  const limit = Math.max(1, Math.min(3, Math.trunc(options.limit ?? 3) || 3));
  const candidates = await db.mediaAsset.findMany({
    where: { chapter: { deletedAt: null, series: { deletedAt: null } }, createdAt: { lte: new Date(now.getTime() - abandonedReserveMs) }, upload: {
      sourceSha256: { not: null }, processingProfile: { in: ["balanced-v1", "high-v1"] },
    }, OR: [
      { pageIndex: { lt: -1 } },
      { upload: { state: { in: ["cancelled", "uploading", "failed", "superseded"] }, expiresAt: { lte: new Date(now.getTime() - abandonedGraceMs) } } },
    ] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit, select: { id: true },
  });
  for (const { id } of candidates) {
    summary.examined++;
    try {
      const fenced = await db.$transaction(async tx => {
        await lockAbandonedReferences(tx);
        const candidate = await abandonedCandidate(tx, id, now, prefix);
        if (!candidate) return false;
        if (candidate.orphan) return true;
        const { upload } = candidate;
        await tx.chapterUpload.update({ where: { id: upload.id }, data: { state: "cancelled", errorCode: upload.state === "cancelled" ? upload.errorCode : "expired" } });
        await tx.chapterRevision.updateMany({ where: { pendingUploadId: upload.id }, data: { pendingUploadId: null, version: { increment: 1 } } });
        return true;
      }, { isolationLevel: "ReadCommitted", maxWait: 2000, timeout: 5000 });
      if (!fenced) { summary.skipped++; continue; }
      const deleted = await db.$transaction(async tx => {
        await lockAbandonedReferences(tx);
        const candidate = await abandonedCandidate(tx, id, now, prefix);
        if (!candidate || (!candidate.orphan && candidate.upload.state !== "cancelled")) return false;
        // R2 bindings cannot abort an in-flight delete. The previously committed
        // fence (or immutable negative index) prevents attachment even if a
        // timed-out request completes later.
        await boundedAbandonedDelete(candidate.asset.objectKey);
        await tx.mediaAsset.delete({ where: { id: candidate.asset.id } });
        return true;
      }, { isolationLevel: "ReadCommitted", maxWait: 2000, timeout: 8000 });
      if (deleted) summary.deleted++; else summary.skipped++;
    } catch { summary.failed++; }
  }
  return summary;
}
