import { getWorkTitle } from '@/lib/work-title';
import "server-only";
import { Prisma, type ChapterRevision, type ReadingDirection } from "@prisma/client";
import { db } from "@/lib/db";
import { currentProfileOrNull } from "@/lib/queries";
import { revalidatePath } from "next/cache";

export type PageSnapshot = { pageIndex: number; imagePath: string; width: number; height: number };
export type EditorialResult<T = ChapterRevision> = { ok: boolean; error?: string; revision?: T; data?: unknown };
type Actor = { id: string | null; role: string; nickname: string };
type Tx = Prisma.TransactionClient;
type VersionInput = { revisionId: string; expectedVersion: number };
const pendingStates = ["draft", "review", "changes_requested", "approved", "scheduled"] as const;

export async function withSerializableTx(
  work: (tx: Tx, actor: Actor) => Promise<EditorialResult>, options: { system?: boolean; invalidate?: boolean } = {},
): Promise<EditorialResult> {
  const sessionProfile = options.system ? null : await currentProfileOrNull();
  if (!options.system && !sessionProfile) return { ok: false, error: "unauthenticated" };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await db.$transaction(async tx => {
        const profile = sessionProfile ? await tx.profile.findUnique({ where: { id: sessionProfile.id }, select: { id: true, role: true, nickname: true, disabledAt: true, emailVerifiedAt: true, authVersion: true } }) : null;
        if (!options.system && (!profile || profile.disabledAt || !profile.emailVerifiedAt || profile.authVersion !== sessionProfile?.authVersion)) return { ok: false, error: "unauthenticated" };
        const actor: Actor = profile ? { id: profile.id, role: profile.role, nickname: profile.nickname } : { id: null, role: "admin", nickname: "الناشر المجدول" };
        return work(tx, actor);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 15000 });
      if (result.ok && options.invalidate !== false) {
        for (const route of ["/studio", "/admin/trash", "/admin/series", "/library", "/admin/chapters", "/updates", "/explore", "/"]) revalidatePath(route);
        revalidatePath("/series/[slug]", "page");
        revalidatePath("/studio/chapters/[id]", "page");
        for (const format of ["manga", "webtoon", "novel"]) revalidatePath(`/read/${format}/[series]/[chapter]`, "page");
      }
      return result;
    } catch (error) {
      // Worker and Node bundles can carry different Prisma error constructors.
      // Retry only the two known transaction/unique-conflict codes, regardless of realm.
      if (error && typeof error === "object" && "code" in error && ["P2034", "P2002"].includes(String(error.code))) {
        if (attempt < 3) { await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1))); continue; }
        return { ok: false, error: "conflict" };
      }
      throw error;
    }
  }
  return { ok: false, error: "conflict" };
}

export async function checkStaffSeriesAccess(tx: Tx, actor: Actor, seriesId: string) {
  if (!await tx.series.findFirst({ where: { id: seriesId, deletedAt: null }, select: { id: true } })) return false;
  if (actor.role === "admin") return true;
  if (!actor.id || !["contributor", "editor"].includes(actor.role)) return false;
  return Boolean(await tx.seriesAssignment.findUnique({ where: { profileId_seriesId: { profileId: actor.id, seriesId } }, select: { id: true } }));
}

async function audit(tx: Tx, actor: Actor, revision: ChapterRevision, action: string, reasonAr?: string, metadata: Prisma.InputJsonObject = {}) {
  await tx.chapterEditorialEvent.create({ data: {
    chapterId: revision.chapterId, revisionId: revision.id, actorId: actor.id, action, reasonAr,
    metadata: { actorName: actor.nickname, revisionNumber: revision.revisionNumber, version: revision.version, ...metadata },
  } });
}

