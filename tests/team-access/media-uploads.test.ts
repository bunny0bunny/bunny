import { beforeAll, afterAll, expect, test, mock } from "bun:test";
import { db, setActor } from "./session-fixture";
const writes: string[] = [];
let duringWrite: (() => Promise<void>) | undefined;
mock.module("../../src/lib/media/storage", () => ({ getMediaStorage: async () => ({
  putPage: async (key: string, bytes: Uint8Array) => { writes.push(key); await duringWrite?.(); return { bytes: bytes.length }; },
  putSource: async (key: string, stream: ReadableStream<Uint8Array>) => { let bytes = 0; for await (const part of stream) bytes += part.length; writes.push(key); await duringWrite?.(); return { bytes }; },
  signGet: async () => "https://example.invalid/private",
}) }));
const uploads = await import("../../src/lib/media/uploads");
const editorial = await import("../../src/lib/editorial");
let actor: string, series: string, chapter: string, revision: string;
beforeAll(async () => {
  process.env.MEDIA_UPLOADS_ENABLED = "1";
  actor = (await db.profile.create({ data: { email: `media-${Date.now()}@bunny.test`, nickname: "اختبار", passwordHash: "x", role: "contributor", emailVerifiedAt: new Date() } })).id;
  series = (await db.series.create({ data: { slug: `media-${Date.now()}`, titleAr: "اختبار", synopsisAr: "اختبار", author: "اختبار", format: "manga", coverPath: "/art/covers/test.webp" } })).id;
  await db.seriesAssignment.create({ data: { profileId: actor, seriesId: series } });
  chapter = (await db.chapter.create({ data: { seriesId: series, number: 1, titleAr: "اختبار" } })).id;
  setActor(actor);
  revision = (await editorial.openOrCreateDraft(chapter)).revision!.id;
}, 30000);
afterAll(async () => { setActor(null); await db.series.delete({ where: { id: series } }); await db.profile.delete({ where: { id: actor } }); }, 30000);
async function start() { const r = await db.chapterRevision.findUniqueOrThrow({ where: { id: revision } }); return uploads.startUpload({ revisionId: revision, expectedVersion: r.version, sourceName: "test.pdf", sourceBytes: 8, pageCount: 1 }); }
test("rejects unauthenticated starts before creating reservations", async () => { setActor(null); expect((await start()).error).toBe("unauthenticated"); setActor(actor); });
test("partial import blocks review and stale completion; cancel preserves snapshot", async () => {
  await db.chapterRevision.update({ where: { id: revision }, data: { status: "scheduled", approvedAt: new Date(), scheduledFor: new Date(Date.now() + 3600000) } });
  const initial = await db.chapterRevision.findUniqueOrThrow({ where: { id: revision } });
  const begun = await start(); expect(begun.ok).toBe(true);
  const data = begun.data as { uploadId: string; revisionVersion: number };
  const started = await db.chapterRevision.findUniqueOrThrow({ where: { id: revision } });
  expect(started.approvedAt).toBeNull(); expect(started.scheduledFor).toBeNull(); expect(started.status).toBe("draft");
  expect((await editorial.submitForReview({ revisionId: revision, expectedVersion: data.revisionVersion })).ok).toBe(false);
  expect((await uploads.completeUpload(data.uploadId, data.revisionVersion)).error).toBe("incomplete");
  expect((await uploads.cancelUpload(data.uploadId, data.revisionVersion - 1)).error).toBe("conflict");
  expect((await uploads.cancelUpload(data.uploadId, data.revisionVersion)).ok).toBe(true);
  expect((await db.chapterRevision.findUniqueOrThrow({ where: { id: revision } })).pagesJson).toEqual(initial.pagesJson);
});
test("ready retries do not overwrite and complete preserves publication until approval", async () => {
  await db.chapter.update({ where: { id: chapter }, data: { workflow: "published", publishedAt: new Date() } });
  await db.chapterPage.create({ data: { chapterId: chapter, pageIndex: 0, imagePath: "/art/pages/retained.webp", width: 800, height: 1200 } });
  const begun = await start(); const data = begun.data as { uploadId: string; revisionVersion: number };
  const source = () => new Request("http://localhost/source", { method: "PUT", headers: { "content-length": "8", "content-type": "application/pdf" }, body: "%PDF-1.7" });
  expect((await uploads.writeUploadAsset(data.uploadId, -1, source())).ok).toBe(true);
  const pageBytes = Uint8Array.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,255,217]);
  const page = () => new Request("http://localhost/page", { method: "PUT", headers: { "content-length": String(pageBytes.length), "content-type": "image/jpeg" }, body: pageBytes });
  expect((await uploads.writeUploadAsset(data.uploadId, 0, page())).ok).toBe(true);
  const count = writes.length;
  expect((await uploads.writeUploadAsset(data.uploadId, 0, page())).ok).toBe(true); expect(writes.length).toBe(count);
  const complete = await uploads.completeUpload(data.uploadId, data.revisionVersion); expect(complete.ok).toBe(true);
  expect((await uploads.completeUpload(data.uploadId, data.revisionVersion)).ok).toBe(true);
  expect(await db.chapterEditorialEvent.count({ where: { revisionId: revision, action: "complete_pdf_upload" } })).toBe(1);
  expect((await db.chapter.findUniqueOrThrow({ where: { id: chapter } })).workflow).toBe("published");
  expect((await db.chapterPage.findFirstOrThrow({ where: { chapterId: chapter } })).imagePath).toBe("/art/pages/retained.webp");
  await db.chapterPage.deleteMany({ where: { chapterId: chapter } });
  await db.chapter.update({ where: { id: chapter }, data: { workflow: "draft" } });
});
test("late writes after cancellation never become ready or attach", async () => {
  const begun = await start(); const data = begun.data as { uploadId: string; revisionVersion: number };
  duringWrite = async () => { duringWrite = undefined; await uploads.cancelUpload(data.uploadId, data.revisionVersion); };
  const req = new Request("http://localhost/source", { method: "PUT", headers: { "content-length": "8", "content-type": "application/pdf" }, body: "%PDF-1.7" });
  expect((await uploads.writeUploadAsset(data.uploadId, -1, req)).ok).toBe(false);
  expect(await db.mediaAsset.count({ where: { uploadId: data.uploadId, readyAt: { not: null } } })).toBe(0);
});

