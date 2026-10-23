import { withDatabaseScope } from '@/lib/db';
import { withSerializableTx, validatePagesSnapshot } from '@/lib/editorial';
import { getMediaStorage } from '@/lib/media/storage';
import { uploadResponse } from '@/lib/media/uploads';
export async function GET(_request: Request, { params }: { params: Promise<{ seriesId: string; revisionId: string }> }) {
  const { seriesId, revisionId } = await params;
  try {
    return await withDatabaseScope(async () => {
      const result = await withSerializableTx(async (tx, actor) => {
        if (actor.role !== 'admin') return { ok: false, error: 'forbidden' };
        const revision = await tx.chapterRevision.findFirst({ where: { id: revisionId, chapter: { seriesId } } });
        const first = revision && validatePagesSnapshot(revision.pagesJson)?.[0];
        if (!first || !/^\/api\/media\/[a-z0-9]+$/.test(first.imagePath)) return { ok: false, error: 'not_found' };
        const asset = await tx.mediaAsset.findFirst({ where: { id: first.imagePath.slice(11), chapterId: revision!.chapterId, pageIndex: 0, readyAt: { not: null }, mime: { in: ['image/jpeg', 'image/webp'] } }, select: { objectKey: true, mime: true, bytes: true } });
        return asset ? { ok: true, data: asset } : { ok: false, error: 'not_found' };
      }, { invalidate: false });
      if (!result.ok) return uploadResponse(result);
      const asset = result.data as { objectKey: string; mime: string; bytes: number };
      const upstream = await fetch(await (await getMediaStorage()).signGet(asset.objectKey, { expiresIn: 60 }), { signal: AbortSignal.timeout(15000), cache: 'no-store' });
      if (!upstream.ok) { await upstream.body?.cancel(); throw new Error('unavailable'); }
      return new Response(upstream.body, { headers: { 'Content-Type': asset.mime, 'Content-Length': String(asset.bytes), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    });
  } catch { return uploadResponse({ ok: false, error: 'unavailable' }); }
}