export function validatePagesSnapshot(pages: unknown): PageSnapshot[] | null {
  if (!Array.isArray(pages) || pages.length > 1000) return null;
  const result: PageSnapshot[] = [];
  for (const [index, raw] of pages.entries()) {
    if (!raw || typeof raw !== "object") return null;
    const page = raw as Partial<PageSnapshot>;
    if (typeof page.imagePath !== "string" || !/^(?:\/art\/(?:pages|panels|covers)\/|\/api\/media\/[a-z0-9]+$)/.test(page.imagePath) || /\.\.|[\\?#\u0000]/.test(page.imagePath) || page.imagePath.includes("//")) return null;
    if (!Number.isInteger(page.width) || !Number.isInteger(page.height) || page.width! < 1 || page.height! < 1 || page.width! > 20000 || page.height! > 20000) return null;
    result.push({ pageIndex: index, imagePath: page.imagePath, width: page.width!, height: page.height! });
  }
  return result;
}

async function pagesBelongToChapter(tx: Tx, chapterId: string, pages: PageSnapshot[]) {
  const [originals, history] = await Promise.all([
    tx.chapterPage.findMany({ where: { chapterId }, select: { imagePath: true, width: true, height: true } }),
    tx.chapterRevision.findMany({ where: { chapterId }, select: { pagesJson: true } }),
  ]);
  const known = new Set(originals.map(page => `${page.imagePath}|${page.width}|${page.height}`));
  for (const revision of history) for (const page of validatePagesSnapshot(revision.pagesJson) ?? []) known.add(`${page.imagePath}|${page.width}|${page.height}`);
  const media = pages.filter(page => page.imagePath.startsWith("/api/media/"));
  const assets = media.length ? await tx.mediaAsset.findMany({ where: { id: { in: media.map(page => page.imagePath.slice(11)) }, chapterId, pageIndex: { gte: 0 }, readyAt: { not: null }, upload: { state: "ready" } } }) : [];
  return pages.every(page => page.imagePath.startsWith("/api/media/")
    ? assets.some(asset => asset.id === page.imagePath.slice(11) && asset.width === page.width && asset.height === page.height)
    : known.has(`${page.imagePath}|${page.width}|${page.height}`));
}

export function validateRevisionContent(format: string, revision: { titleAr?: string; novelBody?: string | null; pagesJson?: unknown }) {
  if (revision.titleAr !== undefined && (revision.titleAr.trim().length < 2 || revision.titleAr.length > 300)) return { valid: false, error: "عنوان الفصل غير صالح" };
  if (format === "novel") return revision.novelBody?.trim() && revision.novelBody.length <= 60000 ? { valid: true } : { valid: false, error: "أدخل نص الفصل قبل إرساله أو اعتماده" };
  const pages = validatePagesSnapshot(revision.pagesJson);
  return pages?.length ? { valid: true } : { valid: false, error: "الفصل يحتاج صفحات صالحة قبل إرساله أو اعتماده" };
}

export async function ensureChapterRevisionsInitialized(tx: Tx, chapterId: string) {
  if (await tx.chapterRevision.count({ where: { chapterId } })) return;
  const chapter = await tx.chapter.findUnique({ where: { id: chapterId, deletedAt: null, series: { deletedAt: null } }, include: { pages: { orderBy: { pageIndex: "asc" } } } });
  if (!chapter || chapter.deletedAt) return;
  const scheduled = chapter.workflow === "published" && chapter.scheduledFor && chapter.scheduledFor > new Date();
  const revision = await tx.chapterRevision.create({ data: {
    chapterId, revisionNumber: 1, status: scheduled ? "scheduled" : chapter.workflow,
    titleAr: chapter.titleAr, readingDirection: chapter.readingDirection, isPremiumDemo: chapter.isPremiumDemo, novelBody: chapter.novelBody,
    pagesJson: chapter.pages.map(({ pageIndex, imagePath, width, height }) => ({ pageIndex, imagePath, width, height })),
    scheduledFor: scheduled ? chapter.scheduledFor : null,
    approvedAt: chapter.workflow === "published" ? (chapter.publishedAt ?? chapter.createdAt) : null,
  } });
  await audit(tx, { id: null, role: "admin", nickname: "ترحيل المحتوى السابق" }, revision, "lazy_initialize");
  if (scheduled) await tx.chapter.update({ where: { id: chapterId }, data: { workflow: "draft", scheduledFor: null, publishedAt: null } });
}

export async function openOrCreateDraft(chapterId: string): Promise<EditorialResult> {
  return withSerializableTx(async (tx, actor) => {
    const chapter = await tx.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter || chapter.deletedAt) return { ok: false, error: "not_found" };
    if (!await checkStaffSeriesAccess(tx, actor, chapter.seriesId)) return { ok: false, error: "forbidden" };
    await ensureChapterRevisionsInitialized(tx, chapterId);
    const latest = await tx.chapterRevision.findFirstOrThrow({ where: { chapterId }, orderBy: { revisionNumber: "desc" } });
    if (pendingStates.some(state => state === latest.status)) return { ok: true, revision: latest };
    const revision = await tx.chapterRevision.create({ data: {
      chapterId, revisionNumber: latest.revisionNumber + 1, titleAr: latest.titleAr, readingDirection: latest.readingDirection,
      isPremiumDemo: latest.isPremiumDemo, novelBody: latest.novelBody, pagesJson: latest.pagesJson as Prisma.InputJsonValue,
    } });
    await audit(tx, actor, revision, "fork_draft", undefined, { previousRevision: latest.revisionNumber });
    return { ok: true, revision };
  }, { invalidate: false });
}

export async function editableRevision(tx: Tx, actor: Actor, input: VersionInput) {
  const revision = await tx.chapterRevision.findUnique({ where: { id: input.revisionId }, include: { chapter: { include: { series: true } } } });
  if (!revision || revision.chapter.deletedAt || revision.chapter.series.deletedAt) return { error: "not_found" } as const;
  if (!await checkStaffSeriesAccess(tx, actor, revision.chapter.seriesId)) return { error: "forbidden" } as const;
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion !== revision.version) return { error: "conflict" } as const;
  const latest = await tx.chapterRevision.findFirst({ where: { chapterId: revision.chapterId }, orderBy: { revisionNumber: "desc" }, select: { id: true } });
  if (latest?.id !== revision.id) return { error: "conflict" } as const;
  if (!pendingStates.some(state => state === revision.status)) return { error: "النسخة محفوظة في السجل؛ افتح مسودة جديدة لتعديلها" } as const;
  return { revision } as const;
}

