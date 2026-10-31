import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, setActor, withActor } from "./session-fixture";
import { approveRevision, recommendApproval, returnForChanges, submitForReview, updateDraftSnapshot } from "../../src/lib/editorial";
import type { UserRole } from "@prisma/client";

const profiles: Record<string, string> = {};
let seriesId: string;
let chapterNumber = 0;
const privateTitle = "عنوان مسودة سري";
const privateReason = "سبب سري لا يعرض في الإشعارات";

beforeAll(async () => {
  const series = await db.series.create({ data: {
    slug: "editorial-notifications-private", titleAr: "اسم عمل سري", synopsisAr: "وصف العمل الخاص للاختبار",
    format: "novel", author: "مؤلف", coverPath: "/art/covers/warden-of-the-twilight-gate.webp",
  } });
  seriesId = series.id;
  const fixtures: [string, UserRole, boolean, boolean, boolean][] = [
    ["admin", "admin", true, false, false], ["editor", "editor", true, false, true],
    ["contributor", "contributor", true, false, true], ["otherContributor", "contributor", true, false, true],
    ["otherEditor", "editor", true, false, true], ["reader", "reader", true, false, true],
    ["unassignedEditor", "editor", true, false, false], ["unassignedContributor", "contributor", true, false, false],
    ["disabledEditor", "editor", true, true, true], ["unverifiedEditor", "editor", false, false, true],
    ["disabledContributor", "contributor", true, true, true], ["unverifiedContributor", "contributor", false, false, true],
    ["disabledAdmin", "admin", true, true, false], ["unverifiedAdmin", "admin", false, false, false],
  ];
  for (const [name, role, verified, disabled, assigned] of fixtures) {
    const profile = await db.profile.create({ data: {
      email: `workflow-notification-${name}@bunny.test`, nickname: name, passwordHash: "x", role,
      emailVerifiedAt: verified ? new Date() : null, disabledAt: disabled ? new Date() : null,
    } });
    profiles[name] = profile.id;
    if (assigned) await db.seriesAssignment.create({ data: { profileId: profile.id, seriesId } });
  }
});

afterAll(async () => {
  setActor(null);
  const chapters = await db.chapter.findMany({ where: { seriesId }, select: { id: true } });
  await db.notification.deleteMany({ where: { href: { in: chapters.map(chapter => `/studio/chapters/${chapter.id}`) } } });
  await db.chapter.deleteMany({ where: { seriesId } });
  await db.series.delete({ where: { id: seriesId } });
  await db.profile.deleteMany({ where: { id: { in: Object.values(profiles) } } });
});

async function draft(status: "draft" | "review" = "draft", novelBody = "محتوى خاص صالح للمراجعة") {
  const chapter = await db.chapter.create({ data: { seriesId, number: ++chapterNumber, titleAr: privateTitle } });
  return db.chapterRevision.create({ data: { chapterId: chapter.id, revisionNumber: 1, titleAr: privateTitle, novelBody, status } });
}

async function notifications(chapterId: string) {
  const rows = await db.notification.findMany({ where: { href: `/studio/chapters/${chapterId}` } });
  for (const row of rows) {
    expect(row.titleAr).toMatch(/[\u0600-\u06ff]/);
    expect(row.bodyAr).toMatch(/[\u0600-\u06ff]/);
    expect(`${row.titleAr} ${row.bodyAr}`).not.toContain(privateTitle);
    expect(`${row.titleAr} ${row.bodyAr}`).not.toContain("اسم عمل سري");
    expect(`${row.titleAr} ${row.bodyAr}`).not.toContain(privateReason);
  }
  return rows;
}

async function admins() {
  return (await db.profile.findMany({ where: { role: "admin", disabledAt: null, emailVerifiedAt: { not: null } }, select: { id: true } })).map(row => row.id);
}

test("submit notifies verified enabled admins and assigned editors, excluding actor and other accounts", async () => {
  const revision = await draft();
  setActor(profiles.editor);
  const input = { revisionId: revision.id, expectedVersion: revision.version };
  expect((await submitForReview(input)).ok).toBe(true);
  const rows = await notifications(revision.chapterId);
  expect(rows.map(row => row.profileId).sort()).toEqual([...(await admins()), profiles.otherEditor].sort());
  expect(rows.every(row => row.type === "system" && row.readAt === null && row.publicationId === null)).toBe(true);
  expect(await submitForReview(input)).toEqual({ ok: false, error: "conflict" });
  expect(await notifications(revision.chapterId)).toHaveLength(rows.length);
});

test("recommend notifies only active verified admins and excludes the administrator actor", async () => {
  const revision = await draft("review");
  setActor(profiles.admin);
  const input = { revisionId: revision.id, expectedVersion: revision.version, note: privateReason };
  expect((await recommendApproval(input)).ok).toBe(true);
  const rows = await notifications(revision.chapterId);
  expect(rows.map(row => row.profileId).sort()).toEqual((await admins()).filter(id => id !== profiles.admin).sort());
  expect(await recommendApproval(input)).toEqual({ ok: false, error: "conflict" });
  expect(await notifications(revision.chapterId)).toHaveLength(rows.length);
});

