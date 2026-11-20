import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, actions, setActor } from "./session-fixture";
const { getContinueReading } = await import("../../src/lib/queries");

let reader: string, other: string, seriesId: string, secondId: string, slug: string, secondSlug: string;
const chapters: Record<string, string> = {};
beforeAll(async () => {
  const stamp = Date.now();
  reader = (await db.profile.create({ data: { email: `continuity-${stamp}@bunny.test`, nickname: "قارئ المتابعة", passwordHash: "x", emailVerifiedAt: new Date() } })).id;
  other = (await db.profile.create({ data: { email: `continuity-other-${stamp}@bunny.test`, nickname: "قارئ آخر", passwordHash: "x", emailVerifiedAt: new Date() } })).id;
  slug = `continuity-${stamp}`; secondSlug = `continuity-b-${stamp}`;
  const base = { synopsisAr: "عمل لاختبار متابعة القراءة", format: "manga", author: "اختبار", coverPath: "/art/covers/warden-of-the-twilight-gate.webp" };
  seriesId = (await db.series.create({ data: { ...base, slug, titleAr: "عمل المتابعة" } })).id;
  secondId = (await db.series.create({ data: { ...base, slug: secondSlug, titleAr: "عمل ثانٍ" } })).id;
  for (const number of [1, 1.5, 2]) chapters[`a${number}`] = (await db.chapter.create({ data: { seriesId, number, titleAr: "", workflow: "published", publishedAt: new Date() } })).id;
  chapters.draft = (await db.chapter.create({ data: { seriesId, number: 3, titleAr: "", workflow: "draft" } })).id;
  for (const number of [1, 2]) chapters[`b${number}`] = (await db.chapter.create({ data: { seriesId: secondId, number, titleAr: "", workflow: "published", publishedAt: new Date() } })).id;
});
afterAll(async () => {
  setActor(null);
  await db.readingProgress.deleteMany({ where: { profileId: { in: [reader, other] } } });
  await db.chapter.deleteMany({ where: { seriesId: { in: [seriesId, secondId] } } });
  await db.series.deleteMany({ where: { id: { in: [seriesId, secondId] } } });
  await db.profile.deleteMany({ where: { id: { in: [reader, other] } } });
});

test("a finished chapter makes 'continue' point at the next readable one (decimal numbers)", async () => {
  await db.readingProgress.create({ data: { profileId: reader, seriesId, chapterId: chapters.a1, percent: 100, completed: true } });
  const [item] = await getContinueReading(reader);
  expect(item).toMatchObject({ seriesSlug: slug, chapterNumber: 1.5, percent: 0, nextChapter: true });
});

test("several open chapters of one work do not crowd out other works", async () => {
  await db.readingProgress.create({ data: { profileId: reader, seriesId, chapterId: chapters["a1.5"], percent: 40 } });
  await db.readingProgress.create({ data: { profileId: reader, seriesId, chapterId: chapters.a2, percent: 20 } });
  await db.readingProgress.create({ data: { profileId: reader, seriesId: secondId, chapterId: chapters.b1, percent: 10 } });
  await db.readingProgress.update({ where: { profileId_chapterId: { profileId: reader, chapterId: chapters.a2 } }, data: { percent: 25 } });
  const items = await getContinueReading(reader);
  expect(items.map((i) => i.seriesSlug).sort()).toEqual([slug, secondSlug].sort());
  expect(items.find((i) => i.seriesSlug === slug)?.chapterNumber).toBe(2);
});

test("the last published chapter finished means nothing to continue; drafts never count", async () => {
  await db.readingProgress.update({ where: { profileId_chapterId: { profileId: reader, chapterId: chapters.a2 } }, data: { percent: 100, completed: true } });
  const items = await getContinueReading(reader);
  expect(items.some((i) => i.seriesSlug === slug)).toBe(false);
});

test("guest progress merge: newer wins, finished stays finished, invalid targets ignored, idempotent", async () => {
  setActor(other);
  await db.readingProgress.create({ data: { profileId: other, seriesId, chapterId: chapters.a1, percent: 100, completed: true } });
  const now = Date.now();
  const entries = [
    { seriesSlug: slug, chapterNumber: 1, pageIndex: 2, percent: 30, completed: false, updatedAt: now + 60_000 }, // newer but must not un-finish
    { seriesSlug: slug, chapterNumber: 2, pageIndex: 5, percent: 55, updatedAt: now },
    { seriesSlug: slug, chapterNumber: 3, pageIndex: 1, percent: 10, updatedAt: now }, // draft chapter
    { seriesSlug: "no-such-work", chapterNumber: 1, pageIndex: 1, percent: 10, updatedAt: now },
    { seriesSlug: secondSlug, chapterNumber: 1, pageIndex: 1, percent: 10, updatedAt: 1000 },
  ];
  const first = await actions.mergeGuestProgress(entries);
  expect(first).toMatchObject({ ok: true, merged: 3 });
  const a1 = await db.readingProgress.findUniqueOrThrow({ where: { profileId_chapterId: { profileId: other, chapterId: chapters.a1 } } });
  expect(a1.completed).toBe(true);
  expect((await db.readingProgress.findUniqueOrThrow({ where: { profileId_chapterId: { profileId: other, chapterId: chapters.a2 } } })).percent).toBe(55);
  expect(await db.readingProgress.count({ where: { profileId: other, chapterId: chapters.draft } })).toBe(0);
  // Server row now newer than every entry except the future-dated one, which is clamped to now.
  await db.readingProgress.update({ where: { profileId_chapterId: { profileId: other, chapterId: chapters.a2 } }, data: { percent: 70 } });
  const second = await actions.mergeGuestProgress(entries);
  expect(second.merged).toBe(0);
  expect((await db.readingProgress.findUniqueOrThrow({ where: { profileId_chapterId: { profileId: other, chapterId: chapters.a2 } } })).percent).toBe(70);
  setActor(null);
  expect((await actions.mergeGuestProgress(entries)).ok).toBe(false);
});