export async function updateDraftSnapshot(input: VersionInput & { titleAr?: string; readingDirection?: ReadingDirection; isPremiumDemo?: boolean; novelBody?: string; pages?: unknown }): Promise<EditorialResult> {
  return withSerializableTx(async (tx, actor) => {
    const found = await editableRevision(tx, actor, input);
    if (found.error) return { ok: false, error: found.error };
    const revision = found.revision!;
    if (revision.pendingUploadId) return { ok: false, error: "upload_pending" };
    if (input.isPremiumDemo !== undefined && actor.role !== "admin") return { ok: false, error: "forbidden" };
    if (input.titleAr !== undefined && (typeof input.titleAr !== "string" || input.titleAr.trim().length < 2 || input.titleAr.length > 300)) return { ok: false, error: "عنوان الفصل غير صالح" };
    if (input.novelBody !== undefined && (typeof input.novelBody !== "string" || input.novelBody.length > 60000)) return { ok: false, error: "نص الفصل يتجاوز الحد المسموح" };
    if (input.readingDirection !== undefined && !["rtl", "ltr"].includes(input.readingDirection)) return { ok: false, error: "اتجاه القراءة غير صالح" };
    const pages = input.pages === undefined ? null : validatePagesSnapshot(input.pages);
    const currentPages = validatePagesSnapshot(revision.pagesJson);
    if (input.pages !== undefined && (currentPages?.some(page => page.imagePath.startsWith("/api/media/")) || pages?.some(page => page.imagePath.startsWith("/api/media/"))) && JSON.stringify(pages) !== JSON.stringify(currentPages)) {
      return { ok: false, error: "لتغيير صفحات الفصل، استبدل ملف PDF كاملًا" };
    }
    if (input.pages !== undefined && (!pages || !await pagesBelongToChapter(tx, revision.chapterId, pages))) return { ok: false, error: "يمكن ترتيب صفحات هذا الفصل الموجودة فقط" };
    const revoked = ["approved", "scheduled"].includes(revision.status);
    const updated = await tx.chapterRevision.update({ where: { id: revision.id }, data: {
      titleAr: input.titleAr?.trim(), novelBody: input.novelBody, readingDirection: input.readingDirection, isPremiumDemo: input.isPremiumDemo,
      ...(pages ? { pagesJson: pages } : {}), status: "draft", approvedAt: null, approvedById: null, scheduledFor: null, version: { increment: 1 },
    } });
    await audit(tx, actor, updated, revoked ? "edit_revoked_approval" : "update_draft", revoked ? "تعديل النسخة ألغى اعتمادها وجدولتها" : undefined);
    return { ok: true, revision: updated };
  });
}

