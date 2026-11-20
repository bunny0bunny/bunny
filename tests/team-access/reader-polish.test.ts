import { afterAll, beforeAll, expect, test } from "bun:test";
import { db, actions, setActor } from "./session-fixture";
const accountActions = await import("../../src/lib/account-actions");
const { getForYouSeries } = await import("../../src/lib/foryou");
const { authOptions } = await import("../../src/lib/auth");
const { hashPassword } = await import("../../src/lib/password");

const stamp = Date.now();
let me: string, other: string, seriesId: string, chapterId: string;
beforeAll(async () => {
  me = (await db.profile.create({ data: { email: `polish-${stamp}@bunny.test`, nickname: "قارئ التلميع", passwordHash: "x", emailVerifiedAt: new Date() } })).id;
  other = (await db.profile.create({ data: { email: `polish-other-${stamp}@bunny.test`, nickname: "قارئ آخر", passwordHash: "x", emailVerifiedAt: new Date() } })).id;
  const s = await db.series.create({ data: { slug: `polish-${stamp}`, titleAr: "عمل رومانسي للتجربة", synopsisAr: "عمل لاختبار الاقتراحات", format: "manga", author: "اختبار", coverPath: "/art/covers/warden-of-the-twilight-gate.webp", genresJson: JSON.stringify(["رومانسي"]) } });
  seriesId = s.id;
  chapterId = (await db.chapter.create({ data: { seriesId, number: 4, titleAr: "", workflow: "published", publishedAt: new Date() } })).id;
});
afterAll(async () => {
  setActor(null);
  await db.comment.deleteMany({ where: { seriesId } });
  await db.notification.deleteMany({ where: { profileId: { in: [me, other] } } });
  await db.chapter.deleteMany({ where: { seriesId } });
  await db.series.delete({ where: { id: seriesId } });
  await db.profile.deleteMany({ where: { id: { in: [me, other] } } });
});

test("readers delete their own notifications and clear read ones, never someone else's", async () => {
  const mk = (profileId: string, read: boolean) => db.notification.create({ data: { profileId, type: "system", titleAr: "تجربة", readAt: read ? new Date() : null } });
  const mineUnread = await mk(me, false), mineRead = await mk(me, true), mineRead2 = await mk(me, true), theirs = await mk(other, true);
  setActor(me);
  expect((await actions.deleteNotification({ id: theirs.id })).ok).toBe(false);
  expect((await actions.deleteNotification({ id: mineUnread.id })).ok).toBe(true);
  expect(await actions.clearReadNotifications()).toEqual({ ok: true, removed: 2 });
  expect(await db.notification.count({ where: { id: { in: [mineUnread.id, mineRead.id, mineRead2.id] } } })).toBe(0);
  expect(await db.notification.count({ where: { id: theirs.id } })).toBe(1);
  setActor(null);
  expect((await actions.clearReadNotifications()).ok).toBe(false);
});

test("a like on a chapter comment links to that chapter", async () => {
  const comment = await db.comment.create({ data: { seriesId, chapterId, profileId: other, body: "تعليق على فصل" } });
  setActor(me);
  expect((await actions.toggleCommentLike({ commentId: comment.id })).ok).toBe(true);
  const note = await db.notification.findFirstOrThrow({ where: { profileId: other, type: "comment_like" } });
  expect(note.href).toBe(`/read/manga/polish-${stamp}/4`);
});

test("genres picked by the reader feed the 'for you' rail even before any reading history", async () => {
  setActor(me);
  expect(await getForYouSeries(me)).toEqual([]);
  expect((await accountActions.updatePreferredGenres({ genres: ["رومانسي"] })).ok).toBe(true);
  expect((await accountActions.updatePreferredGenres({ genres: ["ليس نوعًا"] })).ok).toBe(false);
  const items = await getForYouSeries(me, 50);
  const mine = items.find((i) => i.series.slug === `polish-${stamp}`);
  expect(mine?.reasonAr).toBe("لأنك تحب «رومانسي»");
});

test("login explains an unconfirmed email only after the password matched", async () => {
  const email = `polish-unverified-${stamp}@bunny.test`;
  await db.profile.create({ data: { email, nickname: "غير مؤكد", passwordHash: await hashPassword("correct horse battery"), emailVerifiedAt: null } });
  const provider = authOptions.providers[0] as unknown as { options: { authorize: (c: unknown, r: unknown) => Promise<unknown> } };
  const request = { headers: {} };
  expect(await provider.options.authorize({ email, password: "wrong password here" }, request)).toBeNull();
  await expect(provider.options.authorize({ email, password: "correct horse battery" }, request)).rejects.toThrow("EMAIL_NOT_VERIFIED");
  await db.profile.delete({ where: { email } });
});