test("return notifies assigned active contributors and editors, excluding actor, with generic private previews", async () => {
  const revision = await draft("review");
  setActor(profiles.editor);
  const input = { revisionId: revision.id, expectedVersion: revision.version, reason: privateReason };
  expect((await returnForChanges(input)).ok).toBe(true);
  const rows = await notifications(revision.chapterId);
  expect(rows.map(row => row.profileId).sort()).toEqual([profiles.contributor, profiles.otherContributor, profiles.otherEditor].sort());
  expect(await returnForChanges(input)).toEqual({ ok: false, error: "conflict" });
  expect(await notifications(revision.chapterId)).toHaveLength(rows.length);
});

test("invalid content, missing return reason and forbidden actor never create notifications", async () => {
  const invalid = await draft("draft", "");
  setActor(profiles.contributor);
  expect((await submitForReview({ revisionId: invalid.id, expectedVersion: invalid.version })).ok).toBe(false);
  expect(await notifications(invalid.chapterId)).toHaveLength(0);
  const revision = await draft("review");
  expect((await recommendApproval({ revisionId: revision.id, expectedVersion: revision.version })).ok).toBe(false);
  setActor(profiles.editor);
  expect((await returnForChanges({ revisionId: revision.id, expectedVersion: revision.version, reason: "" })).ok).toBe(false);
  expect(await notifications(revision.chapterId)).toHaveLength(0);
  expect(await db.chapterEditorialEvent.count({ where: { revisionId: revision.id } })).toBe(0);
});

test("concurrent submit attempts commit one transition and one notification per recipient", async () => {
  const revision = await draft();
  const input = { revisionId: revision.id, expectedVersion: revision.version };
  const results = await Promise.all([
    withActor(profiles.contributor, () => submitForReview(input)),
    withActor(profiles.contributor, () => submitForReview(input)),
  ]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(results.find(result => !result.ok)?.error).toBe("conflict");
  const rows = await notifications(revision.chapterId);
  expect(rows.map(row => row.profileId).sort()).toEqual([...(await admins()), profiles.editor, profiles.otherEditor].sort());
  expect(await db.chapterEditorialEvent.count({ where: { revisionId: revision.id } })).toBe(1);
});

test("approval does not create a workflow notification", async () => {
  const revision = await draft("review");
  setActor(profiles.admin);
  expect((await approveRevision({ revisionId: revision.id, expectedVersion: revision.version })).ok).toBe(true);
  expect(await notifications(revision.chapterId)).toHaveLength(0);
});

test("notification insertion failure rolls back revision and audit alongside notifications", async () => {
  const revision = await draft();
  setActor(profiles.contributor);
  // PostgreSQL fault injection stays inside the disposable local QA database.
  await db.$executeRawUnsafe(`CREATE FUNCTION editorial_notification_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'notification insertion failure'; END; $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER editorial_notification_fail BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION editorial_notification_fail()`);
  try {
    await expect(submitForReview({ revisionId: revision.id, expectedVersion: revision.version })).rejects.toThrow();
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER editorial_notification_fail ON "Notification"`);
    await db.$executeRawUnsafe(`DROP FUNCTION editorial_notification_fail()`);
  }
  const after = await db.chapterRevision.findUniqueOrThrow({ where: { id: revision.id } });
  expect(after.status).toBe("draft");
  expect(after.version).toBe(revision.version);
  expect(await db.chapterEditorialEvent.count({ where: { revisionId: revision.id } })).toBe(0);
  expect(await notifications(revision.chapterId)).toHaveLength(0);
});

test("returned work can be edited and resubmitted with one fresh alert per reviewer and no replay duplicates", async () => {
  const revision = await draft();
  setActor(profiles.contributor);
  const submitted = await submitForReview({ revisionId: revision.id, expectedVersion: revision.version });
  expect(submitted.ok).toBe(true);
  setActor(profiles.editor);
  const returned = await returnForChanges({ revisionId: revision.id, expectedVersion: submitted.revision!.version, reason: privateReason });
  expect(returned.ok).toBe(true);
  setActor(profiles.contributor);
  const edited = await updateDraftSnapshot({ revisionId: revision.id, expectedVersion: returned.revision!.version, novelBody: 'محتوى محلي معدّل بعد ملاحظات المراجع ومناسب لإعادة الإرسال.' });
  expect(edited.ok).toBe(true);
  const input = { revisionId: revision.id, expectedVersion: edited.revision!.version };
  const resubmitted = await submitForReview(input);
  expect(resubmitted.ok).toBe(true);
  expect(resubmitted.revision!.status).toBe('review');
  const rows = await notifications(revision.chapterId);
  const reviewAlerts = rows.filter(row => row.titleAr === 'فصل بانتظار المراجعة');
  const reviewers = [...await admins(), profiles.editor, profiles.otherEditor];
  for (const recipient of reviewers) expect(reviewAlerts.filter(row => row.profileId === recipient)).toHaveLength(2);
  expect(reviewAlerts).toHaveLength(reviewers.length * 2);
  expect((await submitForReview(input)).error).toBe('conflict');
  expect(await notifications(revision.chapterId)).toHaveLength(rows.length);
});
