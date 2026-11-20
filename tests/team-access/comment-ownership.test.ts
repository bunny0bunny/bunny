import { test, expect, beforeAll, afterAll } from "bun:test";
import { db, actions, setActor } from "./session-fixture";

let author: { id: string };
let reporters: { id: string }[] = [];
let series: { id: string; slug: string };
let editor: { id: string };

async function reader(email: string, nickname: string) {
  return db.profile.upsert({
    where: { email },
    update: { role: "reader", emailVerifiedAt: new Date(), disabledAt: null },
    create: { email, nickname, passwordHash: "test-hash", role: "reader", emailVerifiedAt: new Date() },
  });
}

async function newComment(body = "تعليق للاختبار") {
  return db.comment.create({ data: { profileId: author.id, seriesId: series.id, body } });
}

beforeAll(async () => {
  author = await reader("comment-author@bunny.test", "كاتب التعليق");
  reporters = await Promise.all([1, 2, 3].map((i) => reader(`comment-reporter-${i}@bunny.test`, `مبلّغ ${i}`)));
  editor = await db.profile.upsert({
    where: { email: "comment-editor@bunny.test" },
    update: { role: "editor", emailVerifiedAt: new Date(), disabledAt: null },
    create: { email: "comment-editor@bunny.test", nickname: "مشرف", passwordHash: "test-hash", role: "editor", emailVerifiedAt: new Date() },
  });
  series = await db.series.upsert({
    where: { slug: "comment-ownership-series" },
    update: {},
    create: { slug: "comment-ownership-series", titleAr: "عمل اختبار التعليقات", synopsisAr: "عمل لاختبار ملكية التعليقات والبلاغات", format: "novel", author: "اختبار", coverPath: "/art/covers/warden-of-the-twilight-gate.webp" },
  });
});

afterAll(async () => {
  await db.comment.deleteMany({ where: { seriesId: series.id } });
  setActor(null);
});

test("one report queues a comment but keeps it public", async () => {
  const c = await newComment();
  setActor(reporters[0].id);
  expect((await actions.reportComment({ commentId: c.id, reasonAr: "رسائل مزعجة أو إعلانات" })).ok).toBe(true);
  const row = await db.comment.findUniqueOrThrow({ where: { id: c.id } });
  expect(row.status).toBe("flagged");
  const { getVisibleComments } = await import("../../src/lib/queries");
  const visible = await getVisibleComments(series.id, null);
  expect(visible.some((v) => v.id === c.id)).toBe(true);
});

test("three distinct reporters hide the comment until review", async () => {
  const c = await newComment();
  for (const r of reporters) {
    setActor(r.id);
    expect((await actions.reportComment({ commentId: c.id })).ok).toBe(true);
  }
  // Repeating a report from the same account does not count twice.
  setActor(reporters[0].id);
  await actions.reportComment({ commentId: c.id });
  expect((await db.comment.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("hidden");
  expect(await db.commentReport.count({ where: { commentId: c.id } })).toBe(3);
});

test("keeping a comment visible clears its reports", async () => {
  const c = await newComment();
  setActor(reporters[0].id);
  await actions.reportComment({ commentId: c.id });
  setActor(editor.id);
  expect((await actions.moderateComment({ commentId: c.id, status: "visible" })).ok).toBe(true);
  expect(await db.commentReport.count({ where: { commentId: c.id } })).toBe(0);
});

test("only the author can delete their own comment", async () => {
  const c = await newComment();
  setActor(reporters[1].id);
  expect(await actions.deleteOwnComment({ commentId: c.id })).toEqual({ ok: false, error: "forbidden" });
  setActor(null);
  expect(await actions.deleteOwnComment({ commentId: c.id })).toEqual({ ok: false, error: "unauthenticated" });
  setActor(author.id);
  expect((await actions.deleteOwnComment({ commentId: c.id })).ok).toBe(true);
  expect(await db.comment.findUnique({ where: { id: c.id } })).toBeNull();
});

test("author edits are limited to 15 minutes and to non-hidden comments", async () => {
  const fresh = await newComment();
  setActor(reporters[1].id);
  expect((await actions.editOwnComment({ commentId: fresh.id, body: "تعديل من غير صاحبه" })).ok).toBe(false);
  setActor(author.id);
  expect((await actions.editOwnComment({ commentId: fresh.id, body: "نص بعد التعديل" })).ok).toBe(true);
  expect((await db.comment.findUniqueOrThrow({ where: { id: fresh.id } })).body).toBe("نص بعد التعديل");

  const old = await db.comment.create({ data: { profileId: author.id, seriesId: series.id, body: "قديم", createdAt: new Date(Date.now() - 16 * 60 * 1000) } });
  expect((await actions.editOwnComment({ commentId: old.id, body: "محاولة متأخرة" })).ok).toBe(false);

  const hidden = await db.comment.create({ data: { profileId: author.id, seriesId: series.id, body: "مخفي", status: "hidden" } });
  expect((await actions.editOwnComment({ commentId: hidden.id, body: "محاولة على مخفي" })).ok).toBe(false);
});

test("load more pages through public comments", async () => {
  await db.comment.deleteMany({ where: { seriesId: series.id } });
  for (let i = 0; i < 35; i++) await db.comment.create({ data: { profileId: author.id, seriesId: series.id, body: `تعليق ${i}`, createdAt: new Date(Date.now() - i * 1000) } });
  setActor(null);
  const page2 = await actions.loadMoreComments({ seriesSlug: series.slug, chapterNumber: null, offset: 30 });
  expect(page2.ok).toBe(true);
  if (page2.ok) expect(page2.comments.length).toBe(5);
});
