import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { actions, db, setActor } from './session-fixture';
let actor: string, series: string, number = 100;
beforeAll(async () => {
  actor = (await db.profile.create({ data: { email: `create-revoke-${Date.now()}@bunny.test`, nickname: 'QA', passwordHash: 'x', role: 'contributor', emailVerifiedAt: new Date() } })).id;
  series = (await db.series.create({ data: { slug: `create-revoke-${Date.now()}`, titleAr: 'اختبار', synopsisAr: 'اختبار', author: 'QA', format: 'novel', coverPath: '' } })).id;
});
beforeEach(async () => {
  await db.profile.update({ where: { id: actor }, data: { role: 'contributor', disabledAt: null, authVersion: 0, emailVerifiedAt: new Date() } });
  await db.seriesAssignment.upsert({ where: { profileId_seriesId: { profileId: actor, seriesId: series } }, create: { profileId: actor, seriesId: series }, update: {} });
  setActor(actor);
});
afterAll(async () => { setActor(null); await db.series.delete({ where: { id: series } }); await db.profile.delete({ where: { id: actor } }); });

async function createAfter(revoke: () => Promise<unknown>, premium = false) {
  const holder = globalThis as unknown as { prisma: typeof db };
  const client = holder.prisma;
  let intercepted = false;
  // Prisma's dynamic $transaction property cannot reliably be spied on. Use
  // its supported query extension at the final preliminary uniqueness read.
  holder.prisma = client.$extends({ query: { chapter: { async findUnique({ args, query }) {
    const result = await query(args);
    if (args.where.seriesId_number && !intercepted) { intercepted = true; await revoke(); }
    return result;
  } } } }) as unknown as typeof db;
  try {
    const result = await actions.createChapter({ seriesId: series, number: number++, titleAr: 'اختبار فصل', workflow: 'draft', isPremiumDemo: premium });
    expect(intercepted).toBe(true);
    return result;
  } finally { holder.prisma = client; }
}
test('assignment revoked after preliminary authorization prevents chapter creation', async () => {
  const result = await createAfter(() => db.seriesAssignment.deleteMany({ where: { profileId: actor, seriesId: series } }));
  expect(result.ok).toBe(false); expect(result.error).toBe('forbidden');
  expect(await db.chapter.count({ where: { seriesId: series } })).toBe(0);
});
test('disabled account, changed authentication version and removed verification fail closed', async () => {
  for (const data of [{ disabledAt: new Date() }, { authVersion: 1 }, { emailVerifiedAt: null }]) {
    await db.profile.update({ where: { id: actor }, data: { disabledAt: null, authVersion: 0, emailVerifiedAt: new Date() } });
    const result = await createAfter(() => db.profile.update({ where: { id: actor }, data }));
    expect(result.ok).toBe(false); expect(result.error).toBe('forbidden');
  }
});
test('role removal and administrator demotion cannot retain stale creation privileges', async () => {
  expect((await createAfter(() => db.profile.update({ where: { id: actor }, data: { role: 'reader' } }))).ok).toBe(false);
  await db.profile.update({ where: { id: actor }, data: { role: 'admin' } });
  expect((await createAfter(() => db.profile.update({ where: { id: actor }, data: { role: 'contributor' } }), true)).ok).toBe(false);
});
test('unchanged assigned contributor can still create a draft', async () => {
  expect((await createAfter(async () => {})).ok).toBe(true);
});
