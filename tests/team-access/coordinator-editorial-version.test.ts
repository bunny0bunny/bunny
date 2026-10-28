import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, setActor, withActor } from "./session-fixture";
import { openOrCreateDraft, updateDraftSnapshot, submitForReview, approveRevision, publishRevisionNow, scheduleRevision, executeDuePublications, withdrawPublishedChapter } from "../../src/lib/editorial";

let adminId: string;
let contributorId: string;
let readerId: string;
let seriesId: string;
let number = 0;

beforeAll(async () => {
  adminId = (await db.profile.findUniqueOrThrow({ where: { email: "admin@bunny.demo" } })).id;
  readerId = (await db.profile.findUniqueOrThrow({ where: { email: "reader@bunny.demo" } })).id;
  contributorId = (await db.profile.create({ data: { email: "coordinator-version@bunny.test", nickname: "مساهم", role: "contributor", passwordHash: "test", emailVerifiedAt: new Date() } })).id;
  seriesId = (await db.series.create({ data: { slug: "coordinator-editorial-version", titleAr: "اختبار النسخ", synopsisAr: "معزول", format: "novel", author: "اختبار", coverPath: "" } })).id;
  await db.seriesAssignment.create({ data: { profileId: contributorId, seriesId } });
  await db.libraryItem.create({ data: { profileId: readerId, seriesId, shelf: "reading" } });
});

afterAll(async () => {
  setActor(null);
  if (seriesId) await db.series.delete({ where: { id: seriesId } });
  if (contributorId) await db.profile.delete({ where: { id: contributorId } });
});

async function chapter() {
  return db.chapter.create({ data: { seriesId, number: ++number, titleAr: "النص المتاح", novelBody: "المحتوى السابق.", workflow: "published", publishedAt: new Date() } });
}

test("concurrent first opens and published forks converge on one working draft", async () => {
  for (const published of [false, true]) {
    const current = published ? await chapter() : await db.chapter.create({ data: { seriesId, number: ++number, titleAr: "فصل جديد" } });
    const opened = await Promise.all(Array.from({ length: 4 }, () => withActor(adminId, () => openOrCreateDraft(current.id))));
    expect(opened.every(result => result.ok)).toBe(true);
    expect(new Set(opened.map(result => result.revision!.id)).size).toBe(1);
    expect(await db.chapterRevision.count({ where: { chapterId: current.id, status: "draft" } })).toBe(1);
    expect(await db.chapterRevision.count({ where: { chapterId: current.id } })).toBe(published ? 2 : 1);
  }
});

test("simultaneous form saves accept one version and reject the stale competing write", async () => {
  const current = await chapter();
  const opened = await withActor(contributorId, () => openOrCreateDraft(current.id));
  expect(opened.ok).toBe(true);
  const revision = opened.revision!;
  const results = await Promise.all(["المسودة الأولى", "المسودة الثانية"].map(titleAr => withActor(contributorId, () => updateDraftSnapshot({ revisionId: revision.id, expectedVersion: revision.version, titleAr }))));
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(results.filter(result => !result.ok && result.error === "conflict")).toHaveLength(1);
  expect((await db.chapter.findUniqueOrThrow({ where: { id: current.id } })).titleAr).toBe("النص المتاح");
});

