import { test, expect, beforeAll, afterAll } from "bun:test";
import { db, actions, setActor, withActor } from "./session-fixture";

let adminUser: { id: string; email: string };
let editorUser: { id: string; email: string };
let contribUser: { id: string; email: string };
let readerUser: { id: string; email: string };
let assignedSeries: { id: string; slug: string };
let unassignedSeries: { id: string; slug: string };

beforeAll(async () => {
  // Create dedicated test profiles
  contribUser = await db.profile.upsert({
    where: { email: "team-contrib@bunny.test" },
    update: { role: "contributor", emailVerifiedAt: new Date(), disabledAt: null },
    create: {
      email: "team-contrib@bunny.test",
      nickname: "مساهم اختبار",
      passwordHash: "test-hash",
      role: "contributor",
      emailVerifiedAt: new Date(),
    },
  });

  editorUser = await db.profile.upsert({
    where: { email: "team-editor-peer@bunny.test" },
    update: { role: "editor", emailVerifiedAt: new Date(), disabledAt: null },
    create: {
      email: "team-editor-peer@bunny.test",
      nickname: "محرر اختبار",
      passwordHash: "test-hash",
      role: "editor",
      emailVerifiedAt: new Date(),
    },
  });

  adminUser = await db.profile.findUniqueOrThrow({ where: { email: "admin@bunny.demo" } });
  readerUser = await db.profile.findUniqueOrThrow({ where: { email: "reader@bunny.demo" } });

  // Dedicated test works
  assignedSeries = await db.series.upsert({
    where: { slug: "team-test-assigned-novel" },
    update: {},
    create: {
      slug: "team-test-assigned-novel",
      titleAr: "رواية مسندة للاختبار",
      synopsisAr: "محتوى اختبار مسند لأعضاء الفريق للتأكد من الصلاحيات",
      format: "novel",
      author: "مؤلف الاختبار",
      coverPath: "/art/covers/warden-of-the-twilight-gate.webp",
    },
  });

  unassignedSeries = await db.series.upsert({
    where: { slug: "team-test-unassigned-novel" },
    update: {},
    create: {
      slug: "team-test-unassigned-novel",
      titleAr: "رواية غير مسندة للاختبار",
      synopsisAr: "محتوى اختبار غير مسند للتحقق من منع الوصول للعمل",
      format: "novel",
      author: "مؤلف الاختبار",
      coverPath: "/art/covers/warden-of-the-twilight-gate.webp",
    },
  });

  // Assign contribUser and editorUser to assignedSeries only
  await db.seriesAssignment.upsert({
    where: { profileId_seriesId: { profileId: contribUser.id, seriesId: assignedSeries.id } },
    update: {},
    create: { profileId: contribUser.id, seriesId: assignedSeries.id },
  });

  await db.seriesAssignment.upsert({
    where: { profileId_seriesId: { profileId: editorUser.id, seriesId: assignedSeries.id } },
    update: {},
    create: { profileId: editorUser.id, seriesId: assignedSeries.id },
  });
});

afterAll(async () => {
  // Restore fixture accounts to seeded roles
  await db.profile.update({ where: { email: "admin@bunny.demo" }, data: { role: "admin" } }).catch(() => {});
  await db.profile.update({ where: { email: "editor@bunny.demo" }, data: { role: "editor" } }).catch(() => {});
  await db.profile.update({ where: { email: "reader@bunny.demo" }, data: { role: "reader" } }).catch(() => {});

  // Clean test fixtures
  await db.chapter.deleteMany({
    where: { seriesId: { in: [assignedSeries.id, unassignedSeries.id] } },
  }).catch(() => {});
  await db.seriesAssignment.deleteMany({
    where: { seriesId: { in: [assignedSeries.id, unassignedSeries.id] } },
  }).catch(() => {});
  await db.series.deleteMany({
    where: { id: { in: [assignedSeries.id, unassignedSeries.id] } },
  }).catch(() => {});
  await db.profile.deleteMany({
    where: { email: { in: ["team-contrib@bunny.test", "team-editor-peer@bunny.test", "team-admin-1@bunny.test", "team-admin-2@bunny.test"] } },
  }).catch(() => {});

  await db.$disconnect();
});

