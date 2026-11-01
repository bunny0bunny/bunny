import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { actions, db, setActor, withActor } from './session-fixture';
import * as editorial from '../../src/lib/editorial';
import { startUpload } from '../../src/lib/media/uploads';
import * as editorialActions from '../../src/lib/editorial-actions';

const excluded: string[] = [];
let admin: string, editor: string, contributor: string, other: string, series: string, second: string, number = 0;
beforeAll(async () => {
  const stamp = Date.now();
  const make = async (name: string, role: 'admin' | 'editor' | 'contributor') => (await db.profile.create({ data: { email: `publisher-${stamp}-${name}@bunny.test`, nickname: name, role, passwordHash: 'x', emailVerifiedAt: new Date() } })).id;
  admin = await make('admin', 'admin'); editor = await make('editor', 'editor'); contributor = await make('contributor', 'contributor'); other = await make('other', 'editor');
  for (const slug of [`publisher-${stamp}`, `publisher-other-${stamp}`]) {
    const row = await db.series.create({ data: { slug, titleAr: 'اسم خاص', titleOriginal: 'Private English title', synopsisAr: 'اختبار', format: 'novel', author: 'QA', coverPath: '' } });
    if (!series) series = row.id; else second = row.id;
  }
  await db.seriesAssignment.create({ data: { profileId: contributor, seriesId: series } });
  for (const [name, data] of [['disabled', { disabledAt: new Date() }], ['unverified', { emailVerifiedAt: null }]] as const) {
    const id = await make(name, 'editor'); excluded.push(id);
    await db.profile.update({ where: { id }, data });
    await db.seriesAssignment.create({ data: { profileId: id, seriesId: series, canPublish: true } });
  }
});
beforeEach(async () => {
  await db.profile.update({ where: { id: editor }, data: { role: 'editor', disabledAt: null, emailVerifiedAt: new Date(), authVersion: 0 } });
  await db.seriesAssignment.upsert({ where: { profileId_seriesId: { profileId: editor, seriesId: series } }, create: { profileId: editor, seriesId: series }, update: {} });
  setActor(admin);
});
afterAll(async () => {
  setActor(null);
  const chapters = await db.chapter.findMany({ where: { seriesId: { in: [series, second] } }, select: { id: true } });
  await db.notification.deleteMany({ where: { href: { in: chapters.map(c => `/studio/chapters/${c.id}`) } } });
  // Publication history deliberately has no content FK; remove this fixture outbox explicitly.
  await db.chapterPublication.deleteMany({ where: { chapterId: { in: chapters.map(c => c.id) } } });
  await db.series.deleteMany({ where: { id: { in: [series, second] } } });
  await db.accountAudit.deleteMany({ where: { targetId: { in: [admin, editor, contributor, other, ...excluded] } } });
  await db.profile.deleteMany({ where: { id: { in: [admin, editor, contributor, other, ...excluded] } } });
});
async function revision(status: 'draft' | 'review' | 'approved' | 'scheduled' = 'review', seriesId = series) {
  const chapter = await db.chapter.create({ data: { seriesId, number: ++number, titleAr: 'عنوان خاص' } });
  return db.chapterRevision.create({ data: { chapterId: chapter.id, revisionNumber: 1, titleAr: 'عنوان خاص', novelBody: 'محتوى صالح للنشر', status, ...(['approved', 'scheduled'].includes(status) ? { approvedAt: new Date(), approvedById: admin } : {}), ...(status === 'scheduled' ? { scheduledFor: new Date(Date.now() + 86400000) } : {}) } });
}
const input = (r: { id: string; version: number }) => ({ revisionId: r.id, expectedVersion: r.version });
async function grant(canPublish = true, profileId = editor, seriesId = series) {
  setActor(admin); return actions.setSeriesPublishingPermission({ seriesId, profileId, canPublish });
}
async function alerts(chapterId: string) { return db.notification.findMany({ where: { href: `/studio/chapters/${chapterId}` } }); }

