import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, setActor } from "./session-fixture";
import { approveRevision, getWorkingRevision, returnForChanges, submitForReview, updateDraftSnapshot, withdrawFromReview } from "../../src/lib/editorial";
import type { UserRole } from "@prisma/client";

const p: Record<string, string> = {};
let seriesId: string, number = 0;
const body = "محتوى فصل صالح للمراجعة والتجربة";
beforeAll(async () => {
  const stamp = Date.now();
  seriesId = (await db.series.create({ data: { slug: `contributor-flow-${stamp}`, titleAr: "عمل خاص بالمساهمين", synopsisAr: "عمل لاختبار مسار المساهم", format: "novel", author: "اختبار", coverPath: "/art/covers/warden-of-the-twilight-gate.webp" } })).id;
  const people: [string, UserRole, boolean][] = [["admin", "admin", false], ["editor", "editor", true], ["otherEditor", "editor", true], ["contributor", "contributor", true], ["otherContributor", "contributor", true]];
  for (const [name, role, assigned] of people) {
    p[name] = (await db.profile.create({ data: { email: `flow-${name}-${stamp}@bunny.test`, nickname: name, passwordHash: "x", role, emailVerifiedAt: new Date() } })).id;
    if (assigned) await db.seriesAssignment.create({ data: { profileId: p[name], seriesId } });
  }
});
afterAll(async () => {
  setActor(null);
  const chapters = await db.chapter.findMany({ where: { seriesId }, select: { id: true } });
  await db.notification.deleteMany({ where: { href: { in: chapters.map((c) => `/studio/chapters/${c.id}`) } } });
  await db.chapter.deleteMany({ where: { seriesId } });
  await db.series.delete({ where: { id: seriesId } });
  await db.profile.deleteMany({ where: { id: { in: Object.values(p) } } });
});
async function chapterWith(status: "draft" | "review" | "published") {
  const chapter = await db.chapter.create({ data: { seriesId, number: ++number, titleAr: "عنوان خاص", novelBody: body, workflow: status === "published" ? "published" : "draft", publishedAt: status === "published" ? new Date() : null } });
  const revision = await db.chapterRevision.create({ data: { chapterId: chapter.id, revisionNumber: 1, titleAr: "عنوان خاص", novelBody: body, status } });
  return { chapter, revision };
}
const notes = async (chapterId: string) => db.notification.findMany({ where: { href: `/studio/chapters/${chapterId}` } });

test("opening a published chapter in the studio does not fork a draft", async () => {
  const { chapter, revision } = await chapterWith("published");
  setActor(p.contributor);
  const opened = await getWorkingRevision(chapter.id);
  expect(opened).toMatchObject({ ok: true, readOnly: true });
  expect(opened.revision?.id).toBe(revision.id);
  await getWorkingRevision(chapter.id);
  expect(await db.chapterRevision.count({ where: { chapterId: chapter.id } })).toBe(1);
  setActor(null);
  expect((await getWorkingRevision(chapter.id)).ok).toBe(false);
});

test("saving a revision in review needs confirmation and tells reviewers they can stop", async () => {
  const { chapter, revision } = await chapterWith("review");
  setActor(p.contributor);
  const input = { revisionId: revision.id, expectedVersion: revision.version, novelBody: body + " مع تعديل" };
  expect(await updateDraftSnapshot(input)).toEqual({ ok: false, error: "leaves_review" });
  const saved = await updateDraftSnapshot({ ...input, confirmLeaveReview: true });
  expect(saved.ok).toBe(true);
  expect(saved.revision?.status).toBe("draft");
  const rows = await notes(chapter.id);
  expect(rows.some((r) => r.profileId === p.contributor)).toBe(false);
  expect(rows.some((r) => r.profileId === p.editor)).toBe(true);
  expect(rows.some((r) => r.profileId === p.otherContributor)).toBe(false);
  expect(await db.chapterEditorialEvent.count({ where: { revisionId: revision.id, action: "edit_left_review" } })).toBe(1);
});

test("withdraw from review without editing", async () => {
  const { revision } = await chapterWith("review");
  setActor(p.contributor);
  const result = await withdrawFromReview({ revisionId: revision.id, expectedVersion: revision.version });
  expect(result.ok).toBe(true);
  expect(result.revision?.status).toBe("draft");
  expect((await withdrawFromReview({ revisionId: revision.id, expectedVersion: result.revision!.version })).ok).toBe(false);
  expect(await db.chapterEditorialEvent.count({ where: { revisionId: revision.id, action: "withdraw_from_review" } })).toBe(1);
});

test("return and approval reach the person who submitted, without naming the work", async () => {
  const { chapter, revision } = await chapterWith("draft");
  setActor(p.contributor);
  const submitted = await submitForReview({ revisionId: revision.id, expectedVersion: revision.version });
  expect(submitted.ok).toBe(true);
  await db.notification.deleteMany({ where: { href: `/studio/chapters/${chapter.id}` } });
  setActor(p.editor);
  const returned = await returnForChanges({ revisionId: revision.id, expectedVersion: submitted.revision!.version, reason: "صحّح الأسماء" });
  expect(returned.ok).toBe(true);
  let rows = await notes(chapter.id);
  expect(rows.map((r) => r.profileId).sort()).toEqual([p.contributor, p.otherEditor].sort());
  expect(rows.every((r) => !`${r.titleAr} ${r.bodyAr}`.includes("عمل خاص بالمساهمين") && !`${r.titleAr} ${r.bodyAr}`.includes("عنوان خاص"))).toBe(true);

  setActor(p.contributor);
  const resubmitted = await submitForReview({ revisionId: revision.id, expectedVersion: returned.revision!.version });
  expect(resubmitted.ok).toBe(true);
  await db.notification.deleteMany({ where: { href: `/studio/chapters/${chapter.id}` } });
  setActor(p.admin);
  expect((await approveRevision({ revisionId: revision.id, expectedVersion: resubmitted.revision!.version })).ok).toBe(true);
  rows = await notes(chapter.id);
  expect(rows.map((r) => r.profileId)).toEqual([p.contributor]);
  expect(rows[0].titleAr).toStartWith("تم اعتماد فصل");
});
