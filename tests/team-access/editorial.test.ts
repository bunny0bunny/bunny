import { afterAll, beforeAll, expect, test } from "bun:test";
import { actions, db, setActor, withActor } from "./session-fixture";
import {
  openOrCreateDraft,
  updateDraftSnapshot,
  submitForReview,
  returnForChanges,
  recommendApproval,
  approveRevision,
  publishRevisionNow,
  scheduleRevision,
  cancelScheduledRevision,
  withdrawPublishedChapter,
  executeDuePublications,
} from "../../src/lib/editorial";

let adminId: string;
let editorId: string;
let contribId: string;
let otherStaffId: string;
let assignedSeriesId: string;
let unassignedSeriesId: string;
let testChapterId: string;

beforeAll(async () => {
  const admin = await db.profile.findUniqueOrThrow({ where: { email: "admin@bunny.demo" } });
  adminId = admin.id;

  const editor = await db.profile.upsert({
    where: { email: "editorial-editor@bunny.test" },
    update: { role: "editor", emailVerifiedAt: new Date(), disabledAt: null },
    create: { email: "editorial-editor@bunny.test", nickname: "محرر التحرير", passwordHash: "x", role: "editor", emailVerifiedAt: new Date() },
  });
  editorId = editor.id;

  const contrib = await db.profile.upsert({
    where: { email: "editorial-contrib@bunny.test" },
    update: { role: "contributor", emailVerifiedAt: new Date(), disabledAt: null },
    create: { email: "editorial-contrib@bunny.test", nickname: "مساهم التحرير", passwordHash: "x", role: "contributor", emailVerifiedAt: new Date() },
  });
  contribId = contrib.id;

  const otherStaff = await db.profile.upsert({
    where: { email: "editorial-other@bunny.test" },
    update: { role: "contributor", emailVerifiedAt: new Date(), disabledAt: null },
    create: { email: "editorial-other@bunny.test", nickname: "مساهم آخر", passwordHash: "x", role: "contributor", emailVerifiedAt: new Date() },
  });
  otherStaffId = otherStaff.id;

  const assignedSeries = await db.series.upsert({
    where: { slug: "editorial-assigned-series" },
    update: {},
    create: {
      slug: "editorial-assigned-series",
      titleAr: "عمل مسند للاستوديو",
      synopsisAr: "وصف طويل للعمل المسند لأجل اختبارات الاستوديو التحريري",
      format: "novel",
      author: "مؤلف",
      coverPath: "/art/covers/warden-of-the-twilight-gate.webp",
    },
  });
  assignedSeriesId = assignedSeries.id;

  const unassignedSeries = await db.series.upsert({
    where: { slug: "editorial-unassigned-series" },
    update: {},
    create: {
      slug: "editorial-unassigned-series",
      titleAr: "عمل غير مسند للاستوديو",
      synopsisAr: "وصف طويل للعمل غير المسند لأجل اختبارات الاستوديو التحريري",
      format: "novel",
      author: "مؤلف",
      coverPath: "/art/covers/warden-of-the-twilight-gate.webp",
    },
  });
  unassignedSeriesId = unassignedSeries.id;

  await db.seriesAssignment.upsert({
    where: { profileId_seriesId: { profileId: contribId, seriesId: assignedSeriesId } },
    update: {},
    create: { profileId: contribId, seriesId: assignedSeriesId },
  });
  await db.seriesAssignment.upsert({
    where: { profileId_seriesId: { profileId: editorId, seriesId: assignedSeriesId } },
    update: {},
    create: { profileId: editorId, seriesId: assignedSeriesId },
  });

  const ch = await db.chapter.create({
    data: {
      seriesId: assignedSeriesId,
      number: 1,
      titleAr: "فصل منشور أولي",
      novelBody: "محتوى أصلي منشور للقراء في الفصل الأول.",
      workflow: "published",
      publishedAt: new Date(),
    },
  });
  testChapterId = ch.id;
});

afterAll(async () => {
  setActor(null);
  await db.chapter.deleteMany({ where: { seriesId: { in: [assignedSeriesId, unassignedSeriesId] } } }).catch(() => {});
  await db.seriesAssignment.deleteMany({ where: { seriesId: { in: [assignedSeriesId, unassignedSeriesId] } } }).catch(() => {});
  await db.series.deleteMany({ where: { id: { in: [assignedSeriesId, unassignedSeriesId] } } }).catch(() => {});
  await db.profile.deleteMany({ where: { email: { in: ["editorial-editor@bunny.test", "editorial-contrib@bunny.test", "editorial-other@bunny.test"] } } }).catch(() => {});
});

test("unassigned staff cannot open or edit draft", async () => {
  setActor(otherStaffId);
  const res = await openOrCreateDraft(testChapterId);
  expect(res.ok).toBe(false);
  expect(res.error).toBe("forbidden");
});

test("contributor can open draft on published chapter and create revision 2 draft", async () => {
  setActor(contribId);
  const res = await openOrCreateDraft(testChapterId);
  expect(res.ok).toBe(true);
  expect(res.revision?.revisionNumber).toBe(2);
  expect(res.revision?.status).toBe("draft");

  // Public projection must still retain the original published content
  const ch = await db.chapter.findUniqueOrThrow({ where: { id: testChapterId } });
  expect(ch.workflow).toBe("published");
  expect(ch.novelBody).toBe("محتوى أصلي منشور للقراء في الفصل الأول.");
});