test('scheduled staff mutations lock before edits, return or PDF reservation while read access remains', async () => {
  const r = await revision('scheduled'); setActor(editor);
  expect((await editorial.openOrCreateDraft(r.chapterId)).revision?.id).toBe(r.id);
  expect((await editorial.updateDraftSnapshot({ ...input(r), novelBody: 'تغيير' })).error).toBe('scheduled_locked');
  expect((await editorial.returnForChanges({ ...input(r), reason: 'تعديل' })).error).toBe('scheduled_locked');
  const old = process.env.MEDIA_UPLOADS_ENABLED; process.env.MEDIA_UPLOADS_ENABLED = '1';
  try { expect((await startUpload({ ...input(r), sourceName: 'chapter.pdf', sourceBytes: 100, pageCount: 1 })).error).toBe('scheduled_locked'); }
  finally { if (old === undefined) delete process.env.MEDIA_UPLOADS_ENABLED; else process.env.MEDIA_UPLOADS_ENABLED = old; }
  expect((await db.chapterRevision.findUniqueOrThrow({ where: { id: r.id } })).version).toBe(r.version);
});

test('publishing grants default off, require an existing active verified editor assignment and reject forged calls', async () => {
  await db.seriesAssignment.deleteMany({ where: { profileId: editor, seriesId: series } });
  expect((await grant()).ok).toBe(false);
  await actions.setSeriesAssignment({ seriesId: series, profileId: editor, assigned: true, canPublish: true });
  expect((await db.seriesAssignment.findUniqueOrThrow({ where: { profileId_seriesId: { profileId: editor, seriesId: series } } })).canPublish).toBe(false);
  expect((await grant(true, contributor)).ok).toBe(false);
  for (const data of [{ disabledAt: new Date() }, { disabledAt: null, emailVerifiedAt: null }]) {
    await db.profile.update({ where: { id: editor }, data }); expect((await grant()).ok).toBe(false);
  }
  setActor(contributor); expect((await actions.setSeriesPublishingPermission({ seriesId: series, profileId: editor, canPublish: true })).ok).toBe(false);
  expect((await actions.setSeriesPublishingPermission({ seriesId: series, profileId: editor, canPublish: 'true' })).ok).toBe(false);
});

test('unassignment and every departure from editor revoke grants with audit and never restore on reassignment', async () => {
  expect((await grant()).ok).toBe(true);
  await actions.setSeriesAssignment({ seriesId: series, profileId: editor, assigned: false });
  await actions.setSeriesAssignment({ seriesId: series, profileId: editor, assigned: true });
  expect((await db.seriesAssignment.findUniqueOrThrow({ where: { profileId_seriesId: { profileId: editor, seriesId: series } } })).canPublish).toBe(false);
  for (const role of ['admin', 'contributor', 'reader'] as const) {
    await db.profile.update({ where: { id: editor }, data: { role: 'editor', authVersion: 0 } });
    await db.seriesAssignment.upsert({ where: { profileId_seriesId: { profileId: editor, seriesId: series } }, create: { profileId: editor, seriesId: series }, update: {} });
    await grant(); expect((await actions.setUserRole(editor, role)).ok).toBe(true);
    expect(await db.seriesAssignment.count({ where: { profileId: editor, canPublish: true } })).toBe(0);
  }
  expect(await db.accountAudit.count({ where: { targetId: editor, action: 'series_publishing_permission_changed' } })).toBeGreaterThan(3);
});

