import { createHash } from 'node:crypto';
import { isChapterNumber } from '../chapter-number';

export const DOWNLOAD_URL_SECONDS = 120;
export const EXPORT_VERSION = 'pdf-v1';

export type DownloadManifestPage = {
  assetId: string;
  objectKey: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  pageIndex: number;
};

// Keep this pure module independent of storage's server-only bindings.
const MEDIA_KEY = /^media\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/[A-Za-z0-9][A-Za-z0-9-]{0,127}\/[A-Za-z0-9][A-Za-z0-9-]{0,127}\.(webp|jpg|pdf)$/;
const positiveInteger = (value: number, maximum: number) => Number.isSafeInteger(value) && value >= 1 && value <= maximum;

/** Asset identity and rendered content determine the export; chapter-page row IDs do not. */
export function contentFingerprint(pages: readonly DownloadManifestPage[]): string {
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > 200) throw new Error('Invalid download page count');
  const ordered = [...pages].sort((a, b) => a.pageIndex - b.pageIndex);
  const manifest = ordered.map((page, index) => {
    const { assetId, objectKey, mime, width, height, bytes, pageIndex } = page;
    if (!Number.isSafeInteger(pageIndex) || pageIndex !== index ||
      typeof assetId !== 'string' || !/^[A-Za-z0-9]+$/.test(assetId) ||
      typeof objectKey !== 'string' || !MEDIA_KEY.test(objectKey) ||
      !((mime === 'image/webp' && objectKey.endsWith('.webp')) || (mime === 'image/jpeg' && objectKey.endsWith('.jpg'))) ||
      !positiveInteger(width, 16000) || !positiveInteger(height, 16000) || width * height > 16_777_216 ||
      !positiveInteger(bytes, 6_291_456)) throw new Error('Invalid download page manifest');
    return { assetId, objectKey, mime, width, height, bytes, pageIndex };
  });
  return createHash('sha256').update(JSON.stringify({ version: EXPORT_VERSION, pages: manifest })).digest('hex');
}

export function downloadFilename(title: { titleOriginal?: string | null; titleAr: string }, chapterNumber: number): string {
  if (!isChapterNumber(chapterNumber)) throw new Error('Invalid chapter number');
  const suffix = ` - Chapter ${chapterNumber}.pdf`;
  const rawTitle = title.titleOriginal?.trim() || title.titleAr.trim();
  const safeTitle = rawTitle.replace(/[\u0000-\u001f\u007f-\u009f/\\"'<>:|?*]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '') || 'Chapter';
  // Preserve the chapter suffix even when truncating a long title.
  return `${safeTitle.slice(0, 180 - suffix.length)}${suffix}`;
}

type DownloadChapter = {
  workflow: string;
  deletedAt: Date | null;
  scheduledFor: Date | null;
  isPremiumDemo: boolean;
  series: { deletedAt: Date | null; format: string; downloadsEnabled: boolean };
};

export function canDownloadChapter(chapter: DownloadChapter, isAdmin: boolean, now = new Date()): boolean {
  return Number.isFinite(now.getTime()) && chapter.workflow === 'published' && !chapter.deletedAt && !chapter.series.deletedAt &&
    (!chapter.scheduledFor || chapter.scheduledFor.getTime() <= now.getTime()) && !chapter.isPremiumDemo &&
    (chapter.series.format === 'manga' || chapter.series.format === 'webtoon') &&
    (chapter.series.downloadsEnabled || isAdmin);
}