test("1. assigned contributor can create draft chapter in assigned work", async () => {
  setActor(contribUser.id);
  const result = await actions.createChapter({
    seriesId: assignedSeries.id,
    number: 101,
    titleAr: "مسودة فصل لمساهم",
    workflow: "draft",
    isPremiumDemo: false,
    readingDirection: "rtl",
    pageCount: 1,
    novelBody: "نص مسودة تجريبي للمساهم",
  });
  expect(result.ok).toBe(true);
  const ch = await db.chapter.findFirst({
    where: { seriesId: assignedSeries.id, number: 101, deletedAt: null },
  });
  expect(ch).not.toBeNull();
  expect(ch?.workflow).toBe("draft");
});

test("2. assigned contributor can create review chapter in assigned work", async () => {
  setActor(contribUser.id);
  const result = await actions.createChapter({
    seriesId: assignedSeries.id,
    number: 102,
    titleAr: "فصل للمراجعة لمساهم",
    workflow: "review",
    isPremiumDemo: false,
    readingDirection: "rtl",
    pageCount: 1,
    novelBody: "نص مراجعة تجريبي للمساهم",
  });
  expect(result.ok).toBe(true);
  const ch = await db.chapter.findFirst({
    where: { seriesId: assignedSeries.id, number: 102, deletedAt: null },
  });
  expect(ch).not.toBeNull();
  expect(ch?.workflow).toBe("review");
});

test("3. contributor cannot publish, schedule, or create premium chapter", async () => {
  setActor(contribUser.id);

  // Attempt to publish
  const pubRes = await actions.createChapter({
    seriesId: assignedSeries.id,
    number: 103,
    titleAr: "محاولة نشر مباشر",
    workflow: "published",
    isPremiumDemo: false,
    readingDirection: "rtl",
    pageCount: 1,
    novelBody: "نص",
  });
  expect(pubRes).toEqual({ ok: false, error: "forbidden" });

  // Attempt premium
  const premRes = await actions.createChapter({
    seriesId: assignedSeries.id,
    number: 104,
    titleAr: "محاولة فصل مميز",
    workflow: "draft",
    isPremiumDemo: true,
    readingDirection: "rtl",
    pageCount: 1,
    novelBody: "نص",
  });
  expect(premRes).toEqual({ ok: false, error: "forbidden" });

  // Attempt scheduling
  const schedRes = await actions.createChapter({
    seriesId: assignedSeries.id,
    number: 105,
    titleAr: "محاولة جدولة",
    workflow: "draft",
    isPremiumDemo: false,
    readingDirection: "rtl",
    pageCount: 1,
    scheduledFor: new Date(Date.now() + 86400000).toISOString(),
    novelBody: "نص",
  });
  expect(schedRes).toEqual({ ok: false, error: "forbidden" });

  // Verify none were created
  const count = await db.chapter.count({
    where: { seriesId: assignedSeries.id, number: { in: [103, 104, 105] } },
  });
  expect(count).toBe(0);
});

test("4. unassigned contributor/editor cannot create chapter in unassigned work", async () => {
  const before = await db.chapter.count({ where: { seriesId: unassignedSeries.id } });

  setActor(contribUser.id);
  const contribRes = await actions.createChapter({
    seriesId: unassignedSeries.id,
    number: 201,
    titleAr: "محاولة مساهم غير مسند",
    workflow: "draft",
    isPremiumDemo: false,
    readingDirection: "rtl",
    pageCount: 1,
    novelBody: "نص",
  });
  expect(contribRes).toEqual({ ok: false, error: "forbidden" });

  setActor(editorUser.id);
  const editorRes = await actions.createChapter({
    seriesId: unassignedSeries.id,
    number: 202,
    titleAr: "محاولة محرر غير مسند",
    workflow: "draft",
    isPremiumDemo: false,
    readingDirection: "rtl",
    pageCount: 1,
    novelBody: "نص",
  });
  expect(editorRes).toEqual({ ok: false, error: "forbidden" });

  expect(await db.chapter.count({ where: { seriesId: unassignedSeries.id } })).toBe(before);
});

test("5. reader cannot create chapter (forbidden, DB unchanged)", async () => {
  setActor(readerUser.id);
  const before = await db.chapter.count({ where: { seriesId: assignedSeries.id } });
  const res = await actions.createChapter({
    seriesId: assignedSeries.id,
    number: 301,
    titleAr: "محاولة قارئ",
    workflow: "draft",
    isPremiumDemo: false,
    readingDirection: "rtl",
    pageCount: 1,
    novelBody: "نص",
  });
  expect(res).toEqual({ ok: false, error: "forbidden" });
  expect(await db.chapter.count({ where: { seriesId: assignedSeries.id } })).toBe(before);
});

