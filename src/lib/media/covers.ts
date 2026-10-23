import 'server-only';
import { withSerializableTx } from '@/lib/editorial';
import { withDatabaseScope } from '@/lib/db';
import { getMediaStorage } from './storage';
import { sniffPage } from './formats';
import { replaceSeriesCover, readCoverBytes } from './cover-policy';
import { uploadRequestGuard, uploadResponse } from './uploads';
import { revalidatePath } from 'next/cache';

export async function saveCover(request: Request, seriesId: string): Promise<Response> {
  const guard = uploadRequestGuard(request);
  if (guard) return uploadResponse({ ok: false, error: guard });
  try {
    return await withDatabaseScope(async () => {
      // Authenticate before buffering even the bounded body.
      const allowed = await withSerializableTx(async (_tx, actor) => ({ ok: actor.role === 'admin', error: actor.role === 'admin' ? undefined : 'forbidden' }), { invalidate: false });
      if (!allowed.ok) return uploadResponse(allowed);
      const length = request.headers.get('content-length');
      if (!length || !/^\d+$/.test(length)) return uploadResponse({ ok: false, error: 'invalid_length' });
      let bytes: Uint8Array;
      try { bytes = await readCoverBytes(request, Number(length)); }
      catch { return uploadResponse({ ok: false, error: 'invalid_length' }); }
      let previous: string;
      try { previous = decodeURIComponent(request.headers.get('x-bunny-cover-previous') ?? ''); }
      catch { return uploadResponse({ ok: false, error: 'invalid_input' }); }
      const result = await replaceSeriesCover({ seriesId, previous, bytes, consent: request.headers.get('x-bunny-cover-consent') ?? '', mime: request.headers.get('content-type')?.split(';')[0] ?? '' }, {
        prefix: process.env.MEDIA_STORAGE_PREFIX || 'prod',
        newId: () => crypto.randomUUID().replaceAll('-', ''),
        inspect: sniffPage,
        // Resolve lazily; failure does not erase the current cover.
        storage: { putPage: async (...args) => (await getMediaStorage()).putPage(...args), deleteObject: async key => (await getMediaStorage()).deleteObject(key) },
        transaction: work => withSerializableTx(async (tx, actor) => work({
          role: actor.role,
          findSeries: id => tx.series.findUnique({ where: { id }, select: { coverPath: true } }),
          replaceSeries: async (id, old, next) => (await tx.series.updateMany({ where: { id, coverPath: old }, data: { coverPath: next } })).count === 1,
          reserve: async () => {
            const now = Date.now(), windowMs = 3600000;
            const keyHash = `cover:${actor.id}:${Math.floor(now / windowMs)}`;
            const existing = await tx.accountRateLimit.findUnique({ where: { keyHash } });
            if ((existing?.count ?? 0) >= 20) return false;
            await tx.accountRateLimit.upsert({ where: { keyHash }, create: { keyHash, count: 1, windowEnd: new Date((Math.floor(now / windowMs) + 1) * windowMs) }, update: { count: { increment: 1 } } });
            return true;
          },
        }), { invalidate: false }),
      });
      if (!result.ok) return uploadResponse(result);
      for (const path of ['/', '/explore', '/admin/series']) revalidatePath(path);
      revalidatePath('/series/[slug]', 'page');
      revalidatePath(`/admin/series/${seriesId}`);
      return Response.json({ ok: true, ...(result.data as { coverPath: string }) }, { headers: { 'Cache-Control': 'private, no-store' } });
    });
  } catch { return uploadResponse({ ok: false, error: 'unavailable' }); }
}