test("length, MIME and page-index failures cannot reserve storage", async () => {
  const begun = await start(); const data = begun.data as { uploadId: string; revisionVersion: number };
  expect((await uploads.writeUploadAsset(data.uploadId, -1, new Request("http://localhost", { method: "PUT", body: "%PDF-1.7" }))).error).toBe("invalid_length");
  expect((await uploads.writeUploadAsset(data.uploadId, -1, new Request("http://localhost", { method: "PUT", headers: { "content-length": "9", "content-type": "application/pdf" }, body: "%PDF-1.7" }))).error).toBe("invalid_input");
  expect(await db.mediaAsset.count({ where: { uploadId: data.uploadId } })).toBe(0);
  await uploads.cancelUpload(data.uploadId, data.revisionVersion);
});
test("revoked assignment and stale authentication prevent upload writes", async () => {
  const begun = await start(); const data = begun.data as { uploadId: string; revisionVersion: number };
  const req = () => new Request("http://localhost", { method: "PUT", headers: { "content-length": "8", "content-type": "application/pdf" }, body: "%PDF-1.7" });
  await db.seriesAssignment.delete({ where: { profileId_seriesId: { profileId: actor, seriesId: series } } });
  expect((await uploads.writeUploadAsset(data.uploadId, -1, req())).error).toBe("forbidden");
  await db.seriesAssignment.create({ data: { profileId: actor, seriesId: series } });
  await db.profile.update({ where: { id: actor }, data: { authVersion: 1 } });
  expect((await uploads.writeUploadAsset(data.uploadId, -1, req())).error).toBe("unauthenticated");
  await db.profile.update({ where: { id: actor }, data: { authVersion: 0 } });
  await uploads.cancelUpload(data.uploadId, data.revisionVersion);
});
test("forged cross-chapter media snapshots fail before publication side effects", async () => {
  const r = await db.chapterRevision.findUniqueOrThrow({ where: { id: revision } });
  expect((await editorial.updateDraftSnapshot({ revisionId: revision, expectedVersion: r.version, pages: [{ imagePath: "/api/media/forgedasset", width: 1, height: 1 }] })).ok).toBe(false);
  expect((await db.chapter.findUniqueOrThrow({ where: { id: chapter } })).workflow).toBe("draft");
});

