import 'server-only';
import { db } from '@/lib/db';
import { currentProfileOrNull } from '@/lib/queries';
import { getMediaStorage } from '@/lib/media/storage';
import { errorSummary, logOpsEvent } from '@/lib/ops-log';
import { canDownloadChapter, contentFingerprint, downloadFilename, DOWNLOAD_URL_SECONDS, type DownloadManifestPage } from './policy';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
type DownloadFailure = { ok: false; status: 403 | 404 | 409 | 503; error: string };
type ChapterDownload = { ok: true; filename: string; fingerprint: string; pages: DownloadManifestPage[] };
const failure = (status: DownloadFailure['status'], error: string, details?: Record<string, unknown>): DownloadFailure => {
  if (details) logOpsEvent('chapter-download', error, details);
  return { ok: false, status, error };
};

export function downloadError(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status, headers: PRIVATE_HEADERS });
}

/** Browser fetches must originate on this site; POST additionally requires Origin. */
export function isSameOriginDownload(request: Request, requireOrigin: boolean): boolean {
  const origin = request.headers.get('origin');
  const mode = request.headers.get('sec-fetch-mode');
  const destination = request.headers.get('sec-fetch-dest');
  const expectedOrigin = new URL(request.url).origin;
  const allowed = (!requireOrigin || origin === expectedOrigin) && (origin === null || origin === expectedOrigin) &&
    request.headers.get('sec-fetch-site') === 'same-origin' &&
    (!mode || mode === 'cors' || mode === 'same-origin') && (!destination || destination === 'empty') &&
    (requireOrigin || request.headers.get('x-chapter-download') === '1');
  if (!allowed) logOpsEvent('chapter-download', 'origin_rejected', {
    path: new URL(request.url).pathname, originMatches: origin === null ? null : origin === expectedOrigin,
    secFetchSite: request.headers.get('sec-fetch-site'), secFetchMode: mode, secFetchDest: destination,
  });
  return allowed;
}

/** Resolve only the current public projection; no revision or source PDF is eligible. */
export async function getChapterDownload(chapterId: string): Promise<ChapterDownload | DownloadFailure> {
  if (!/^[A-Za-z0-9]{1,128}$/.test(chapterId)) return failure(404, 'not_found');
  try {
    const profile = await currentProfileOrNull();
    return await db.$transaction(async tx => {
      const chapter = await tx.chapter.findUnique({ where: { id: chapterId }, include: { series: true, pages: { orderBy: { pageIndex: 'asc' }, take: 201 } } });
      if (!chapter || !canDownloadChapter(chapter, true)) return failure(404, 'not_found');
      if (!canDownloadChapter(chapter, profile?.role === 'admin')) return failure(403, 'forbidden');
      if (chapter.pages.length > 200) return failure(409, 'too_many_pages');
      const ids = chapter.pages.map(page => /^\/api\/media\/([A-Za-z0-9]{1,128})$/.exec(page.imagePath)?.[1]);
      if (!ids.length) return failure(409, 'conflict', { chapterId, reason: 'no_pages' });
      if (ids.some(id => !id)) return failure(409, 'conflict', { chapterId, reason: 'non_media_page_path', legacyPages: ids.filter(id => !id).length });
      const assets = await tx.mediaAsset.findMany({ where: { id: { in: ids as string[] }, chapterId } });
      const byId = new Map(assets.map(asset => [asset.id, asset]));
      const pages: DownloadManifestPage[] = [];
      for (const [index, page] of chapter.pages.entries()) {
        const asset = byId.get(ids[index]!);
        if (!asset?.readyAt || asset.pageIndex !== page.pageIndex || asset.width !== page.width || asset.height !== page.height ||
          (asset.mime !== 'image/webp' && asset.mime !== 'image/jpeg')) return failure(409, 'conflict', { chapterId, reason: 'asset_mismatch', pageIndex: page.pageIndex });
        pages.push({ assetId: asset.id, objectKey: asset.objectKey, mime: asset.mime, width: page.width, height: page.height, bytes: asset.bytes, pageIndex: page.pageIndex });
      }
      try {
        return { ok: true as const, filename: downloadFilename(chapter.series, chapter.number), fingerprint: contentFingerprint(pages), pages };
      } catch (error) { return failure(409, 'conflict', { chapterId, reason: 'fingerprint', ...errorSummary(error) }); }
    }, { isolationLevel: 'RepeatableRead' });
  } catch (error) { return failure(503, 'unavailable', { chapterId, stage: 'manifest', ...errorSummary(error) }); }
}

export async function fetchChapterDownloadPage(chapterId: string, assetId: string, fingerprint: string, signal?: AbortSignal): Promise<Response> {
  if (!/^[A-Za-z0-9]{1,128}$/.test(assetId)) return downloadError(404, 'not_found');
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) return downloadError(409, 'conflict');
  const download = await getChapterDownload(chapterId);
  if (!download.ok) return downloadError(download.status, download.error);
  if (download.fingerprint !== fingerprint) {
    logOpsEvent('chapter-download', 'conflict', { chapterId, reason: 'fingerprint_changed' });
    return downloadError(409, 'conflict');
  }
  const page = download.pages.find(page => page.assetId === assetId);
  if (!page) return downloadError(404, 'not_found');
  try {
    const url = await (await getMediaStorage()).signGet(page.objectKey, { expiresIn: DOWNLOAD_URL_SECONDS });
    const timeout = AbortSignal.timeout(30_000);
    const upstream = await fetch(url, { redirect: 'error', cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    const length = upstream.headers.get('content-length');
    const mime = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!upstream.ok || !upstream.body || mime !== page.mime ||
      (length !== null && (!/^\d+$/.test(length) || Number(length) > 6_291_456 || Number(length) !== page.bytes))) {
      await upstream.body?.cancel();
      logOpsEvent('chapter-download', 'unavailable', { chapterId, assetId, stage: 'storage_response', status: upstream.status,
        mimeMatches: mime === page.mime, contentLength: length, expectedBytes: page.bytes });
      return downloadError(503, 'unavailable');
    }
    const reader = upstream.body.getReader();
    let received = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            if (received !== page.bytes) throw new Error('Download page length mismatch');
            controller.close(); return;
          }
          received += value.byteLength;
          if (received > page.bytes || received > 6_291_456) throw new Error('Download page exceeds byte limit');
          controller.enqueue(value);
        } catch (error) {
          try { await reader.cancel(error); } catch { /* Already failed upstream. */ }
          controller.error(error);
        }
      },
      cancel(reason) { return reader.cancel(reason); },
    });
    return new Response(body, { headers: { ...PRIVATE_HEADERS, 'Content-Type': page.mime, 'Content-Length': String(page.bytes) } });
  } catch (error) {
    logOpsEvent('chapter-download', 'unavailable', { chapterId, assetId, stage: 'storage_fetch', ...errorSummary(error) });
    return downloadError(503, 'unavailable');
  }
}