test("revoked assignment prevents saving an already opened draft", async () => {
  const current = await chapter();
  const opened = await withActor(contributorId, () => openOrCreateDraft(current.id));
  expect(opened.ok).toBe(true);
  await db.seriesAssignment.deleteMany({ where: { profileId: contributorId, seriesId } });
  try {
    const result = await withActor(contributorId, () => updateDraftSnapshot({ revisionId: opened.revision!.id, expectedVersion: opened.revision!.version, titleAr: "تعديل بعد سحب الإسناد" }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("forbidden");
  } finally {
    await db.seriesAssignment.create({ data: { profileId: contributorId, seriesId } });
  }
});

test("publication replaces exactly approved text once and preserves progress identity", async () => {
  const current = await chapter();
  await db.readingProgress.create({ data: { profileId: readerId, seriesId, chapterId: current.id, percent: 35, pageIndex: 0 } });
  const before = await db.notification.count({ where: { profileId: readerId } });
  setActor(adminId);
  const opened = await openOrCreateDraft(current.id);
  const saved = await updateDraftSnapshot({ revisionId: opened.revision!.id, expectedVersion: opened.revision!.version, titleAr: "النسخة المعتمدة", novelBody: "النص الجديد الذي اعتمده الأدمن." });
  expect(saved.ok).toBe(true);
  const submitted = await submitForReview({ revisionId: saved.revision!.id, expectedVersion: saved.revision!.version });
  expect(submitted.ok).toBe(true);
  const approved = await approveRevision({ revisionId: submitted.revision!.id, expectedVersion: submitted.revision!.version });
  expect(approved.ok).toBe(true);
  const input = { revisionId: approved.revision!.id, expectedVersion: approved.revision!.version };
  const published = await publishRevisionNow(input);
  expect(published.ok).toBe(true);
  expect((await publishRevisionNow(input)).ok).toBe(false);
  const projection = await db.chapter.findUniqueOrThrow({ where: { id: current.id } });
  expect(projection.titleAr).toBe("النسخة المعتمدة");
  expect(projection.novelBody).toBe("النص الجديد الذي اعتمده الأدمن.");
  expect(await db.readingProgress.count({ where: { chapterId: current.id, profileId: readerId, percent: 35 } })).toBe(1);
  // These fixtures were already public. A correction/replacement must not announce a new release.
  expect(await db.notification.count({ where: { profileId: readerId } })).toBe(before);
  expect((await db.chapterPublication.findUniqueOrThrow({where:{chapterId:current.id}})).state).toBe('baseline');
  expect((await approveRevision({ revisionId: published.revision!.id, expectedVersion: published.revision!.version })).ok).toBe(false);
  const next = await openOrCreateDraft(current.id);
  const pending = await updateDraftSnapshot({ revisionId: next.revision!.id, expectedVersion: next.revision!.version, novelBody: "مسودة لاحقة لا يجوز عرضها." });
  expect(pending.ok).toBe(true);
  expect((await db.chapter.findUniqueOrThrow({ where: { id: current.id } })).novelBody).toBe("النص الجديد الذي اعتمده الأدمن.");
});

test("editing a submitted revision requires resubmission before review continues", async () => {
  const current = await chapter();
  setActor(contributorId);
  const opened = await openOrCreateDraft(current.id);
  const submitted = await submitForReview({ revisionId: opened.revision!.id, expectedVersion: opened.revision!.version });
  expect(submitted.ok).toBe(true);
  const edited = await updateDraftSnapshot({ revisionId: submitted.revision!.id, expectedVersion: submitted.revision!.version, novelBody: "محتوى تغير أثناء المراجعة." });
  expect(edited.ok).toBe(true);
  expect(edited.revision!.status).toBe("draft");
});

test("a scheduled replacement keeps old content until due and publishes once under competing ticks", async () => {
  const current = await chapter();
  setActor(adminId);
  const opened = await openOrCreateDraft(current.id);
  const saved = await updateDraftSnapshot({ revisionId: opened.revision!.id, expectedVersion: opened.revision!.version, novelBody: "النسخة التي تنتظر موعدها." });
  expect(saved.ok).toBe(true);
  const submitted = await submitForReview({ revisionId: saved.revision!.id, expectedVersion: saved.revision!.version });
  expect(submitted.ok).toBe(true);
  const approved = await approveRevision({ revisionId: submitted.revision!.id, expectedVersion: submitted.revision!.version });
  expect(approved.ok).toBe(true);
  const scheduled = await scheduleRevision({ revisionId: approved.revision!.id, expectedVersion: approved.revision!.version, scheduledFor: new Date(Date.now() + 86400000) });
  expect(scheduled.ok).toBe(true);
  expect((await executeDuePublications()).publishedCount).toBe(0);
  expect((await db.chapter.findUniqueOrThrow({ where: { id: current.id } })).novelBody).toBe("المحتوى السابق.");
  await db.chapterRevision.update({ where: { id: scheduled.revision!.id }, data: { scheduledFor: new Date(Date.now() - 1000) } });
  const before = await db.notification.count({ where: { profileId: readerId } });
  const results = await Promise.all([1, 2].map(() => withActor(adminId, () => executeDuePublications())));
  expect(results.reduce((sum, result) => sum + result.publishedCount, 0)).toBe(1);
  expect((await db.chapter.findUniqueOrThrow({ where: { id: current.id } })).novelBody).toBe("النسخة التي تنتظر موعدها.");
  // These fixtures were already public. A correction/replacement must not announce a new release.
  expect(await db.notification.count({ where: { profileId: readerId } })).toBe(before);
  expect((await db.chapterPublication.findUniqueOrThrow({where:{chapterId:current.id}})).state).toBe('baseline');
  expect((await executeDuePublications()).publishedCount).toBe(0);
});

test("crafted page paths cannot introduce files outside a chapter's existing assets", async () => {
  const current = await chapter();
  setActor(contributorId);
  const opened = await openOrCreateDraft(current.id);
  const result = await updateDraftSnapshot({ revisionId: opened.revision!.id, expectedVersion: opened.revision!.version, pages: [{ imagePath: "/art/pages/another-work/c1/p01.webp", width: 800, height: 1200 }] });
  expect(result.ok).toBe(false);
  expect((await db.chapterRevision.findUniqueOrThrow({ where: { id: opened.revision!.id } })).pagesJson).toEqual([]);
});

test("a stale withdrawal form cannot hide a different current version", async () => {
  const current = await chapter();
  setActor(adminId);
  await openOrCreateDraft(current.id);
  const active = await db.chapterRevision.findFirstOrThrow({ where: { chapterId: current.id, status: "published" } });
  const stale = await withdrawPublishedChapter({ chapterId: current.id, expectedRevisionId: active.id, expectedVersion: active.version + 1, reason: "سبب للسحب" });
  expect(stale.ok).toBe(false);
  expect(stale.error).toBe("conflict");
  expect((await db.chapter.findUniqueOrThrow({ where: { id: current.id } })).workflow).toBe("published");
});

test("reader identity cannot dispatch due publications", async () => {
  const result = await withActor(readerId, () => executeDuePublications());
  expect(result.publishedCount).toBe(0);
  expect(result.errors).toContain("forbidden");
});
