import { withDatabaseScope } from '@/lib/db';
import { withSerializableTx, validatePagesSnapshot } from '@/lib/editorial';
import { uploadResponse } from '@/lib/media/uploads';
export async function GET(_request: Request, { params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params;
  try {
    return await withDatabaseScope(async () => {
      const result = await withSerializableTx(async (tx, actor) => {
        if (actor.role !== 'admin') return { ok: false, error: 'forbidden' };
        const revisions = await tx.chapterRevision.findMany({ where: { chapter: { seriesId } }, include: { chapter: { select: { titleAr: true, number: true } } }, orderBy: [{ chapterId: 'asc' }, { revisionNumber: 'desc' }], take: 200 });
        const candidates = revisions.flatMap(revision => {
          const first = validatePagesSnapshot(revision.pagesJson)?.[0];
          return first && /^\/api\/media\/[a-z0-9]+$/.test(first.imagePath) ? [{ revision, first }] : [];
        });
        const assets = await tx.mediaAsset.findMany({ where: { id: { in: candidates.map(({ first }) => first.imagePath.slice(11)) }, pageIndex: 0, readyAt: { not: null }, mime: { in: ['image/jpeg', 'image/webp'] } }, select: { id: true, chapterId: true } });
        const options: { revisionId: string; chapterTitle: string; chapterNumber: number; revisionNumber: number; imagePath: string }[] = [];
        for (const { revision, first } of candidates) {
          if (assets.some(asset => asset.id === first.imagePath.slice(11) && asset.chapterId === revision.chapterId)) options.push({ revisionId: revision.id, chapterTitle: revision.chapter.titleAr, chapterNumber: revision.chapter.number, revisionNumber: revision.revisionNumber, imagePath: `/api/series/${seriesId}/cover-source/${revision.id}` });
        }
        return { ok: true, data: { options } };
      }, { invalidate: false });
      if (!result.ok) return uploadResponse(result);
      return Response.json({ ok: true, ...(result.data as object) }, { headers: { 'Cache-Control': 'private, no-store' } });
    });
  } catch { return uploadResponse({ ok: false, error: 'unavailable' }); }
}
