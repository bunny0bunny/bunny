import { afterAll, beforeAll, expect, test } from "bun:test";
import { actions, db, setActor } from "./session-fixture";
import { getAdminOverview, getDashboardActivity, getProfileActivity, getAdminChapters, getAdminSeriesById, getChapterForReading, getLibrary, getPublishedSeries } from "../../src/lib/queries";
import { checkStaffSeriesAccess, executeDuePublications, openOrCreateDraft, updateDraftSnapshot } from "../../src/lib/editorial";
import { isPublicChapter } from "../../src/lib/editorial-state";

const suffix = crypto.randomUUID().replaceAll("-", "");
let adminId: string, seriesId: string, chapterId: string, revisionId: string;
const slug = `trash-boundaries-${suffix}`;
beforeAll(async () => {
  const admin = await db.profile.create({ data: { email: `${slug}@bunny.test`, nickname: "Trash boundary admin", passwordHash: "x", role: "admin", emailVerifiedAt: new Date() } });
  adminId = admin.id;
  const series = await db.series.create({ data: { slug, titleAr: "اختبار الحدود", titleOriginal: "Trash boundaries", format: "novel", status: "ongoing", synopsisAr: "test", author: "test", genresJson: "[]", coverPath: "", accent: "#000000" } });
  seriesId = series.id;
  const chapter = await db.chapter.create({ data: { seriesId, number: 1, titleAr: "فصل الاختبار", workflow: "published", publishedAt: new Date(), novelBody: "Published text" } });
  chapterId = chapter.id;
  await db.libraryItem.create({ data: { profileId: adminId, seriesId, shelf: "reading" } });
  setActor(adminId);
});
afterAll(async () => {
  setActor(null);
  if (seriesId) await db.series.deleteMany({ where: { id: seriesId } });
  if (adminId) await db.profile.deleteMany({ where: { id: adminId } });
});

test("chapter trash fences readers, ordinary admin lists, editorial writes and scheduled publishing", async () => {
  expect(await getChapterForReading(slug, 1)).not.toBeNull();
  const draft = await openOrCreateDraft(chapterId);
  expect(draft.ok).toBe(true);
  revisionId = draft.revision!.id;
  await db.chapterRevision.update({ where: { id: revisionId }, data: { status: "scheduled", approvedAt: new Date(), scheduledFor: new Date(0) } });
  await db.chapter.update({ where: { id: chapterId }, data: { deletedAt: new Date() } });
  expect(await getChapterForReading(slug, 1)).toBeNull();
  expect((await getPublishedSeries({})).some(s => s.id === seriesId)).toBe(false);
  expect((await getAdminChapters({ seriesId })).length).toBe(0);
  // Keep complete history for format lock even when ordinary tables hide it.
  expect((await getAdminSeriesById(seriesId))?.chapters.some(c => c.id === chapterId)).toBe(true);
  expect((await openOrCreateDraft(chapterId)).ok).toBe(false);
  expect((await updateDraftSnapshot({ revisionId, expectedVersion: draft.revision!.version, titleAr: "تعديل ممنوع" })).ok).toBe(false);
  await executeDuePublications(100, { system: true });
  expect((await db.chapterRevision.findUniqueOrThrow({ where: { id: revisionId } })).status).toBe("scheduled");
  expect((await actions.saveReadingProgress({ seriesSlug: slug, chapterNumber: 1, pageIndex: 0, percent: 50, completed: false })).ok).toBe(false);
});

test("trashed parent blocks even administrators and hides private library links", async () => {
  await db.chapter.update({ where: { id: chapterId }, data: { deletedAt: null } });
  await db.series.update({ where: { id: seriesId }, data: { deletedAt: new Date() } });
  const allowed = await db.$transaction(tx => checkStaffSeriesAccess(tx, { id: adminId, role: "admin", nickname: "Admin" }, seriesId));
  expect(allowed).toBe(false);
  expect(await getAdminSeriesById(seriesId)).toBeNull();
  expect((await getLibrary(adminId)).some(item => item.series.id === seriesId)).toBe(false);
  expect((await openOrCreateDraft(chapterId)).ok).toBe(false);
  expect(await getChapterForReading(slug, 1)).toBeNull();
});

