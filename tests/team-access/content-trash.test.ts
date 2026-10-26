import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { db, setActor } from './session-fixture';
const storageModule = await import('../../src/lib/media/storage');
let failDeletes = false;
const removed: string[] = [];
mock.module('../../src/lib/media/storage', () => ({ ...storageModule, getMediaStorage: async () => ({
  deleteObject: async (key: string) => { if (failDeletes) throw new Error('R2 unavailable'); removed.push(key); },
  listObjects: async () => ({ keys: [] }),
}) }));
const service = await import('../../src/lib/content-trash/service');
const tag = `trash-test-${crypto.randomUUID()}`;
let adminId: string, editorId: string;
const roots: string[] = [];
beforeAll(async () => {
  for (const role of ['admin', 'editor'] as const) {
    const profile = await db.profile.create({ data: { email: `${tag}-${role}@bunny.test`, nickname: `Trash ${role}`, role, passwordHash: 'x', emailVerifiedAt: new Date() } });
    if (role === 'admin') adminId = profile.id; else editorId = profile.id;
  }
});
afterAll(async () => {
  setActor(null);
  await db.contentTrash.deleteMany({ where: { seriesId: { in: roots } } });
  await db.series.deleteMany({ where: { id: { in: roots } } });
  await db.profile.deleteMany({ where: { id: { in: [adminId, editorId] } } });
});
async function root() {
  const series = await db.series.create({ data: { slug: `${tag}-${roots.length}`, titleAr: 'عمل', titleOriginal: 'English title', synopsisAr: 'اختبار', author: 'Test', format: 'novel', coverPath: '/art/covers/keep.webp' } }); roots.push(series.id);
  const chapters = await Promise.all([1, 2].map(number => db.chapter.create({ data: { seriesId: series.id, number, titleAr: `فصل ${number}`, novelBody: 'Body', workflow: 'published', publishedAt: new Date() } })));
  return { series, chapters };
}
async function trash(kind: 'series' | 'chapter', id: string) {
  const preview = await service.getTrashPreview(kind, id); expect(preview.ok).toBe(true); expect(preview.data).not.toBeNull();
  const result = await service.moveToTrash({ kind, id, expectedUpdatedAt: preview.data!.updatedAt, confirmation: preview.data!.confirmation }); expect(result.ok).toBe(true); return result.id!;
}
test('fresh admin authorization, English confirmation and stale updates', async () => {
  const { series } = await root(); setActor(editorId);
  expect((await service.getTrashPreview('series', series.id)).error).toBe('forbidden');
  expect((await service.listTrash()).error).toBe('forbidden');
  expect((await service.moveToTrash({kind:'series',id:series.id,expectedUpdatedAt:series.updatedAt.toISOString(),confirmation:'English title'})).error).toBe('forbidden');
  expect((await service.restoreTrash({id:'missing',expectedVersion:1})).error).toBe('forbidden');
  expect((await service.requestPermanentDelete({id:'missing',expectedVersion:1,confirmation:'x'})).error).toBe('forbidden');
  setActor(adminId);
  const preview = (await service.getTrashPreview('series', series.id)).data!;
  expect(preview.title).toBe('English title');
  expect((await service.moveToTrash({ kind: 'series', id: series.id, expectedUpdatedAt: preview.updatedAt, confirmation: 'عمل' })).error).toBe('confirmation_mismatch');
  await db.series.update({ where: { id: series.id }, data: { synopsisAr: 'Changed' } });
  expect((await service.moveToTrash({ kind: 'series', id: series.id, expectedUpdatedAt: preview.updatedAt, confirmation: preview.confirmation })).error).toBe('conflict');
  await db.profile.update({ where: { id: adminId }, data: { role: 'editor' } });
  expect((await service.getTrashPreview('series', series.id)).ok).toBe(false);
  await db.profile.update({ where: { id: adminId }, data: { role: 'admin' } });
});
test('series restore affects only its own batch and restores drafts', async () => {
  setActor(adminId); const { series, chapters } = await root();
  const historical = await db.chapterRevision.create({data:{chapterId:chapters[1].id,revisionNumber:1,titleAr:'Published history',novelBody:'Preserved body',status:'published',approvedAt:new Date()}});
  const independent = await trash('chapter', chapters[0].id);
  const parent = await trash('series', series.id);
  expect((await service.restoreTrash({ id: independent, expectedVersion: 1 })).error).toBe('parent_unavailable');
  expect((await service.restoreTrash({ id: parent, expectedVersion: 2 })).error).toBe('conflict');
  expect((await service.restoreTrash({ id: parent, expectedVersion: 1 })).ok).toBe(true);
  const first = await db.chapter.findUniqueOrThrow({ where: { id: chapters[0].id } });
  const second = await db.chapter.findUniqueOrThrow({ where: { id: chapters[1].id } });
  expect(first.deletedAt).not.toBeNull(); expect(second.deletedAt).toBeNull(); expect(second.workflow).toBe('draft'); expect(second.publishedAt).toBeNull();
  const old = await db.chapterRevision.findUniqueOrThrow({where:{id:historical.id}});
  expect(old.status).toBe('published'); expect(old.approvedAt).not.toBeNull();
  const working = await db.chapterRevision.findFirstOrThrow({where:{chapterId:chapters[1].id},orderBy:{revisionNumber:'desc'}});
  expect(working.status).toBe('draft');expect(working.revisionNumber).toBe(2);expect(working.novelBody).toBe('Preserved body');
  expect((await service.restoreTrash({ id: independent, expectedVersion: 1 })).ok).toBe(true);
});
test('file-first retry retains rows; shared references block every deletion; audit survives', async () => {
  setActor(adminId); const { series, chapters } = await root();
  const revision = await db.chapterRevision.create({ data: { chapterId: chapters[0].id, revisionNumber: 1, titleAr: 'فصل' } });
  const upload = await db.chapterUpload.create({ data: { chapterId: chapters[0].id, revisionId: revision.id, createdById: adminId, sourceName: 'source.pdf', sourceBytes: 5, expectedPages: 1, revisionVersion: 1, expiresAt: new Date(), state: 'ready' } });
  const assetId = crypto.randomUUID().replaceAll('-','');
  const asset = await db.mediaAsset.create({ data: { id:assetId, uploadId: upload.id, chapterId: chapters[0].id, pageIndex: 0, objectKey: `media/${process.env.MEDIA_STORAGE_PREFIX}/${upload.id}/${assetId}.jpg`, mime: 'image/jpeg', bytes: 5 } });
  const shared = await db.chapterPage.create({ data: { chapterId: chapters[1].id, pageIndex: 0, imagePath: `/api/media/${asset.id}`, width: 1, height: 1 } });
  const id = await trash('chapter', chapters[0].id);
  expect((await service.requestPermanentDelete({ id, expectedVersion: 1, confirmation: 'English title — الفصل 1' })).ok).toBe(true);
  const future = new Date(Date.now() + 40 * 86400000), before = removed.length;
  await service.maintainContentTrash({ now: future });
  expect(removed.length).toBe(before); expect((await db.contentTrash.findUniqueOrThrow({ where: { id } })).errorCode).toBe('shared_reference');
  await db.chapterPage.delete({ where: { id: shared.id } }); failDeletes = true;
  await service.maintainContentTrash({ now: future });
  expect(await db.chapter.findUnique({ where: { id: chapters[0].id } })).not.toBeNull();
  expect((await db.contentTrash.findUniqueOrThrow({ where: { id } })).errorCode).toBe('storage_failed');
  failDeletes = false;
  await service.maintainContentTrash({ now: future });
  expect(await db.chapter.findUnique({ where: { id: chapters[0].id } })).toBeNull();
  expect(removed).toContain(asset.objectKey);
  const audit = await db.contentTrash.findUniqueOrThrow({ where: { id } }); expect(audit.state).toBe('purged'); expect(audit.activeKey).toBeNull();
  expect(await db.profile.findUnique({ where: { id: adminId } })).not.toBeNull();
  expect(await db.series.findUnique({ where: { id: series.id } })).not.toBeNull();
});
test('file-free chapter completes immediately without storage', async () => {
  setActor(adminId); const { chapters } = await root();
  const id = await trash('chapter', chapters[0].id);
  expect((await service.requestPermanentDelete({ id, expectedVersion: 1, confirmation: 'English title — الفصل 1' })).ok).toBe(true);
  await service.maintainContentTrash();
  expect((await db.contentTrash.findUniqueOrThrow({ where: { id } })).state).toBe('purged');
});