test("6. contributor/editor can update draft metadata in assigned work", async () => {
  const ch = await db.chapter.findFirstOrThrow({
    where: { seriesId: assignedSeries.id, number: 101, deletedAt: null },
  });

  setActor(contribUser.id);
  const res = await actions.updateChapterMeta({
    id: ch.id,
    titleAr: "عنوان محدث بواسطة المساهم",
    workflow: "review",
    readingDirection: "ltr",
  });
  expect(res.ok).toBe(true);

  const updated = await db.chapter.findUnique({ where: { id: ch.id } });
  expect(updated?.titleAr).toBe("عنوان محدث بواسطة المساهم");
  expect(updated?.workflow).toBe("review");
  expect(updated?.readingDirection).toBe("ltr");
});

test("7. contributor/editor cannot mutate published chapter or set published workflow", async () => {
  // Admin creates a published chapter in assignedSeries
  setActor(adminUser.id);
  const pubChapter = await db.chapter.create({
    data: {
      seriesId: assignedSeries.id,
      number: 401,
      titleAr: "فصل منشور من الأدمن",
      workflow: "published",
      publishedAt: new Date(),
      readingDirection: "rtl",
    },
  });

  // Contributor tries to edit this published chapter
  setActor(contribUser.id);
  const res1 = await actions.updateChapterMeta({
    id: pubChapter.id,
    titleAr: "محاولة تعديل فصل منشور",
  });
  expect(res1).toEqual({ ok: false, error: "forbidden" });

  // Contributor tries to set a draft chapter to published
  const draftCh = await db.chapter.findFirstOrThrow({
    where: { seriesId: assignedSeries.id, number: 101, deletedAt: null },
  });
  const res2 = await actions.updateChapterMeta({
    id: draftCh.id,
    workflow: "published",
  });
  expect(res2).toEqual({ ok: false, error: "forbidden" });

  // Verify published chapter remains unchanged
  const freshPub = await db.chapter.findUnique({ where: { id: pubChapter.id } });
  expect(freshPub?.titleAr).toBe("فصل منشور من الأدمن");
  expect(freshPub?.workflow).toBe("published");
});

test("8. non-admin cannot upsert series, setWorkflowBulk, or mutate collections", async () => {
  setActor(editorUser.id);

  const seriesRes = await actions.upsertSeries({
    titleAr: "محاولة إنشاء عمل",
    slug: "attempt-by-editor",
    synopsisAr: "ملخص تجريبي يزيد عن عشرين حرفا للتحقق من الصلاحيات",
    format: "novel",
    status: "ongoing",
    author: "مؤلف",
    genres: ["فانتازيا"],
    isFeatured: false,
  });
  expect(seriesRes).toEqual({ ok: false, error: "forbidden" });

  const bulkRes = await actions.setWorkflowBulk([], "published");
  expect(bulkRes).toEqual({ ok: false, error: "forbidden" });

  const colRes = await actions.upsertCollection({
    titleAr: "مجموعة تجريبية",
    slug: "attempt-col",
    descriptionAr: "وصف تجريبي طويل كاف",
    theme: "violet",
    displayOrder: 1,
    isFeatured: false,
    seriesSlugs: [],
  });
  expect(colRes).toEqual({ ok: false, error: "forbidden" });
});

test("9. admin can set series assignment idempotently (grant and revoke) for staff", async () => {
  setActor(adminUser.id);

  // Grant assignment
  const grant1 = await actions.setSeriesAssignment({
    seriesId: unassignedSeries.id,
    profileId: contribUser.id,
    assigned: true,
  });
  expect(grant1.ok).toBe(true);

  // Idempotent second grant
  const grant2 = await actions.setSeriesAssignment({
    seriesId: unassignedSeries.id,
    profileId: contribUser.id,
    assigned: true,
  });
  expect(grant2.ok).toBe(true);

  expect(await db.seriesAssignment.count({
    where: { seriesId: unassignedSeries.id, profileId: contribUser.id },
  })).toBe(1);

  // Revoke assignment
  const revoke1 = await actions.setSeriesAssignment({
    seriesId: unassignedSeries.id,
    profileId: contribUser.id,
    assigned: false,
  });
  expect(revoke1.ok).toBe(true);

  // Idempotent second revoke
  const revoke2 = await actions.setSeriesAssignment({
    seriesId: unassignedSeries.id,
    profileId: contribUser.id,
    assigned: false,
  });
  expect(revoke2.ok).toBe(true);

  expect(await db.seriesAssignment.count({
    where: { seriesId: unassignedSeries.id, profileId: contribUser.id },
  })).toBe(0);
});