test('trusted editor immediately approves and publishes own work once with exact series scope, audits and reader outbox', async () => {
  const r = await revision();
  await db.chapterEditorialEvent.create({ data: { chapterId: r.chapterId, revisionId: r.id, actorId: editor, action: 'update_draft' } });
  const elsewhere = await revision('review', second);
  await db.seriesAssignment.upsert({ where: { profileId_seriesId: { profileId: editor, seriesId: second } }, create: { profileId: editor, seriesId: second }, update: { canPublish: false } });
  await grant(false); setActor(editor); expect((await editorial.approveAndPublishRevision(input(r))).ok).toBe(false);
  await grant(); setActor(editor);
  expect((await editorial.approveAndPublishRevision(input(elsewhere))).ok).toBe(false);
  expect((await editorial.approveAndPublishRevision({ ...input(r), expectedVersion: r.version + 1 })).error).toBe('conflict');
  const result = await editorialActions.approveAndPublishRevisionAction(input(r)); expect(result.ok).toBe(true);
  expect(result.revision?.status).toBe('published'); expect(result.revision?.approvedById).toBe(editor);
  expect((await editorial.approveAndPublishRevision(input(r))).ok).toBe(false);
  expect(await db.chapterPublication.count({ where: { chapterId: r.chapterId } })).toBe(1);
  expect((await db.chapterEditorialEvent.findMany({ where: { revisionId: r.id, action: { in: ['approve_revision', 'publish_now'] } } })).map(e => e.action).sort()).toEqual(['approve_revision', 'publish_now']);
  const rows = await alerts(r.chapterId);
  for (const id of excluded) expect(rows.map(n => n.profileId)).not.toContain(id);
  expect(rows.map(n => n.profileId)).toContain(admin); expect(rows.map(n => n.profileId)).toContain(contributor);
  expect(rows.map(n => n.profileId)).not.toContain(editor); expect(rows.map(n => n.profileId)).not.toContain(other);
  for (const row of rows) { expect(row.type).toBe('system'); expect(row.publicationId).toBeNull(); expect(row.titleAr + row.bodyAr).not.toMatch(/عنوان خاص|اسم خاص|Private English/); }
});

test('delegation never permits standalone approval, scheduling, withdrawal, draft publishing or scheduled shortcut', async () => {
  await grant(); setActor(editor); const r = await revision('approved');
  for (const result of [await editorial.approveRevision(input(r)), await editorial.publishRevisionNow(input(r)), await editorial.scheduleRevision({ ...input(r), scheduledFor: new Date(Date.now() + 86400000) }), await editorial.cancelScheduledRevision(input(r)), await editorial.withdrawPublishedChapter({ chapterId: r.chapterId, reason: 'سبب' })]) expect(result.error).toBe('forbidden');
  expect((await editorial.returnForChanges({ ...input(r), reason: 'سبب' })).ok).toBe(false);
  for (const status of ['draft', 'scheduled'] as const) expect((await editorial.approveAndPublishRevision(input(await revision(status)))).ok).toBe(false);
});

test('latest revision, valid content and completed owned PDF media are required before any approval is committed', async () => {
  await grant(); setActor(editor);
  const stale = await revision(); await db.chapterRevision.create({ data: { chapterId: stale.chapterId, revisionNumber: 2, titleAr: 'أحدث' } });
  expect((await editorial.approveAndPublishRevision(input(stale))).error).toBe('conflict');
  const invalid = await revision(); await db.chapterRevision.update({ where: { id: invalid.id }, data: { novelBody: '' } });
  expect((await editorial.approveAndPublishRevision(input(invalid))).ok).toBe(false);
  const pending = await revision(); const upload = await db.chapterUpload.create({ data: { revisionId: pending.id, chapterId: pending.chapterId, createdById: editor, sourceName: 'pending.pdf', sourceBytes: 100, expectedPages: 1, revisionVersion: pending.version, expiresAt: new Date(Date.now() + 3600000) } }); await db.chapterRevision.update({ where: { id: pending.id }, data: { pendingUploadId: upload.id } });
  expect((await editorial.approveAndPublishRevision(input(pending))).error).toBe('upload_pending');
  const pdf = await revision(); await db.series.update({ where: { id: second }, data: { format: 'manga' } });
  await db.chapter.update({ where: { id: pdf.chapterId }, data: { seriesId: second } });
  await db.seriesAssignment.upsert({ where: { profileId_seriesId: { profileId: editor, seriesId: second } }, create: { profileId: editor, seriesId: second, canPublish: true }, update: { canPublish: true } });
  await db.chapterRevision.update({ where: { id: pdf.id }, data: { pagesJson: [{ pageIndex: 0, imagePath: '/api/media/forgedasset', width: 100, height: 100 }] } });
  expect((await editorial.approveAndPublishRevision(input(pdf))).error).toBe('invalid_media');
  for (const r of [stale, invalid, pending, pdf]) expect(await db.chapterEditorialEvent.count({ where: { revisionId: r.id } })).toBe(0);
});