type Transition = "submit" | "return" | "recommend" | "approve" | "schedule" | "cancel";
async function transition(input: VersionInput & { reason?: string; note?: string; scheduledFor?: Date }, action: Transition): Promise<EditorialResult> {
  return withSerializableTx(async (tx, actor) => {
    if (["approve", "schedule", "cancel"].includes(action) && actor.role !== "admin") return { ok: false, error: "forbidden" };
    if (["return", "recommend"].includes(action) && !["editor", "admin"].includes(actor.role)) return { ok: false, error: "forbidden" };
    const found = await editableRevision(tx, actor, input);
    if (found.error) return { ok: false, error: found.error };
    const revision = found.revision!;
    if (revision.pendingUploadId) return { ok: false, error: "upload_pending" };
    const allowed: Record<Transition, string[]> = { submit: ["draft", "changes_requested"], return: ["review", "approved", "scheduled"], recommend: ["review"], approve: ["draft", "review", "changes_requested"], schedule: ["approved", "scheduled"], cancel: ["scheduled"] };
    if (!allowed[action].includes(revision.status)) return { ok: false, error: "الإجراء غير متاح لحالة النسخة الحالية" };
    if (action === "return" && (!input.reason?.trim() || input.reason.length > 2000)) return { ok: false, error: "reason_required" };
    if (input.note && input.note.length > 2000) return { ok: false, error: "ملاحظة المراجعة طويلة جدًا" };
    if (["submit", "recommend", "approve", "schedule"].includes(action)) {
      const valid = validateRevisionContent(revision.chapter.series.format, revision);
      if (!valid.valid) return { ok: false, error: valid.error };
      const pages = validatePagesSnapshot(revision.pagesJson);
      if (revision.chapter.series.format !== "novel" && (!pages || !await pagesBelongToChapter(tx, revision.chapterId, pages))) return { ok: false, error: "invalid_media" };
    }
    if (action === "schedule" && (!(input.scheduledFor instanceof Date) || !Number.isFinite(input.scheduledFor.getTime()) || input.scheduledFor.getTime() <= Date.now())) return { ok: false, error: "موعد النشر يجب أن يكون في المستقبل" };
    if (["schedule", "cancel"].includes(action) && !revision.approvedAt) return { ok: false, error: "يلزم اعتماد النسخة أولًا" };
    const statuses = { submit: "review", return: "changes_requested", recommend: "review", approve: "approved", schedule: "scheduled", cancel: "approved" } as const;
    const updated = await tx.chapterRevision.update({ where: { id: revision.id }, data: {
      status: statuses[action], version: { increment: 1 },
      ...(action === "approve" ? { approvedById: actor.id, approvedAt: new Date(), scheduledFor: null } : {}),
      ...(action === "return" ? { approvedAt: null, approvedById: null, scheduledFor: null } : {}),
      ...(action === "schedule" ? { scheduledFor: input.scheduledFor } : {}),
      ...(action === "cancel" ? { scheduledFor: null } : {}),
    } });
    const names = { submit: "submit_for_review", return: "return_for_changes", recommend: "recommend_approval", approve: "approve_revision", schedule: "schedule_revision", cancel: "cancel_schedule" };
    await audit(tx, actor, updated, names[action], input.reason?.trim() || input.note?.trim(), { scheduledFor: updated.scheduledFor?.toISOString() ?? null });
    return { ok: true, revision: updated };
  });
}
export const submitForReview = (input: VersionInput) => transition(input, "submit");
export const returnForChanges = (input: VersionInput & { reason: string }) => transition(input, "return");
export const recommendApproval = (input: VersionInput & { note?: string }) => transition(input, "recommend");
export const approveRevision = (input: VersionInput) => transition(input, "approve");
export const scheduleRevision = (input: VersionInput & { scheduledFor: Date }) => transition(input, "schedule");
export const cancelScheduledRevision = (input: VersionInput) => transition(input, "cancel");