test("reserved daily and import quotas reject before creating an asset", async () => {
  const begun = await start(); const data = begun.data as { uploadId: string; revisionVersion: number };
  await db.chapterUpload.update({ where: { id: data.uploadId }, data: { reservedBytes: 200 * 1024 * 1024 } });
  const req = () => new Request("http://localhost", { method: "PUT", headers: { "content-length": "8", "content-type": "application/pdf" }, body: "%PDF-1.7" });
  expect((await uploads.writeUploadAsset(data.uploadId, -1, req())).error).toBe("quota");
  await db.chapterUpload.update({ where: { id: data.uploadId }, data: { reservedBytes: 0 } });
  const keyHash = `media:bytes:${actor}:${Math.floor(Date.now() / 86400000)}`;
  await db.accountRateLimit.upsert({ where: { keyHash }, create: { keyHash, count: 512 * 1024 * 1024, windowEnd: new Date(Date.now() + 86400000) }, update: { count: 512 * 1024 * 1024 } });
  expect((await uploads.writeUploadAsset(data.uploadId, -1, req())).error).toBe("quota");
  expect(await db.mediaAsset.count({ where: { uploadId: data.uploadId } })).toBe(0);
  await uploads.cancelUpload(data.uploadId, data.revisionVersion);
});
test("mutation routes require exact trusted origin and explicit upload intent", () => {
  const origin = new URL(process.env.APP_ORIGIN!).origin;
  expect(uploads.uploadRequestGuard(new Request(origin, { method: "POST", headers: { origin, "x-bunny-upload": "1" } }))).toBeNull();
  expect(uploads.uploadRequestGuard(new Request(origin, { method: "POST", headers: { origin: `${origin}.evil`, "x-bunny-upload": "1" } }))).toBe("forbidden");
  expect(uploads.uploadRequestGuard(new Request(origin, { method: "POST", headers: { origin } }))).toBe("forbidden");
});

test("a profile cannot import another chapter concurrently", async () => {
  const begun = await start(); const data = begun.data as { uploadId: string; revisionVersion: number };
  const otherChapter = await db.chapter.create({ data: { seriesId: series, number: 2, titleAr: "فصل آخر" } });
  const draft = (await editorial.openOrCreateDraft(otherChapter.id)).revision!;
  expect((await uploads.startUpload({ revisionId: draft.id, expectedVersion: draft.version, sourceName: "other.pdf", sourceBytes: 8, pageCount: 1 })).error).toBe("active_upload");
  await uploads.cancelUpload(data.uploadId, data.revisionVersion);
});
test("expiry detaches abandoned import while retaining previous snapshot", async () => {
  const initial = await db.chapterRevision.findUniqueOrThrow({ where: { id: revision } });
  const begun = await start(); const data = begun.data as { uploadId: string; revisionVersion: number };
  await db.chapterUpload.update({ where: { id: data.uploadId }, data: { expiresAt: new Date(Date.now() - 1) } });
  const status = await uploads.uploadStatus(data.uploadId);
  expect((status.data as { status: { state: string } }).status.state).toBe("cancelled");
  const current = await db.chapterRevision.findUniqueOrThrow({ where: { id: revision } });
  expect(current.pendingUploadId).toBeNull(); expect(current.pagesJson).toEqual(initial.pagesJson);
});

test("live membership authorizes superseded upload pages while sources and history stay private", async () => {
  const gateway = await import("../../src/app/api/media/[assetId]/route");
  const page = await db.mediaAsset.findFirstOrThrow({ where: { chapterId: chapter, pageIndex: 0, readyAt: { not: null } } });
  const source = await db.mediaAsset.findFirstOrThrow({ where: { uploadId: page.uploadId, pageIndex: -1 } });
  await db.chapterUpload.update({ where: { id: page.uploadId }, data: { state: "superseded" } });
  await db.chapter.update({ where: { id: chapter }, data: { workflow: "published", publishedAt: new Date(), scheduledFor: null } });
  await db.chapterPage.create({ data: { chapterId: chapter, pageIndex: 0, imagePath: `/api/media/${page.id}`, width: page.width!, height: page.height! } });
  setActor(null);
  try {
    const response = await gateway.GET(new Request(`http://localhost/api/media/${page.id}`), { params: Promise.resolve({ assetId: page.id }) });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.invalid/private");
    expect((await gateway.GET(new Request(`http://localhost/api/media/${source.id}`), { params: Promise.resolve({ assetId: source.id }) })).status).toBe(403);
    await db.chapter.update({ where: { id: chapter }, data: { isPremiumDemo: true } });
    expect((await gateway.GET(new Request(`http://localhost/api/media/${page.id}`), { params: Promise.resolve({ assetId: page.id }) })).status).toBe(403);
    setActor(actor);
    expect((await gateway.GET(new Request(`http://localhost/api/media/${page.id}`), { params: Promise.resolve({ assetId: page.id }) })).status).toBe(307);
    setActor(null);
    await db.chapter.update({ where: { id: chapter }, data: { isPremiumDemo: false } });
    await db.chapter.update({ where: { id: chapter }, data: { scheduledFor: new Date(Date.now() + 3600000) } });
    expect((await gateway.GET(new Request(`http://localhost/api/media/${page.id}`), { params: Promise.resolve({ assetId: page.id }) })).status).toBe(403);
    await db.chapter.update({ where: { id: chapter }, data: { scheduledFor: null } });
    await db.chapterPage.deleteMany({ where: { chapterId: chapter } });
    expect((await gateway.GET(new Request(`http://localhost/api/media/${page.id}`), { params: Promise.resolve({ assetId: page.id }) })).status).toBe(403);
  } finally { setActor(actor); }
});