async function revokeBeforeTx(work: () => Promise<unknown>, revoke: () => Promise<unknown>, actorId = editor) {
  const holder = globalThis as unknown as { prisma: typeof db }; const original = holder.prisma; let intercepted = false;
  holder.prisma = original.$extends({ query: { profile: { async findUnique({ args, query }) {
    const result = await query(args);
    // currentProfileOrNull is the preliminary account read, before the transaction.
    if (!intercepted && args.where.id === actorId) { intercepted = true; await revoke(); }
    return result;
  } } } }) as unknown as typeof db;
  try { const result = await work(); expect(intercepted).toBe(true); return result as { ok: boolean }; } finally { holder.prisma = original; }
}
test('fresh transaction rejects account, assignment and publishing-grant revocation after session authorization', async () => {
  for (const revoke of [
    () => db.profile.update({ where: { id: editor }, data: { disabledAt: new Date() } }),
    () => db.profile.update({ where: { id: editor }, data: { authVersion: 1 } }),
    () => db.profile.update({ where: { id: editor }, data: { emailVerifiedAt: null } }),
    () => db.profile.update({ where: { id: editor }, data: { role: 'contributor' } }),
    () => db.seriesAssignment.deleteMany({ where: { profileId: editor } }),
    () => db.seriesAssignment.updateMany({ where: { profileId: editor }, data: { canPublish: false } }),
  ]) {
    await db.profile.update({ where: { id: editor }, data: { role: 'editor', authVersion: 0, disabledAt: null, emailVerifiedAt: new Date() } });
    await db.seriesAssignment.upsert({ where: { profileId_seriesId: { profileId: editor, seriesId: series } }, create: { profileId: editor, seriesId: series, canPublish: true }, update: { canPublish: true } });
    const r = await revision(); setActor(editor);
    expect((await revokeBeforeTx(() => editorial.approveAndPublishRevision(input(r)), revoke)).ok).toBe(false);
    expect(await db.chapterPublication.count({ where: { chapterId: r.chapterId } })).toBe(0);
  }
});

test('approved edits atomically invalidate approval and notify only active admins', async () => {
  const r = await revision('approved'); setActor(contributor);
  const result = await editorial.updateDraftSnapshot({ ...input(r), novelBody: 'تعديل بعد الاعتماد' });
  expect(result.revision?.status).toBe('draft'); expect(result.revision?.approvedById).toBeNull();
  const rows = await alerts(r.chapterId); expect(rows.map(n => n.profileId)).toContain(admin);
  expect(rows.map(n => n.profileId)).not.toContain(editor); expect(rows.map(n => n.profileId)).not.toContain(contributor);
});