test("projection visibility rejects trash regardless of publication state", () => {
  expect(isPublicChapter({ workflow: "published", scheduledFor: null, deletedAt: new Date() })).toBe(false);
  expect(isPublicChapter({ workflow: "published", scheduledFor: null, series: { deletedAt: new Date() } })).toBe(false);
});

test("raw media, upload callbacks and cleanup all refuse a trashed chapter", async () => {
  process.env.MEDIA_UPLOADS_ENABLED = "1";
  const visual = await db.series.create({ data: { slug: `${slug}-media`, titleAr: "اختبار الوسائط", format: "manga", synopsisAr: "test", author: "test", coverPath: "" } });
  try {
    const chapter = await db.chapter.create({ data: { seriesId: visual.id, number: 1, titleAr: "فصل الوسائط" } });
    const draft = await openOrCreateDraft(chapter.id);
    const uploads = await import("../../src/lib/media/uploads");
    const retention = await import("../../src/lib/media/source-retention");
    const started = await uploads.startUpload({ revisionId: draft.revision!.id, expectedVersion: draft.revision!.version, sourceName: "source.pdf", sourceBytes: 8, pageCount: 1 });
    expect(started.ok).toBe(true);
    const { uploadId, revisionVersion } = started.data as { uploadId: string; revisionVersion: number };
    const asset = await db.mediaAsset.create({ data: { uploadId, chapterId: chapter.id, pageIndex: -2, objectKey: `media/prod/${uploadId}/trashboundaries.pdf`, mime: "application/pdf", bytes: 8, readyAt: new Date(), createdAt: new Date(0) } });
    await db.chapterUpload.update({ where: { id: uploadId }, data: { sourceSha256: "a".repeat(64), processingProfile: "balanced-v1", expiresAt: new Date(0) } });
    await db.chapter.update({ where: { id: chapter.id }, data: { deletedAt: new Date() } });
    expect((await uploads.uploadStatus(uploadId)).ok).toBe(false);
    expect((await uploads.completeUpload(uploadId, revisionVersion)).ok).toBe(false);
    const request = new Request("http://localhost/source", { method: "PUT", headers: { "content-length": "8", "content-type": "application/pdf" }, body: "%PDF-1.7" });
    expect((await uploads.writeUploadAsset(uploadId, -1, request)).ok).toBe(false);
    await retention.maintainAbandonedUploads({ limit: 3 });
    expect(await db.mediaAsset.findUnique({ where: { id: asset.id } })).not.toBeNull();
    const { GET } = await import("../../src/app/api/media/[assetId]/route");
    expect((await GET(new Request("http://localhost/media"), { params: Promise.resolve({ assetId: asset.id }) })).status).not.toBe(307);
  } finally { await db.series.delete({ where: { id: visual.id } }); }
});

 test("analytics queries exclude trashed chapter events without invalid relation filters", async () => {
  await db.series.update({ where: { id: seriesId }, data: { deletedAt: null } });
  await db.chapter.update({ where: { id: chapterId }, data: { deletedAt: new Date() } });
  const event = await db.analyticsEvent.create({ data: { profileId: adminId, seriesId, chapterId, type: "read_start" } });
  try {
    expect((await getProfileActivity(adminId, 100)).some(row => row.id === event.id)).toBe(false);
    expect((await getAdminOverview())?.recentEvents.some(row => row.id === event.id)).toBe(false);
    expect(Array.isArray(await getDashboardActivity())).toBe(true);
  } finally { await db.analyticsEvent.delete({ where: { id: event.id } }); }
});
