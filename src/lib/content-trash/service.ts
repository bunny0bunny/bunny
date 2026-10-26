import 'server-only';
import { Prisma, type ContentTrash } from '@prisma/client';
import { db } from '@/lib/db';
import { withSerializableTx } from '@/lib/editorial';
import { getWorkTitle } from '@/lib/work-title';
import { getMediaStorage, validateMediaKey } from '@/lib/media/storage';
import { currentCoverKey } from '@/lib/media/cover-policy';
import { TRASH_RETENTION_MS, LATE_WRITE_GRACE_MS, bounded, validKind, parseObjects } from './policy';
import type { TrashKind, TrashPreview, TrashItem, TrashResult, MoveToTrashInput, RestoreTrashInput, PermanentDeleteInput } from './contracts';
type Tx = Prisma.TransactionClient;
const fail = (error: string): {ok: false; error: string; data?: unknown} => ({ ok: false, error });
const json = (value: unknown) => value as Prisma.InputJsonValue;
function details(row: ContentTrash): Record<string, unknown> { return row.detailsJson && typeof row.detailsJson === 'object' && !Array.isArray(row.detailsJson) ? row.detailsJson as Record<string, unknown> : {}; }
async function chapterIds(tx: Tx, row: ContentTrash) { return (await tx.chapter.findMany({ where: row.entityType === 'series' ? { seriesId: row.entityId } : { id: row.entityId }, select: { id: true } })).map(c => c.id); }
async function invalidate(tx: Tx, ids: string[]) {
  await tx.chapterRevision.updateMany({ where: { chapterId: { in: ids } }, data: { scheduledFor: null, pendingUploadId: null, version: { increment: 1 } } });
  // Published snapshots remain historical evidence. Pending review/approval is
  // withdrawn; restoration creates a new working draft rather than rewriting history.
  await tx.chapterRevision.updateMany({ where: { chapterId: { in: ids }, status: { not: 'published' } }, data: { status: 'withdrawn', approvedAt: null, approvedById: null } });
  await tx.chapterUpload.updateMany({ where: { chapterId: { in: ids }, state: { in: ['uploading', 'failed'] } }, data: { state: 'cancelled', errorCode: 'content_trashed' } });
}
async function preview(tx: Tx, kind: TrashKind, id: string): Promise<TrashPreview | null> {
  const root = kind === 'series' ? await tx.series.findUnique({ where: { id } }) : await tx.chapter.findUnique({ where: { id }, include: { series: { select: { deletedAt: true, titleAr: true, titleOriginal: true } } } });
  if (!root || root.deletedAt || ('series' in root && root.series.deletedAt)) return null;
  const children = await tx.chapter.findMany({ where: kind === 'series' ? { seriesId: id } : { id }, select: { id: true, workflow: true } });
  const ids = children.map(c => c.id);
  const [uploadCount, assets] = await Promise.all([tx.chapterUpload.count({ where: { chapterId: { in: ids } } }), tx.mediaAsset.aggregate({ where: { chapterId: { in: ids } }, _sum: { bytes: true } })]);
  const confirmation = kind === 'series' ? getWorkTitle(root as { titleAr: string; titleOriginal?: string | null }) : `الفصل ${(root as { number: number }).number}`;
  const title = 'series' in root ? `${getWorkTitle(root.series)} — ${confirmation}` : confirmation;
  return { kind, id, title, confirmation, updatedAt: root.updatedAt.toISOString(), chapterCount: ids.length, publishedCount: children.filter(c => c.workflow === 'published').length, uploadCount, bytes: assets._sum.bytes ?? 0 };
}
export async function getTrashPreview(kind: TrashKind, id: string): Promise<{ ok: boolean; error?: string; data: TrashPreview | null }> {
  if (!validKind(kind) || typeof id !== 'string') return { ...fail('invalid_input'), data: null };
  const result = await withSerializableTx(async (tx, actor) => actor.role !== 'admin' ? fail('forbidden') : { ok: true, data: await preview(tx, kind, id) }, { invalidate: false });
  return { ok: result.ok, error: result.error, data: (result.data as TrashPreview | null | undefined) ?? null };
}
export async function listTrash(): Promise<{ ok: boolean; error?: string; data: TrashItem[] }> {
  const result = await withSerializableTx(async (tx, actor) => {
    if (actor.role !== 'admin') return fail('forbidden');
    const [active, history] = await Promise.all([
      tx.contentTrash.findMany({where:{state:{in:['trashed','purging']}},orderBy:{deletedAt:'desc'},take:500}),
      tx.contentTrash.findMany({where:{state:{in:['restored','purged']}},orderBy:{updatedAt:'desc'},take:30}),
    ]);
    const rows = [...active, ...history];
    const parents = await tx.series.findMany({ where: { id: { in: rows.filter(r => r.entityType === 'chapter' && r.seriesId).map(r => r.seriesId!) } }, select: { id: true, deletedAt: true } });
    const byParent = new Map(parents.map(parent => [parent.id, parent]));
    const data: TrashItem[] = [];
    for (const row of rows) { const d = details(row); const parent = row.seriesId ? byParent.get(row.seriesId) : null;
      const objects = parseObjects(row.objectsJson);
      const lastActor = row.state === 'restored' ? d.restoredByName : row.state === 'purged' ? d.purgeRequestedByName ?? 'النظام' : d.deletedByName;
      data.push({ id: row.id, kind: row.entityType as TrashKind, entityId: row.entityId, seriesId: row.seriesId, title: row.title, deletedByName: typeof d.deletedByName === 'string' ? d.deletedByName : null, deletedAt: row.deletedAt.toISOString(), purgeAfter: row.purgeAfter.toISOString(), state: row.state as TrashItem['state'], version: row.version, chapterCount: Number(d.chapterCount ?? 0), bytes: Number(d.bytes ?? 0), purgeNotBefore: typeof d.purgeNotBefore === 'string' ? d.purgeNotBefore : (row.state === 'purging' && Number(d.bytes ?? 0) > 0 ? new Date(row.deletedAt.getTime() + LATE_WRITE_GRACE_MS).toISOString() : null), errorCode: row.errorCode, parentUnavailable: row.entityType === 'chapter' && (!parent || Boolean(parent.deletedAt)), filesDeleted: objects.filter(o=>o.deleted).length, filesTotal:objects.length, restoredAt:row.restoredAt?.toISOString()??null,purgedAt:row.purgedAt?.toISOString()??null,lastActionByName:typeof lastActor==='string'?lastActor:null }); }
    return { ok: true, data };
  }, { invalidate: false });
  return { ok: result.ok, error: result.error, data: result.ok ? result.data as TrashItem[] : [] };
}
export async function moveToTrash(input: MoveToTrashInput): Promise<TrashResult> {
  if (!input || !validKind(input.kind) || typeof input.id !== 'string') return fail('invalid_input');
  const result = await withSerializableTx(async (tx, actor) => {
    if (actor.role !== 'admin') return fail('forbidden');
    const p = await preview(tx, input.kind, input.id); if (!p) return fail('not_found');
    if (p.updatedAt !== input.expectedUpdatedAt) return fail('conflict');
    if (p.confirmation !== input.confirmation) return fail('confirmation_mismatch');
    if (await tx.chapterUpload.count({ where: { chapter: input.kind === 'series' ? { seriesId: input.id } : { id: input.id }, sourceDeletingAt: { not: null }, sourceDeletedAt: null } })) return fail('cleanup_in_progress');
    const now = new Date();
    const parent = input.kind === 'chapter' ? await tx.chapter.findUniqueOrThrow({ where: { id: input.id }, select: { seriesId: true } }) : null;
    const row = await tx.contentTrash.create({ data: { activeKey: `${input.kind}:${input.id}`, entityType: input.kind, entityId: input.id, seriesId: parent?.seriesId ?? input.id, title: p.title, deletedById: actor.id, deletedAt: now, purgeAfter: new Date(now.getTime() + TRASH_RETENTION_MS), detailsJson: { chapterCount: p.chapterCount, bytes: p.bytes, deletedByName: actor.nickname } } });
    if (input.kind === 'series') await tx.series.update({ where: { id: input.id }, data: { deletedAt: now, trashBatchId: row.id } });
    const where = input.kind === 'series' ? { seriesId: input.id, deletedAt: null } : { id: input.id, deletedAt: null };
    const ids = (await tx.chapter.findMany({ where, select: { id: true } })).map(c => c.id);
    await tx.chapter.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now, trashBatchId: row.id, workflow: 'draft', scheduledFor: null, publishedAt: null } });
    await invalidate(tx, ids);
    await tx.contentTrash.update({ where: { id: row.id }, data: { detailsJson: { chapterCount: p.chapterCount, bytes: p.bytes, deletedByName: actor.nickname, chapterIds: ids } } });
    return { ok: true, data: { id: row.id } };
  });
  return { ok: result.ok, error: result.error, ...(result.ok ? result.data as { id: string } : {}) };
}
export async function restoreTrash(input: RestoreTrashInput): Promise<TrashResult> {
  if (!input || typeof input.id !== 'string' || !Number.isInteger(input.expectedVersion)) return fail('invalid_input');
  return withSerializableTx(async (tx, actor) => {
    if (actor.role !== 'admin') return fail('forbidden');
    const row = await tx.contentTrash.findUnique({ where: { id: input.id } });
    if (!row) return fail('not_found'); if (row.state !== 'trashed' || row.version !== input.expectedVersion) return fail('conflict');
    if (row.entityType === 'chapter') { const parent = await tx.series.findUnique({ where: { id: row.seriesId! } }); if (!parent || parent.deletedAt) return fail('parent_unavailable'); }
    const ids = (await tx.chapter.findMany({ where: { trashBatchId: row.id }, select: { id: true } })).map(c => c.id);
    await invalidate(tx, ids);
    for (const chapterId of ids) {
      const latest = await tx.chapterRevision.findFirst({ where: { chapterId }, orderBy: { revisionNumber: 'desc' } });
      if (latest) await tx.chapterRevision.create({ data: {
        chapterId, revisionNumber: latest.revisionNumber + 1, status: 'draft', titleAr: latest.titleAr,
        readingDirection: latest.readingDirection, isPremiumDemo: latest.isPremiumDemo,
        novelBody: latest.novelBody, pagesJson: latest.pagesJson as Prisma.InputJsonValue,
      } });
    }
    await tx.chapter.updateMany({ where: { trashBatchId: row.id }, data: { deletedAt: null, trashBatchId: null, workflow: 'draft', publishedAt: null, scheduledFor: null } });
    if (row.entityType === 'series') await tx.series.updateMany({ where: { id: row.entityId, trashBatchId: row.id }, data: { deletedAt: null, trashBatchId: null } });
    await tx.contentTrash.update({ where: { id: row.id }, data: { activeKey: null, state: 'restored', restoredAt: new Date(), detailsJson: json({...details(row), restoredByName: actor.nickname}), version: { increment: 1 } } });
    return { ok: true };
  });
}
export async function requestPermanentDelete(input: PermanentDeleteInput): Promise<TrashResult> {
  if (!input || typeof input.id !== 'string' || !Number.isInteger(input.expectedVersion)) return fail('invalid_input');
  return withSerializableTx(async (tx, actor) => {
    if (actor.role !== 'admin') return fail('forbidden');
    const row = await tx.contentTrash.findUnique({ where: { id: input.id } }); if (!row) return fail('not_found');
    if (!['trashed','purging'].includes(row.state) || row.version !== input.expectedVersion) return fail('conflict');
    if (input.confirmation !== row.title) return fail('confirmation_mismatch');
    if (row.state === 'purging') { await tx.contentTrash.update({where:{id:row.id},data:{errorCode:null,version:{increment:1}}}); return {ok:true}; }
    await tx.contentTrash.update({ where: { id: row.id }, data: { state: 'purging', purgeStartedAt: new Date(), purgeAfter: new Date(), detailsJson: json({...details(row), purgeRequestedByName: actor.nickname}), version: { increment: 1 } } });
    return { ok: true };
  });
}
// Object deletion is intentionally outside transactions. A short persisted lease prevents
// overlapping workers from advancing one journal while another deletes its manifest.
async function sharedReferences(tx: Tx, ids: string[], seriesId: string | null, keys: string[]) {
  const assets = await tx.mediaAsset.findMany({ where: { chapterId: { in: ids } }, select: { id: true } });
  const paths = assets.map(a => `/api/media/${a.id}`);
  for (const key of keys) { const match = /\/covers-([^/]+)\/(.+)$/.exec(key); if (match) paths.push(`/api/covers/${match[1]}/${match[2]}`); }
  if (!paths.length) return false;
  if (await tx.chapterPage.count({ where: { chapterId: { notIn: ids }, OR: paths.map(path => ({imagePath: {contains: path}})) } })) return true;
  if (await tx.series.count({ where: { ...(seriesId ? { id: { not: seriesId } } : {}), OR: paths.map(path => ({coverPath: {contains: path}})) } })) return true;
  // Historical revision snapshots can still be restored, including on other trashed work.
  const revisions = await tx.chapterRevision.findMany({ where: { chapterId: { notIn: ids } }, select: { pagesJson: true, novelBody: true } });
  if (revisions.some(r => paths.some(path => JSON.stringify(r.pagesJson).includes(path) || r.novelBody?.includes(path)))) return true;
  return Boolean(await tx.chapter.count({ where: { id: { notIn: ids }, OR: paths.map(path => ({ novelBody: { contains: path } })) } }));
}
export async function maintainContentTrash(options: { limit?: number; objectLimit?: number; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const limit = bounded(options.limit, 5, 50), objectLimit = bounded(options.objectLimit, 100, 500);
  const summary = { examined: 0, deleted: 0, failed: 0, skipped: 0 };
  const candidates = await db.contentTrash.findMany({ where: { OR: [{ state: 'trashed', purgeAfter: { lte: now } }, { state: 'purging' }] }, orderBy: { updatedAt: 'asc' }, take: limit, select: { id: true } });
  let remaining = objectLimit;
  for (const candidate of candidates) {
    summary.examined++;
    const token = crypto.randomUUID();
    const claimed = await withSerializableTx(async tx => {
      const row = await tx.contentTrash.findUnique({ where: { id: candidate.id } });
      if (!row || !['trashed', 'purging'].includes(row.state) || (row.state === 'trashed' && row.purgeAfter > now)) return fail('skipped');
      const root = row.entityType === 'series' ? await tx.series.findUnique({where:{id:row.entityId},select:{deletedAt:true,trashBatchId:true}}) : await tx.chapter.findUnique({where:{id:row.entityId},select:{deletedAt:true,trashBatchId:true}});
      if (!root?.deletedAt || root.trashBatchId !== row.id) {
        await tx.contentTrash.update({where:{id:row.id},data:{errorCode:'target_changed',version:{increment:1}}});
        return fail('target_changed');
      }
      const d = details(row);
      if (typeof d.leaseUntil === 'string' && new Date(d.leaseUntil) > now) return fail('skipped');
      const ids = await chapterIds(tx, row);
      const assets = await tx.mediaAsset.findMany({ where: { chapterId: { in: ids } }, select: { id: true, uploadId: true, objectKey: true, mime: true } });
      const objects = parseObjects(row.objectsJson);
      const prefix = process.env.MEDIA_STORAGE_PREFIX || 'prod';
      for (const asset of assets) {
        const extension = ({'application/pdf':'pdf','image/webp':'webp','image/jpeg':'jpg'} as Record<string,string>)[asset.mime];
        if (!extension || asset.objectKey !== `media/${prefix}/${asset.uploadId}/${asset.id}.${extension}`) throw new Error('unsafe_object');
        validateMediaKey(asset.objectKey);
        if (!objects.some(o => o.key === asset.objectKey)) objects.push({ key: asset.objectKey, deleted: false });
      }
      const cover = row.entityType === 'series' ? await tx.series.findUnique({ where: { id: row.entityId }, select: { coverPath: true } }) : null;
      const file = cover?.coverPath.split('/').pop();
      const key = file && cover ? currentCoverKey(row.entityId, file, cover.coverPath, prefix) : null;
      if (key && !objects.some(o => o.key === key)) objects.push({ key, deleted: false });
      const uploads = await tx.chapterUpload.findMany({ where: { chapterId: { in: ids } }, select: { expiresAt: true } });
      const notBefore = objects.length || uploads.length ? Math.max(row.deletedAt.getTime() + LATE_WRITE_GRACE_MS, ...uploads.map(u => u.expiresAt.getTime() + 3600000)) : row.deletedAt.getTime();
      if (await sharedReferences(tx, ids, row.entityType === 'series' ? row.entityId : null, objects.map(o => o.key))) {
        await tx.contentTrash.update({ where: { id: row.id }, data: { state: 'purging', errorCode: 'shared_reference', version: { increment: 1 } } });
        return fail('shared_reference');
      }
      await tx.contentTrash.update({ where: { id: row.id }, data: { state: 'purging', purgeStartedAt: row.purgeStartedAt ?? now, objectsJson: json(objects), detailsJson: json({ ...d, chapterIds: ids, purgeNotBefore: new Date(notBefore).toISOString(), leaseToken: token, leaseUntil: new Date(now.getTime() + 300000).toISOString() }), version: { increment: 1 }, errorCode: null } });
      return { ok: true, data: { row, objects, d: { ...d, chapterIds: ids, purgeNotBefore: new Date(notBefore).toISOString() } } };
    }, { system: true, invalidate: false }).catch(async error => {
      if (!(error instanceof Error) || !['unsafe_object', 'Invalid media object key'].includes(error.message)) throw error;
      await db.contentTrash.updateMany({where:{id:candidate.id,state:{in:['trashed','purging']}},data:{errorCode:'unsafe_object',version:{increment:1}}});
      return fail('unsafe_object');
    });
    if (!claimed.ok) { if (['shared_reference','unsafe_object','target_changed'].includes(claimed.error ?? '')) summary.failed++; else summary.skipped++; continue; }
    const data = claimed.data as { row: ContentTrash; objects: { key: string; deleted: boolean }[]; d: Record<string, unknown> };
    let objects = data.objects, d = data.d, errorCode: string | null = null, completed = false;
    try {
      const storage = objects.length || data.row.entityType === 'series' ? await getMediaStorage() : null;
      // Listing is paginated and must finish before any byte is deleted. It finds
      // replaced covers whose old URL may still be cached but which have no DB row.
      if (data.row.entityType === 'series' && !d.coverListingComplete) {
        if (!storage?.listObjects) throw new Error('listing_unavailable');
        const prefix = `media/${process.env.MEDIA_STORAGE_PREFIX || 'prod'}/covers-${data.row.entityId}/`;
        const page = await storage.listObjects(prefix, typeof d.coverCursor === 'string' ? d.coverCursor : undefined);
        for (const key of page.keys) { validateMediaKey(key); if (!key.startsWith(prefix)) throw new Error('invalid_listing'); if (!objects.some(o => o.key === key)) objects.push({ key, deleted: false }); }
        d = { ...d, coverCursor: page.cursor ?? null, coverListingComplete: !page.cursor };
        if (objects.length && new Date(String(d.purgeNotBefore)).getTime() < data.row.deletedAt.getTime() + LATE_WRITE_GRACE_MS) d.purgeNotBefore = new Date(data.row.deletedAt.getTime() + LATE_WRITE_GRACE_MS).toISOString();
      }
      const ready = data.row.entityType !== 'series' || d.coverListingComplete;
      if (ready && new Date(String(d.purgeNotBefore)) <= now && (remaining > 0 || objects.length === 0)) {
        // Listing can discover references absent from the initial manifest; check
        // the completed manifest before starting deletion of any object.
        const safe = await withSerializableTx(async tx => {
          const row = await tx.contentTrash.findUniqueOrThrow({ where: { id: candidate.id } });
          if (details(row).leaseToken !== token) return fail('lease_lost');
          return { ok: !await sharedReferences(tx, await chapterIds(tx, row), row.entityType === 'series' ? row.entityId : null, objects.map(o => o.key)) };
        }, { system: true, invalidate: false });
        if (!safe.ok) throw new Error('shared_reference');
        for (const object of objects) { if (object.deleted || remaining <= 0) continue; remaining--; await storage!.deleteObject(object.key); object.deleted = true; }
        completed = objects.every(o => o.deleted);
      }
    } catch (error) { errorCode = error instanceof Error && ['shared_reference', 'listing_unavailable', 'invalid_listing'].includes(error.message) ? error.message : 'storage_failed'; }
    const saved = await withSerializableTx(async tx => {
      const row = await tx.contentTrash.findUniqueOrThrow({ where: { id: candidate.id } });
      if (details(row).leaseToken !== token || row.state !== 'purging') return fail('lease_lost');
      const ids = await chapterIds(tx, row);
      if (completed && await sharedReferences(tx, ids, row.entityType === 'series' ? row.entityId : null, objects.map(o => o.key))) { completed = false; errorCode = 'shared_reference'; }
      if (completed) {
        await tx.analyticsEvent.deleteMany({ where: { OR: [{chapterId: {in: ids}}, ...(row.entityType === 'series' ? [{seriesId: row.entityId}] : [])] } });
        if (row.entityType === 'series') {
          await tx.contentRequest.updateMany({ where: { fulfilledSeriesId: row.entityId }, data: { fulfilledSeriesId: null, version: { increment: 1 } } });
          const removed = await tx.series.deleteMany({ where: { id: row.entityId, deletedAt: { not: null }, trashBatchId: row.id } });
          if (removed.count !== 1) throw new Error('purge_target_changed');
          await tx.contentTrash.updateMany({ where: { entityType: 'chapter', entityId: { in: ids }, state: { in: ['trashed', 'purging'] } }, data: { state: 'purged', activeKey: null, purgedAt: now, version: { increment: 1 } } });
        } else { const removed = await tx.chapter.deleteMany({ where: { id: row.entityId, deletedAt: { not: null }, trashBatchId: row.id } }); if (removed.count !== 1) throw new Error('purge_target_changed'); }
      }
      await tx.contentTrash.update({ where: { id: row.id }, data: { objectsJson: json(objects), detailsJson: json({ ...d, leaseToken: null, leaseUntil: null }), errorCode, ...(completed ? { state: 'purged', activeKey: null, purgedAt: now } : {}), version: { increment: 1 } } });
      return { ok: true };
    }, { system: true, invalidate: completed });
    if (!saved.ok || errorCode) summary.failed++; else if (completed) summary.deleted++; else summary.skipped++;
  }
  return summary;
}