test("10. setSeriesAssignment rejects reader target", async () => {
  setActor(adminUser.id);
  const res = await actions.setSeriesAssignment({
    seriesId: assignedSeries.id,
    profileId: readerUser.id,
    assigned: true,
  });
  expect(res).toEqual({ ok: false, error: "invalid_target" });
  expect(await db.seriesAssignment.count({
    where: { seriesId: assignedSeries.id, profileId: readerUser.id },
  })).toBe(0);
});

test("11. non-admin cannot set series assignment", async () => {
  setActor(editorUser.id);
  const res = await actions.setSeriesAssignment({
    seriesId: assignedSeries.id,
    profileId: contribUser.id,
    assigned: false,
  });
  expect(res).toEqual({ ok: false, error: "forbidden" });
});

test("12. demoting staff to reader automatically revokes series assignments", async () => {
  setActor(adminUser.id);

  // Verify assignment exists
  const hasAssignment = await db.seriesAssignment.count({
    where: { profileId: contribUser.id, seriesId: assignedSeries.id },
  });
  expect(hasAssignment).toBe(1);

  // Demote to reader
  const demoteRes = await actions.setUserRole(contribUser.id, "reader");
  expect(demoteRes.ok).toBe(true);

  // Check assignments are cleared
  const countAfter = await db.seriesAssignment.count({
    where: { profileId: contribUser.id },
  });
  expect(countAfter).toBe(0);

  // Restore contribUser role for cleanliness
  await actions.setUserRole(contribUser.id, "contributor");
});

test("13. moderation separation: editor and admin can moderate, contributor cannot", async () => {
  // Seed comment for testing
  const comment = await db.comment.create({
    data: {
      profileId: readerUser.id,
      seriesId: assignedSeries.id,
      body: "تعليق اختبار للفحص الأمني",
      status: "visible",
    },
  });

  // Contributor tries to moderate
  setActor(contribUser.id);
  const contribMod = await actions.moderateComment({ commentId: comment.id, status: "hidden" });
  expect(contribMod).toEqual({ ok: false, error: "forbidden" });

  // Editor moderates
  setActor(editorUser.id);
  const editorMod = await actions.moderateComment({ commentId: comment.id, status: "hidden" });
  expect(editorMod.ok).toBe(true);

  // Verify status updated
  const updated = await db.comment.findUnique({ where: { id: comment.id } });
  expect(updated?.status).toBe("hidden");

  // Admin deletes comment
  setActor(adminUser.id);
  const adminDel = await actions.deleteComment({ commentId: comment.id });
  expect(adminDel.ok).toBe(true);
});

test("14. concurrent admin cross-demotions preserve last-admin invariant", async () => {
  // Create two dedicated admin accounts
  const admin1 = await db.profile.upsert({
    where: { email: "team-admin-1@bunny.test" },
    update: { role: "admin" },
    create: {
      email: "team-admin-1@bunny.test",
      nickname: "مدير متزامن 1",
      passwordHash: "test-hash",
      role: "admin",
    },
  });

  const admin2 = await db.profile.upsert({
    where: { email: "team-admin-2@bunny.test" },
    update: { role: "admin" },
    create: {
      email: "team-admin-2@bunny.test",
      nickname: "مدير متزامن 2",
      passwordHash: "test-hash",
      role: "admin",
    },
  });

  // Temporarily demote seeded admin so exactly two admins exist
  await db.profile.update({ where: { id: adminUser.id }, data: { role: "editor" } });

  try {
    const adminCountBefore = await db.profile.count({ where: { role: "admin" } });
    expect(adminCountBefore).toBe(2);

    // Cross demotions run concurrently with distinct actor contexts
    const [res1, res2] = await Promise.all([
      withActor(admin1.id, () => actions.setUserRole(admin2.id, "editor")),
      withActor(admin2.id, () => actions.setUserRole(admin1.id, "editor")),
    ]);

    const adminCountAfter = await db.profile.count({ where: { role: "admin" } });
    // Invariant: exactly one admin must survive (or both fail on conflict), NEVER 0!
    expect(adminCountAfter).toBeGreaterThanOrEqual(1);

    // At least one demotion must have failed (either last_admin, forbidden, or conflict)
    const failures = [res1, res2].filter((r) => !r.ok);
    expect(failures.length).toBeGreaterThanOrEqual(1);
  } finally {
    // Restore seeded admin
    await db.profile.update({ where: { id: adminUser.id }, data: { role: "admin" } });
  }
});