test("stale draft update with mismatched version is rejected with conflict", async () => {
  setActor(contribId);
  const draftRes = await openOrCreateDraft(testChapterId);
  expect(draftRes.ok).toBe(true);
  const rev = draftRes.revision!;

  const failUpdate = await updateDraftSnapshot({
    revisionId: rev.id,
    expectedVersion: rev.version + 99,
    titleAr: "عنوان متعارض",
    novelBody: "نص معدل متعارض",
  });
  expect(failUpdate.ok).toBe(false);
  expect(failUpdate.error).toBe("conflict");
});

test("contributor cannot approve or publish, but can submit for review", async () => {
  setActor(contribId);
  const draftRes = await openOrCreateDraft(testChapterId);
  const rev = draftRes.revision!;

  const appRes = await approveRevision({ revisionId: rev.id, expectedVersion: rev.version });
  expect(appRes.ok).toBe(false);
  expect(appRes.error).toBe("forbidden");

  const pubRes = await publishRevisionNow({ revisionId: rev.id, expectedVersion: rev.version });
  expect(pubRes.ok).toBe(false);
  expect(pubRes.error).toBe("forbidden");

  const submitRes = await submitForReview({ revisionId: rev.id, expectedVersion: rev.version });
  expect(submitRes.ok).toBe(true);
  expect(submitRes.revision?.status).toBe("review");
});

test("editor can return for changes with required reason", async () => {
  setActor(editorId);
  const draftRes = await openOrCreateDraft(testChapterId);
  const rev = draftRes.revision!;

  const emptyReason = await returnForChanges({
    revisionId: rev.id,
    expectedVersion: rev.version,
    reason: "",
  });
  expect(emptyReason.ok).toBe(false);
  expect(emptyReason.error).toBe("reason_required");

  const validReturn = await returnForChanges({
    revisionId: rev.id,
    expectedVersion: rev.version,
    reason: "يرجى مراجعة تدقيق الفقرة الثالثة وتصحيح العبارات.",
  });
  expect(validReturn.ok).toBe(true);
  expect(validReturn.revision?.status).toBe("changes_requested");
});

test("staff cannot edit scheduled work, but an approved unscheduled edit revokes approval", async () => {
  setActor(adminId);
  const draftRes = await openOrCreateDraft(testChapterId);
  const rev1 = draftRes.revision!;

  // Update with valid novel body, submit, approve, and schedule
  await updateDraftSnapshot({
    revisionId: rev1.id,
    expectedVersion: rev1.version,
    titleAr: "فصل جاهز ومعتمد",
    novelBody: "نص روائي متكامل وجاهز تمامًا للاعتماد والنشر المجدول.",
  });

  const fresh1 = (await openOrCreateDraft(testChapterId)).revision!;
  await submitForReview({ revisionId: fresh1.id, expectedVersion: fresh1.version });
  const fresh2 = (await openOrCreateDraft(testChapterId)).revision!;
  await approveRevision({ revisionId: fresh2.id, expectedVersion: fresh2.version });
  const fresh3 = (await openOrCreateDraft(testChapterId)).revision!;
  expect(fresh3.status).toBe("approved");

  const future = new Date(Date.now() + 86400000);
  await scheduleRevision({ revisionId: fresh3.id, expectedVersion: fresh3.version, scheduledFor: future });
  const fresh4 = (await openOrCreateDraft(testChapterId)).revision!;
  expect(fresh4.status).toBe("scheduled");
  expect(fresh4.scheduledFor).not.toBeNull();

  setActor(editorId);
  expect((await updateDraftSnapshot({ revisionId: fresh4.id, expectedVersion: fresh4.version, titleAr: "تعديل مقفل" })).error).toBe("scheduled_locked");
  setActor(adminId);
  const cancelled = await cancelScheduledRevision({ revisionId: fresh4.id, expectedVersion: fresh4.version });
  expect(cancelled.ok).toBe(true);
  setActor(editorId);
  const editRes = await updateDraftSnapshot({
    revisionId: fresh4.id,
    expectedVersion: cancelled.revision!.version,
    titleAr: "فصل جرى تعديله بعد الجدولة",
  });
  expect(editRes.ok).toBe(true);
  expect(editRes.revision?.status).toBe("draft");
  expect(editRes.revision?.approvedById).toBeNull();
  expect(editRes.revision?.scheduledFor).toBeNull();
});

test("admin can withdraw published chapter with audited reason", async () => {
  setActor(adminId);
  const active = await db.chapterRevision.findFirstOrThrow({ where: { chapterId: testChapterId, status: "published" }, orderBy: { revisionNumber: "desc" } });
  const withdrawRes = await withdrawPublishedChapter({
    chapterId: testChapterId,
    expectedRevisionId: active.id,
    expectedVersion: active.version,
    reason: "سحب للمراجعة القانونية والتحريرية الشاملة.",
  });
  expect(withdrawRes.ok).toBe(true);

  const ch = await db.chapter.findUniqueOrThrow({ where: { id: testChapterId } });
  expect(ch.workflow).toBe("draft"); // hidden from readers
});