async function publishProjection(tx: Tx, actor: Actor, revision: ChapterRevision, scheduled: boolean): Promise<EditorialResult> {
  if (revision.pendingUploadId) return { ok: false, error: "upload_pending" };
  const chapter = await tx.chapter.findUniqueOrThrow({ where: { id: revision.chapterId }, include: { series: true } });
  if (chapter.deletedAt || chapter.series.deletedAt) return { ok: false, error: "not_found" };
  if (!revision.approvedAt || !["approved", "scheduled"].includes(revision.status)) return { ok: false, error: "يلزم اعتماد النسخة قبل النشر" };
  const valid = validateRevisionContent(chapter.series.format, revision);
  if (!valid.valid) return { ok: false, error: valid.error };
  const pages = validatePagesSnapshot(revision.pagesJson);
  if (chapter.series.format !== "novel" && (!pages || !await pagesBelongToChapter(tx, chapter.id, pages))) return { ok: false, error: "صفحات النسخة غير صالحة" };
  await tx.chapter.update({ where: { id: chapter.id }, data: {
    titleAr: revision.titleAr, novelBody: revision.novelBody, readingDirection: revision.readingDirection, isPremiumDemo: revision.isPremiumDemo,
    workflow: "published", publishedAt: chapter.publishedAt ?? new Date(), scheduledFor: null,
  } });
  if (chapter.series.format !== "novel") {
    await tx.chapterPage.deleteMany({ where: { chapterId: chapter.id } });
    await tx.chapterPage.createMany({ data: pages!.map(page => ({ ...page, chapterId: chapter.id })) });
  }
  const updated = await tx.chapterRevision.update({ where: { id: revision.id }, data: { status: "published", scheduledFor: null, version: { increment: 1 } } });
  await audit(tx, actor, updated, scheduled ? "publish_due_scheduled" : "publish_now", undefined, { publishedAt: new Date().toISOString() });
  await tx.analyticsEvent.create({ data: { type: "publish", seriesId: chapter.seriesId, chapterId: chapter.id, profileId: actor.id, metaJson: JSON.stringify({ revisionNumber: revision.revisionNumber, version: revision.version }) } });
  // Notifications share the publication transaction, so retries/rollbacks cannot duplicate them.
  const followers = await tx.libraryItem.findMany({ where: { seriesId: chapter.seriesId }, select: { profileId: true } });
  const ids = [...new Set(followers.map(follower => follower.profileId))];
  for (let start = 0; start < ids.length; start += 500) await tx.notification.createMany({ data: ids.slice(start, start + 500).map(profileId => ({
    profileId, type: "new_chapter" as const, titleAr: `تحديث في «${getWorkTitle(chapter.series)}»`, bodyAr: `الفصل ${chapter.number} — ${revision.titleAr} متاح الآن.`, href: `/read/${chapter.series.format}/${chapter.series.slug}/${chapter.number}`,
  })) });
  return { ok: true, revision: updated, data: { processed: true } };
}

