import { withDatabaseScope } from '@/lib/db';
import { allowAccountClient } from '@/lib/account-ratelimit';
import { downloadError, getChapterDownload, isSameOriginDownload } from '@/lib/downloads/service';

export async function POST(request: Request, { params }: { params: Promise<{ chapterId: string }> }) {
  if (!isSameOriginDownload(request, true)) return downloadError(403, 'forbidden');
  try {
    return await withDatabaseScope(async () => {
      if (!await allowAccountClient('chapter-download', request.headers.get('x-forwarded-for'))) return downloadError(429, 'rate_limited');
      const download = await getChapterDownload((await params).chapterId);
      if (!download.ok) return downloadError(download.status, download.error);
      return Response.json({ ok: true, filename: download.filename, fingerprint: download.fingerprint,
        pages: download.pages.map(({ assetId, width, height, mime, bytes }) => ({ assetId, width, height, mime, bytes })) },
      { headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    });
  } catch { return downloadError(503, 'unavailable'); }
}
