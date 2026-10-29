import { withDatabaseScope } from '@/lib/db';
import { downloadError, fetchChapterDownloadPage, isSameOriginDownload } from '@/lib/downloads/service';

export async function GET(request: Request, { params }: { params: Promise<{ chapterId: string; assetId: string }> }) {
  if (!isSameOriginDownload(request, false)) return downloadError(403, 'forbidden');
  try {
    return await withDatabaseScope(async () => {
      const { chapterId, assetId } = await params;
      return fetchChapterDownloadPage(chapterId, assetId, new URL(request.url).searchParams.get('fingerprint') ?? '', request.signal);
    });
  } catch { return downloadError(503, 'unavailable'); }
}
