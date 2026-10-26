import { db, withDatabaseScope } from '@/lib/db';
import { currentCoverKey } from '@/lib/media/cover-policy';
import { getMediaStorage } from '@/lib/media/storage';
export async function GET(_request: Request, { params }: { params: Promise<{ seriesId: string; file: string }> }) {
  const { seriesId, file } = await params;
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!/^[a-zA-Z0-9-]{1,96}$/.test(seriesId) || !/^[a-zA-Z0-9-]{1,96}\.(webp|jpg)$/.test(file)) return new Response(null, { status: 404, headers });
  try {
    return await withDatabaseScope(async () => {
      const series = await db.series.findUnique({ where: { id: seriesId, deletedAt: null }, select: { coverPath: true } });
      const key = currentCoverKey(seriesId, file, series?.coverPath ?? '', process.env.MEDIA_STORAGE_PREFIX || 'prod');
      if (!key) return new Response(null, { status: 404, headers });
      return new Response(null, { status: 307, headers: { ...headers, Location: await (await getMediaStorage()).signGet(key, { expiresIn: 300 }) } });
    });
  } catch { return new Response(null, { status: 503, headers }); }
}