test("imported pages remain immutable through generic snapshot actions", async () => {
  const page = await db.mediaAsset.findFirstOrThrow({ where: { chapterId: chapter, pageIndex: 0, readyAt: { not: null } } });
  const pages = [{ pageIndex: 0, imagePath: "/api/media/" + page.id, width: page.width!, height: page.height! }];
  const r = await db.chapterRevision.update({ where: { id: revision }, data: { pagesJson: pages, status: "draft", pendingUploadId: null } });
  expect((await editorial.updateDraftSnapshot({ revisionId: revision, expectedVersion: r.version, pages: [] })).ok).toBe(false);
  expect((await db.chapterRevision.findUniqueOrThrow({ where: { id: revision } })).pagesJson).toEqual(pages);
  expect((await editorial.updateDraftSnapshot({ revisionId: revision, expectedVersion: r.version, titleAr: "عنوان جديد" })).ok).toBe(true);
});

test("disabling new uploads preserves current published media access", async () => {
  const page = await db.mediaAsset.findFirstOrThrow({ where: { chapterId: chapter, pageIndex: 0, readyAt: { not: null } } });
  await db.chapter.update({ where: { id: chapter }, data: { workflow: "published", scheduledFor: null, isPremiumDemo: false } });
  await db.chapterPage.create({ data: { chapterId: chapter, pageIndex: 0, imagePath: "/api/media/" + page.id, width: page.width!, height: page.height! } });
  const gateway = await import("../../src/app/api/media/[assetId]/route");
  process.env.MEDIA_UPLOADS_ENABLED = "0";setActor(null);
  try { expect((await gateway.GET(new Request("http://localhost/api/media/" + page.id), { params: Promise.resolve({ assetId: page.id }) })).status).toBe(307); }
  finally { process.env.MEDIA_UPLOADS_ENABLED = "1";setActor(actor);await db.chapterPage.deleteMany({where:{chapterId:chapter}}); }
});

test("withdrawal cancels an in-flight replacement and frees the creator slot", async () => {
  await db.profile.update({ where: { id: actor }, data: { role: "admin" } });
  const published = await db.chapterRevision.update({ where: { id: revision }, data: { status: "published", pendingUploadId: null } });
  const next = (await editorial.openOrCreateDraft(chapter)).revision!;
  const begun = await uploads.startUpload({ revisionId: next.id, expectedVersion: next.version, sourceName: "replace.pdf", sourceBytes: 8, pageCount: 1 });
  expect(begun.ok).toBe(true);
  const data = begun.data as { uploadId: string };
  expect((await editorial.withdrawPublishedChapter({ chapterId: chapter, expectedRevisionId: published.id, expectedVersion: published.version, reason: "سحب للاختبار" })).ok).toBe(true);
  expect((await db.chapterUpload.findUniqueOrThrow({ where: { id: data.uploadId } })).state).toBe("cancelled");
  expect((await db.chapterRevision.findUniqueOrThrow({ where: { id: next.id } })).pendingUploadId).toBeNull();
  expect(await db.chapterUpload.count({where:{createdById:actor,state:{in:["uploading","failed"]}}})).toBe(0);
  await db.profile.update({ where: { id: actor }, data: { role: "contributor" } });
});