test('early media purge waits for late PUT grace and cannot be restored', async () => {
  setActor(adminId); const { chapters } = await root();
  const revision = await db.chapterRevision.create({ data: { chapterId: chapters[0].id, revisionNumber: 1, titleAr: 'Draft' } });
  const upload = await db.chapterUpload.create({ data: { chapterId: chapters[0].id, revisionId: revision.id, createdById: adminId, sourceName: 'source.pdf', sourceBytes: 5, expectedPages: 1, revisionVersion: 1, expiresAt: new Date(Date.now() + 3600000) } });
  const sourceId=crypto.randomUUID().replaceAll('-','');
  await db.mediaAsset.create({ data: { id:sourceId, uploadId: upload.id, chapterId: chapters[0].id, pageIndex: -1, objectKey: `media/${process.env.MEDIA_STORAGE_PREFIX}/${upload.id}/${sourceId}.pdf`, mime: 'application/pdf', bytes: 5 } });
  const id = await trash('chapter', chapters[0].id);
  expect((await db.chapterUpload.findUniqueOrThrow({ where: { id: upload.id } })).state).toBe('cancelled');
  expect((await service.requestPermanentDelete({ id, expectedVersion: 1, confirmation: 'English title — الفصل 1' })).ok).toBe(true);
  const before = removed.length;
  await service.maintainContentTrash();
  expect(removed.length).toBe(before);
  const journal = await db.contentTrash.findUniqueOrThrow({ where: { id } });
  expect(journal.state).toBe('purging');
  expect((await service.restoreTrash({ id, expectedVersion: journal.version })).error).toBe('conflict');
  expect(await db.chapter.findUnique({ where: { id: chapters[0].id } })).not.toBeNull();
});