export async function publishRevisionNow(input: VersionInput): Promise<EditorialResult> {
  return withSerializableTx(async (tx, actor) => {
    if (actor.role !== "admin") return { ok: false, error: "forbidden" };
    const found = await editableRevision(tx, actor, input);
    return found.error ? { ok: false, error: found.error } : publishProjection(tx, actor, found.revision!, false);
  });
}

export async function withdrawPublishedChapter(input: { chapterId: string; expectedRevisionId?: string; expectedVersion?: number; reason: string }): Promise<EditorialResult> {
  return withSerializableTx(async (tx, actor) => {
    if (actor.role !== "admin") return { ok: false, error: "forbidden" };
    if (!input.reason?.trim() || input.reason.length > 2000) return { ok: false, error: "reason_required" };
    await ensureChapterRevisionsInitialized(tx, input.chapterId);
    const chapter = await tx.chapter.findUnique({ where: { id: input.chapterId, deletedAt: null, series: { deletedAt: null } } });
    if (!chapter || chapter.deletedAt) return { ok: false, error: "not_found" };
    const active = await tx.chapterRevision.findFirst({ where: { chapterId: chapter.id, status: "published" }, orderBy: { revisionNumber: "desc" } });
    if (chapter.workflow !== "published" || !active || active.id !== input.expectedRevisionId || active.version !== input.expectedVersion) return { ok: false, error: "conflict" };
    await tx.chapter.update({ where: { id: chapter.id }, data: { workflow: "draft", scheduledFor: null } });
    const withdrawn = await tx.chapterRevision.update({ where: { id: active.id }, data: { status: "withdrawn", version: { increment: 1 } } });
    await tx.chapterUpload.updateMany({ where: { chapterId: chapter.id, state: { in: ["uploading", "failed"] } }, data: { state: "cancelled", errorCode: "chapter_withdrawn" } });
    await tx.chapterRevision.updateMany({ where: { chapterId: chapter.id, status: { in: [...pendingStates] } }, data: { pendingUploadId: null, status: "draft", approvedAt: null, approvedById: null, scheduledFor: null, version: { increment: 1 } } });
    await audit(tx, actor, withdrawn, "withdraw_chapter", input.reason.trim());
    return { ok: true, revision: withdrawn };
  });
}

export async function executeDuePublications(limit = 20, options: { system?: boolean } = {}): Promise<{ publishedCount: number; errors: string[] }> {
  let publishedCount = 0;
  const errors: string[] = [];
  const maximum = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 100)) : 20;
  for (let count = 0; count < maximum; count++) {
    const result = await withSerializableTx(async (tx, actor) => {
      if (actor.role !== "admin") return { ok: false, error: "forbidden" };
      const due = await tx.chapterRevision.findFirst({ where: { chapter: { deletedAt: null, series: { deletedAt: null } }, status: "scheduled", approvedAt: { not: null }, scheduledFor: { lte: new Date() } }, orderBy: [{ scheduledFor: "asc" }, { id: "asc" }] });
      if (!due) return { ok: true, data: { processed: false } };
      const latest = await tx.chapterRevision.findFirst({ where: { chapterId: due.chapterId }, orderBy: { revisionNumber: "desc" }, select: { id: true } });
      if (latest?.id !== due.id) return { ok: false, error: "conflict" };
      return publishProjection(tx, actor, due, true);
    }, options);
    if (!result.ok) { errors.push(result.error ?? "تعذّر النشر"); break; }
    if (!(result.data as { processed?: boolean } | undefined)?.processed) break;
    publishedCount++;
  }
  return { publishedCount, errors };
}
