import { beforeAll, afterAll, test, expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { db, actions, withActor } from "./session-fixture";
import * as queries from "../../src/lib/queries";

const suffix = randomUUID();
let staffId: string;
let adminId: string;
let novelId: string;
let otherId: string;
beforeAll(async () => {
  adminId = (await db.profile.findUniqueOrThrow({ where: { email: "admin@bunny.demo" } })).id;
  staffId = (await db.profile.create({ data: { email: `edge-${suffix}@bunny.test`, nickname: "مساهم حدود الصلاحيات", passwordHash: "test-only", role: "contributor", emailVerifiedAt: new Date() } })).id;
  const data = { titleAr: "عمل تحقق الصلاحيات", synopsisAr: "ملخص اختبار مستقل لحدود الصلاحيات والإسناد", author: "مؤلف اختبار", coverPath: "/art/covers/warden-of-the-twilight-gate.webp" };
  novelId = (await db.series.create({ data: { ...data, slug: `edge-novel-${suffix}`, format: "novel" } })).id;
  otherId = (await db.series.create({ data: { ...data, slug: `edge-other-${suffix}`, format: "manga" } })).id;
  await db.seriesAssignment.create({ data: { profileId: staffId, seriesId: novelId } });
});
afterAll(async () => {
  await db.series.deleteMany({ where: { id: { in: [novelId, otherId].filter(Boolean) } } });
  if (staffId) await db.profile.deleteMany({ where: { id: staffId } });
});

function chapterInput(number: number) {
  return { seriesId: novelId, number, titleAr: "فصل تحقق مستقل", workflow: "draft", isPremiumDemo: false, readingDirection: "rtl", pageCount: 1, novelBody: "نص اختبار" };
}

test("scheduled chapters and publication metadata reject assigned staff without mutation", async () => {
  const scheduled = await db.chapter.create({ data: { seriesId: novelId, number: 801, titleAr: "مسودة مجدولة", workflow: "review", scheduledFor: new Date(Date.now() + 86400000) } });
  const draft = await db.chapter.create({ data: { seriesId: novelId, number: 802, titleAr: "مسودة محمية", workflow: "draft" } });
  for (const input of [{ id: scheduled.id, titleAr: "عنوان غير مسموح" }, { id: draft.id, isPremiumDemo: false }, { id: draft.id, scheduledFor: null }]) {
    expect(await withActor(staffId, () => actions.updateChapterMeta(input))).toEqual({ ok: false, error: "forbidden" });
  }
  expect(await db.chapter.findUnique({ where: { id: scheduled.id } })).toEqual(scheduled);
  expect(await db.chapter.findUnique({ where: { id: draft.id } })).toEqual(draft);
});

test("privileged queries scope assignments and format, and guest cannot obtain draft data", async () => {
  const own = await withActor(staffId, () => queries.getAdminSeries({}));
  expect(own.map(row => row.id)).toEqual([novelId]);
  expect(await withActor(staffId, () => queries.getAdminSeriesById(otherId))).toBeNull();
  const detail = await withActor(staffId, () => queries.getAdminSeriesById(novelId));
  expect(detail?.id).toBe(novelId);
  expect(detail).not.toHaveProperty("assignments");
  expect(await withActor(staffId, () => queries.getAdminChapters({ format: "manga" }))).toEqual([]);
  const novels = await withActor(staffId, () => queries.getAdminChapters({ format: "novel" }));
  expect(novels.length).toBeGreaterThan(0);
  expect(novels.every(row => row.seriesId === novelId)).toBe(true);
  expect((await withActor(staffId, () => queries.getStudioOverview())).map(row => row.seriesId)).toEqual([novelId]);
  expect(await withActor(null, () => queries.getAdminSeries({}))).toEqual([]);
  expect(await withActor(null, () => queries.getAdminSeriesById(novelId))).toBeNull();
  expect(await withActor(null, () => actions.createChapter(chapterInput(803)))).toEqual({ ok: false, error: "forbidden" });
});

test("concurrent duplicate creates return one successful action and one clean failure", async () => {
  const results = await Promise.all([1, 2].map(() => withActor(staffId, () => actions.createChapter(chapterInput(804)))));
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(results.filter(result => !result.ok)).toHaveLength(1);
  expect(await db.chapter.count({ where: { seriesId: novelId, number: 804 } })).toBe(1);
});

test("revoked assignment denies the next real write with the same session identity", async () => {
  const chapter = await db.chapter.findFirstOrThrow({ where: { seriesId: novelId, number: 802, deletedAt: null } });
  expect(await withActor(adminId, () => actions.setSeriesAssignment({ profileId: staffId, seriesId: novelId, assigned: false }))).toEqual({ ok: true });
  try {
    expect(await withActor(staffId, () => actions.updateChapterMeta({ id: chapter.id, titleAr: "تعديل بعد سحب الإسناد" }))).toEqual({ ok: false, error: "forbidden" });
    expect(await withActor(staffId, () => actions.createChapter(chapterInput(806)))).toEqual({ ok: false, error: "forbidden" });
    expect(await db.chapter.findUnique({ where: { id: chapter.id } })).toEqual(chapter);
    expect(await db.chapter.count({ where: { seriesId: novelId, number: 806 } })).toBe(0);
  } finally {
    expect(await withActor(adminId, () => actions.setSeriesAssignment({ profileId: staffId, seriesId: novelId, assigned: true }))).toEqual({ ok: true });
  }
});
test("concurrent grant and reader demotion leave no assignment and next request loses access", async () => {
  await db.seriesAssignment.deleteMany({ where: { profileId: staffId } });
  const [grant, demote] = await Promise.all([
    withActor(adminId, () => actions.setSeriesAssignment({ seriesId: novelId, profileId: staffId, assigned: true })),
    withActor(adminId, () => actions.setUserRole(staffId, "reader")),
  ]);
  expect(demote.ok).toBe(true);
  expect(grant.ok || ["invalid_target", "conflict"].includes(grant.error ?? "")).toBe(true);
  expect((await db.profile.findUniqueOrThrow({ where: { id: staffId } })).role).toBe("reader");
  expect(await db.seriesAssignment.count({ where: { profileId: staffId } })).toBe(0);
  expect(await withActor(staffId, () => queries.getAdminSeries({}))).toEqual([]);
  expect(await withActor(staffId, () => queries.getStudioOverview())).toEqual([]);
  expect(await withActor(staffId, () => actions.createChapter(chapterInput(805)))).toEqual({ ok: false, error: "forbidden" });
});