test('series purge preserves requests/accounts, removes owned analytics, and keeps audit history',async()=>{
 setActor(adminId);const {series,chapters}=await root();
 const request=await db.contentRequest.create({data:{profileId:adminId,title:'Requested work',category:'novel',normalizedTitle:crypto.randomUUID(),submissionId:crypto.randomUUID(),status:'available',fulfilledSeriesId:series.id}});
 const event=await db.analyticsEvent.create({data:{type:'read_start',profileId:adminId,seriesId:series.id,chapterId:chapters[0].id}});
 const login=await db.analyticsEvent.create({data:{type:'login',profileId:adminId}});
 const id=await trash('series',series.id);expect((await service.requestPermanentDelete({id,expectedVersion:1,confirmation:'English title'})).ok).toBe(true);
 await Promise.all([service.maintainContentTrash(),service.maintainContentTrash()]);
 expect(await db.series.findUnique({where:{id:series.id}})).toBeNull();
 expect((await db.contentRequest.findUniqueOrThrow({where:{id:request.id}})).fulfilledSeriesId).toBeNull();
 expect(await db.analyticsEvent.findUnique({where:{id:event.id}})).toBeNull();
 expect(await db.analyticsEvent.findUnique({where:{id:login.id}})).not.toBeNull();
 expect(await db.profile.findUnique({where:{id:adminId}})).not.toBeNull();
 expect((await service.listTrash()).data.find(item=>item.id===id)?.state).toBe('purged');
});

test('unexpected object ownership blocks cleanup without deleting bytes',async()=>{
 setActor(adminId);const {chapters}=await root();
 const revision=await db.chapterRevision.create({data:{chapterId:chapters[0].id,revisionNumber:1,titleAr:'Draft'}});
 const upload=await db.chapterUpload.create({data:{chapterId:chapters[0].id,revisionId:revision.id,createdById:adminId,sourceName:'test.pdf',sourceBytes:5,expectedPages:1,revisionVersion:1,expiresAt:new Date()}});
 await db.mediaAsset.create({data:{uploadId:upload.id,chapterId:chapters[0].id,pageIndex:0,objectKey:'media/qa/another-owner/foreign.jpg',mime:'image/jpeg',bytes:5}});
 const id=await trash('chapter',chapters[0].id),before=removed.length;
 await service.requestPermanentDelete({id,expectedVersion:1,confirmation:'English title — الفصل 1'});
 await service.maintainContentTrash({now:new Date(Date.now()+40*86400000)});
 expect(removed.slice(before)).not.toContain('media/qa/another-owner/foreign.jpg');expect(await db.chapter.findUnique({where:{id:chapters[0].id}})).not.toBeNull();
 expect((await db.contentTrash.findUniqueOrThrow({where:{id}})).errorCode).toBe('unsafe_object');
});