test('notification failure rolls back combined approval, projection, audits and reader publication', async () => {
  const r = await revision(); await grant(); setActor(editor);
  await db.$executeRawUnsafe(`CREATE FUNCTION publisher_notification_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'notification insertion failure'; END; $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER publisher_notification_fail BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION publisher_notification_fail()`);
  try { await expect(editorial.approveAndPublishRevision(input(r))).rejects.toThrow(); }
  finally { await db.$executeRawUnsafe(`DROP TRIGGER publisher_notification_fail ON "Notification"`); await db.$executeRawUnsafe(`DROP FUNCTION publisher_notification_fail()`); }
  expect((await db.chapterRevision.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('review');
  expect((await db.chapter.findUniqueOrThrow({ where: { id: r.chapterId } })).workflow).toBe('draft');
  expect(await db.chapterEditorialEvent.count({ where: { revisionId: r.id } })).toBe(0);
  expect(await db.chapterPublication.count({ where: { chapterId: r.chapterId } })).toBe(0);
});


test('grant cleanup permits changed target roles; stale admin authentication cannot grant', async () => {
  await grant();
  await db.profile.update({ where: { id: editor }, data: { role: 'reader' } });
  expect((await grant(false)).ok).toBe(true);
  expect((await grant()).ok).toBe(false);
  await db.profile.update({ where: { id: editor }, data: { role: 'editor' } });
  setActor(admin);
  try {
    expect((await revokeBeforeTx(() => actions.setSeriesPublishingPermission({ seriesId: series, profileId: editor, canPublish: true }), () => db.profile.update({ where: { id: admin }, data: { authVersion: 1 } }), admin)).ok).toBe(false);
    expect((await db.seriesAssignment.findUniqueOrThrow({ where: { profileId_seriesId: { profileId: editor, seriesId: series } } })).canPublish).toBe(false);
  } finally { await db.profile.update({ where: { id: admin }, data: { authVersion: 0 } }); }
});

test('admin combined publication accepts draft, review, requested changes and approved but never scheduled', async () => {
  setActor(admin);
  for (const status of ['draft', 'review', 'approved'] as const) expect((await editorial.approveAndPublishRevision(input(await revision(status)))).ok).toBe(true);
  const changes = await revision(); await db.chapterRevision.update({ where: { id: changes.id }, data: { status: 'changes_requested' } });
  expect((await editorial.approveAndPublishRevision(input(changes))).ok).toBe(true);
  expect((await editorial.approveAndPublishRevision(input(await revision('scheduled')))).ok).toBe(false);
});

test('schedule, cancellation, system publication and withdrawal notify active staff once per transition with private previews', async () => {
  const r = await revision('approved'); setActor(admin);
  const admins = (await db.profile.findMany({ where: { role: 'admin', disabledAt: null, emailVerifiedAt: { not: null } }, select: { id: true } })).map(p => p.id);
  let seen = new Set<string>();
  async function check(expected: string[]) {
    const rows = await alerts(r.chapterId); const fresh = rows.filter(n => !seen.has(n.id));
    expect(fresh.map(n => n.profileId).sort()).toEqual(expected.sort());
    for (const n of fresh) {
      expect(n.type).toBe('system'); expect(n.publicationId).toBeNull();
      expect(n.titleAr + n.bodyAr).not.toMatch(/عنوان خاص|اسم خاص|Private English|سبب خاص/);
    }
    seen = new Set(rows.map(n => n.id));
  }
  const staff = [editor, contributor, ...admins.filter(id => id !== admin)];
  const scheduled = await editorial.scheduleRevision({ ...input(r), scheduledFor: new Date(Date.now() + 86400000) }); expect(scheduled.ok).toBe(true); await check(staff);
  const cancelled = await editorial.cancelScheduledRevision(input(scheduled.revision!)); expect(cancelled.ok).toBe(true); await check(staff);
  const rescheduled = await editorial.scheduleRevision({ ...input(cancelled.revision!), scheduledFor: new Date(Date.now() + 86400000) }); expect(rescheduled.ok).toBe(true); await check(staff);
  await db.chapterRevision.update({ where: { id: r.id }, data: { scheduledFor: new Date(Date.now() - 1000) } });
  expect((await editorial.executeDuePublications(1, { system: true })).publishedCount).toBe(1); await check([editor, contributor, ...admins]);
  expect((await editorial.executeDuePublications(1, { system: true })).publishedCount).toBe(0); await check([]);
  const published = await db.chapterRevision.findUniqueOrThrow({ where: { id: r.id } });
  expect((await editorial.withdrawPublishedChapter({ chapterId: r.chapterId, expectedRevisionId: r.id, expectedVersion: published.version, reason: 'سبب خاص' })).ok).toBe(true); await check(staff);
});

test('PDF replacement invalidates approval with atomic admin notification and blocks active scheduled upload mutation', async () => {
  const r = await revision('approved');
  await db.series.update({ where: { id: second }, data: { format: 'manga' } });
  await db.chapter.update({ where: { id: r.chapterId }, data: { seriesId: second } });
  await db.seriesAssignment.upsert({ where: { profileId_seriesId: { profileId: editor, seriesId: second } }, create: { profileId: editor, seriesId: second }, update: {} });
  // Previous intentionally pending fixture uploads should not consume this actor's start quota.
  await db.chapterUpload.updateMany({ where: { createdById: editor, state: { in: ['uploading', 'failed'] } }, data: { state: 'cancelled' } });
  setActor(editor); const old = process.env.MEDIA_UPLOADS_ENABLED; process.env.MEDIA_UPLOADS_ENABLED = '1';
  try {
    const result = await startUpload({ ...input(r), sourceName: 'replacement.pdf', sourceBytes: 100, pageCount: 1 }); expect(result.ok).toBe(true);
    const updated = await db.chapterRevision.findUniqueOrThrow({ where: { id: r.id } });
    expect(updated.status).toBe('draft'); expect(updated.approvedAt).toBeNull();
    const rows = await alerts(r.chapterId); expect(rows.map(n => n.profileId)).toContain(admin); expect(rows.map(n => n.profileId)).not.toContain(editor);
    await db.chapterRevision.update({ where: { id: r.id }, data: { status: 'scheduled' } });
    const { cancelUpload, uploadStatus } = await import('../../src/lib/media/uploads');
    expect((await uploadStatus(updated.pendingUploadId!)).ok).toBe(true);
    expect((await cancelUpload(updated.pendingUploadId!, updated.version)).error).toBe('scheduled_locked');
  } finally { if (old === undefined) delete process.env.MEDIA_UPLOADS_ENABLED; else process.env.MEDIA_UPLOADS_ENABLED = old; }
});


test('concurrent trusted editor approved publication commits one approval/publication pair and one alert per recipient', async () => {
  const r = await revision('approved'); await grant();
  const results = await Promise.all([
    withActor(editor, () => editorial.approveAndPublishRevision(input(r))),
    withActor(editor, () => editorial.approveAndPublishRevision(input(r))),
  ]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(await db.chapterEditorialEvent.count({ where: { revisionId: r.id } })).toBe(2);
  expect(await db.chapterPublication.count({ where: { chapterId: r.chapterId } })).toBe(1);
  const rows = await alerts(r.chapterId); expect(new Set(rows.map(row => row.profileId)).size).toBe(rows.length);
});

test('notification failure rolls back approval invalidation when staff edits approved content', async () => {
  const r = await revision('approved'); setActor(contributor);
  await db.$executeRawUnsafe(`CREATE FUNCTION publisher_invalidation_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'notification insertion failure'; END; $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER publisher_invalidation_fail BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION publisher_invalidation_fail()`);
  try { await expect(editorial.updateDraftSnapshot({ ...input(r), novelBody: 'تعديل خاص' })).rejects.toThrow(); }
  finally { await db.$executeRawUnsafe(`DROP TRIGGER publisher_invalidation_fail ON "Notification"`); await db.$executeRawUnsafe(`DROP FUNCTION publisher_invalidation_fail()`); }
  const after = await db.chapterRevision.findUniqueOrThrow({ where: { id: r.id } });
  expect(after.status).toBe('approved'); expect(after.version).toBe(r.version); expect(after.approvedById).toBe(admin);
  expect(after.novelBody).toBe(r.novelBody);
  expect(await db.chapterEditorialEvent.count({ where: { revisionId: r.id } })).toBe(0);
});
