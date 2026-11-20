import { afterAll, beforeAll, expect, test } from "bun:test";
const { db, setActor, withActor } = await import("./session-fixture");
const requests = await import("../../src/lib/content-requests/service");
const prefix = `withdraw-${crypto.randomUUID()}`;
let admin: string, reader: string, friend: string, third: string;
async function submit(actor: string, title: string) {
  const result = await withActor(actor, async () => requests.createContentRequest({ title, category: "manga", submissionId: crypto.randomUUID() }));
  if (!result.ok) throw Error(result.error);
  return result.data;
}
const version = async (id: string) => (await db.contentRequest.findUniqueOrThrow({ where: { id } })).version;
beforeAll(async () => {
  const make = async (suffix: string, role: "admin" | "reader") => (await db.profile.create({ data: { email: `${prefix}-${suffix}@bunny.test`, nickname: suffix, passwordHash: "x", role, emailVerifiedAt: new Date() } })).id;
  admin = await make("admin", "admin"); reader = await make("reader", "reader"); friend = await make("friend", "reader"); third = await make("third", "reader");
});
afterAll(async () => {
  setActor(null);
  await db.contentRequest.updateMany({ where: { profileId: { in: [admin, reader, friend, third] } }, data: { mergedIntoId: null } });
  await db.profile.deleteMany({ where: { id: { in: [admin, reader, friend, third] } } });
});

test("owner withdraws a new request; it leaves their list, still counts for the quota, and the title can be asked again", async () => {
  const first = await submit(reader, "عمل للسحب");
  expect((await withActor(friend, async () => requests.withdrawContentRequest({ id: first.id, expectedVersion: 1 }))).ok).toBe(false);
  expect((await withActor(reader, async () => requests.withdrawContentRequest({ id: first.id, expectedVersion: 99 }))).ok).toBe(false);
  expect((await withActor(reader, async () => requests.withdrawContentRequest({ id: first.id, expectedVersion: 1 }))).ok).toBe(true);
  const mine = await withActor(reader, async () => requests.listMyRequests());
  expect(mine.ok && mine.data.items.some((i) => i.id === first.id)).toBe(false);
  expect((await withActor(reader, async () => requests.getMyRequest(first.id))).ok).toBe(false);
  expect(await withActor(reader, async () => requests.getMyRequestAllowance())).toBe(2);
  const again = await submit(reader, "عمل للسحب");
  expect(again.duplicate).toBe(false);
  expect(again.id).not.toBe(first.id);
  // The live one is still a duplicate for a third attempt.
  expect((await submit(reader, "عمل  للسحب")).duplicate).toBe(true);
  expect(await withActor(reader, async () => requests.getMyRequestAllowance())).toBe(1);
});

test("withdrawing is refused once the team prepares the work", async () => {
  const { id } = await submit(friend, "عمل قيد التجهيز");
  expect((await withActor(admin, async () => requests.updateRequestStatus({ id, expectedVersion: 1, status: "preparing", statusNote: null }))).ok).toBe(true);
  const result = await withActor(friend, async () => requests.withdrawContentRequest({ id, expectedVersion: 2 }));
  expect(result).toEqual({ ok: false, error: "not_withdrawable" });
});

test("editing works only while new and standalone, and refuses a title the reader already asked for", async () => {
  const a = await submit(third, "عنوان خاطئ");
  const b = await submit(third, "عمل آخر");
  const edited = await withActor(third, async () => requests.editContentRequest({ id: a.id, expectedVersion: 1, title: "العنوان الصحيح", category: "manhwa", referenceUrl: "https://example.com/work", message: "تصحيح" }));
  expect(edited.ok).toBe(true);
  const row = await db.contentRequest.findUniqueOrThrow({ where: { id: a.id } });
  expect(row).toMatchObject({ title: "العنوان الصحيح", category: "manhwa", normalizedTitle: "العنوان الصحيح", version: 2 });
  expect(await withActor(third, async () => requests.editContentRequest({ id: b.id, expectedVersion: 1, title: "العنوان الصحيح", category: "manhwa" }))).toEqual({ ok: false, error: "duplicate" });
  expect((await withActor(admin, async () => requests.updateRequestStatus({ id: b.id, expectedVersion: 1, status: "reviewing", statusNote: null }))).ok).toBe(true);
  expect(await withActor(third, async () => requests.editContentRequest({ id: b.id, expectedVersion: 2, title: "اسم جديد", category: "manga" }))).toEqual({ ok: false, error: "not_editable" });
});

test("in a merged group a withdrawn member stops counting and stops getting updates; a root withdrawn by its owner keeps the group for admins", async () => {
  const root = await submit(admin, "عمل مجمّع");
  const member = await submit(friend, "Grouped work");
  expect((await withActor(admin, async () => requests.mergeContentRequests({ sourceId: member.id, targetId: root.id, expectedSourceVersion: 1, expectedTargetVersion: 1 }))).ok).toBe(true);
  // Merged members cannot be edited but can be withdrawn.
  expect((await withActor(friend, async () => requests.editContentRequest({ id: member.id, expectedVersion: await version(member.id), title: "x y", category: "manga" }))).ok).toBe(false);
  expect((await withActor(friend, async () => requests.withdrawContentRequest({ id: member.id, expectedVersion: await version(member.id) }))).ok).toBe(true);
  const before = await db.notification.count({ where: { profileId: friend } });
  expect((await withActor(admin, async () => requests.updateRequestStatus({ id: root.id, expectedVersion: await version(root.id), status: "reviewing", statusNote: "نراجعه" }))).ok).toBe(true);
  expect(await db.notification.count({ where: { profileId: friend } })).toBe(before);
  const detail = await withActor(admin, async () => requests.getAdminRequest(root.id));
  expect(detail.ok && detail.data.requesterCount).toBe(1);
  expect(detail.ok && detail.data.members.find((m) => m.id === member.id)?.withdrawn).toBe(true);

  // Now the owner of the root withdraws while another member still wants it.
  const keeper = await submit(third, "عمل مجمّع");
  expect((await withActor(admin, async () => requests.mergeContentRequests({ sourceId: keeper.id, targetId: root.id, expectedSourceVersion: 1, expectedTargetVersion: await version(root.id) }))).ok).toBe(true);
  expect((await withActor(admin, async () => requests.withdrawContentRequest({ id: root.id, expectedVersion: await version(root.id) }))).ok).toBe(true);
  const list = await withActor(admin, async () => requests.listAdminRequests({ q: "عمل مجمّع" }));
  expect(list.ok && list.data.items.find((i) => i.id === root.id)?.requesterCount).toBe(1);
  // When the last member withdraws too, the group leaves the admin queue.
  expect((await withActor(third, async () => requests.withdrawContentRequest({ id: keeper.id, expectedVersion: await version(keeper.id) }))).ok).toBe(true);
  const after = await withActor(admin, async () => requests.listAdminRequests({ q: "عمل مجمّع" }));
  expect(after.ok && after.data.items.some((i) => i.id === root.id)).toBe(false);
});
