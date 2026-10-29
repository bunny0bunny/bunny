import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { contentFingerprint, downloadFilename, canDownloadChapter, type DownloadManifestPage } from '../../src/lib/downloads/policy';

const page = (pageIndex = 0): DownloadManifestPage => ({ assetId: `asset${pageIndex}`, objectKey: `media/test/upload1/asset${pageIndex}.webp`, mime: 'image/webp', width: 800, height: 1200, bytes: 100, pageIndex });

test('fingerprint hashes the version and canonical ordered manifest, ignoring row IDs and property order', () => {
  const pages = [page(), page(1)];
  const expected = createHash('sha256').update(JSON.stringify({ version: 'pdf-v1', pages })).digest('hex');
  expect(contentFingerprint(pages)).toBe(expected);
  expect(contentFingerprint([...pages].reverse())).toBe(expected);
  expect(contentFingerprint(pages.map(p => ({ chapterPageId: 'newRow', pageIndex: p.pageIndex, bytes: p.bytes, height: p.height, width: p.width, mime: p.mime, objectKey: p.objectKey, assetId: p.assetId })))).toBe(expected);
  expect(pages.map(p => p.pageIndex)).toEqual([0, 1]);
});

test('fingerprint changes when content metadata or page assignment changes', () => {
  const pages = [page(), page(1)];
  const original = contentFingerprint(pages);
  for (const patch of [{ assetId: 'replacement' }, { objectKey: 'media/test/upload1/replacement.webp' }, { width: 801 }, { height: 1201 }, { bytes: 101 }, { mime: 'image/jpeg', objectKey: 'media/test/upload1/asset0.jpg' }]) {
    expect(contentFingerprint([{ ...pages[0], ...patch }, pages[1]])).not.toBe(original);
  }
  expect(contentFingerprint(pages.map(p => ({ ...p, pageIndex: 1 - p.pageIndex })))).not.toBe(original);
});

test('manifest rejects missing, duplicate and excessive pages', () => {
  for (const pages of [[], [page(1)], [page(), page()], [page(), page(2)], Array.from({ length: 201 }, (_, i) => page(i))]) expect(() => contentFingerprint(pages)).toThrow();
  expect(contentFingerprint(Array.from({ length: 200 }, (_, i) => page(i)))).toMatch(/^[a-f0-9]{64}$/);
});

test('manifest rejects unsafe identifiers, keys, MIME and resource limits', () => {
  for (const patch of [
    { assetId: '../asset' }, { assetId: '' }, { assetId: 'asset-1' },
    ...['../asset.webp', 'https://host/media/test/upload1/asset0.webp', 'media/test/../asset0.webp', 'media/test/upload1/asset0.webp?x=1', 'media/test/upload1/asset0.webp\n', 'media/test/upload1/asset_0.webp', 'media/test/upload1/asset0.jpg', 'media/test/upload1/asset0.pdf'].map(objectKey => ({ objectKey })),
    { mime: 'image/png' }, { width: 0 }, { height: -1 }, { width: 1.5 }, { width: NaN }, { height: Infinity }, { width: 16001 }, { width: 4097, height: 4096 }, { bytes: 0 }, { bytes: 6291457 }, { bytes: 1.5 }, { pageIndex: -1 }, { pageIndex: 0.5 },
  ]) expect(() => contentFingerprint([{ ...page(), ...patch }])).toThrow();
  expect(contentFingerprint([{ ...page(), width: 16000, height: 1, bytes: 6291456 }])).toMatch(/^[a-f0-9]{64}$/);
  expect(contentFingerprint([{ ...page(), width: 4096, height: 4096, bytes: 1 }])).toMatch(/^[a-f0-9]{64}$/);
});

const now = new Date('2026-10-29T12:00:00Z');
const chapter = () => ({ workflow: 'published', deletedAt: null as Date | null, scheduledFor: null as Date | null, isPremiumDemo: false, series: { deletedAt: null as Date | null, format: 'manga', downloadsEnabled: true } });

test('only available unlocked image chapters can be downloaded, including by administrators', () => {
  expect(canDownloadChapter(chapter(), false, now)).toBe(true);
  expect(canDownloadChapter({ ...chapter(), scheduledFor: now }, false, now)).toBe(true);
  expect(canDownloadChapter({ ...chapter(), series: { ...chapter().series, format: 'webtoon' } }, false, now)).toBe(true);
  for (const patch of [{ workflow: 'draft' }, { deletedAt: now }, { scheduledFor: new Date(now.getTime() + 1) }, { scheduledFor: new Date(NaN) }, { isPremiumDemo: true }, { series: { ...chapter().series, deletedAt: now } }, { series: { ...chapter().series, format: 'novel' } }, { series: { ...chapter().series, format: 'unknown' } }]) {
    for (const admin of [false, true]) expect(canDownloadChapter({ ...chapter(), ...patch }, admin, now)).toBe(false);
  }
  const disabled = { ...chapter(), series: { ...chapter().series, downloadsEnabled: false } };
  expect(canDownloadChapter(disabled, false, now)).toBe(false);
  expect(canDownloadChapter(disabled, true, now)).toBe(true);
  expect(canDownloadChapter(chapter(), true, new Date(NaN))).toBe(false);
});

test('download filename uses English first, Arabic fallback and preserves decimal chapter numbers', () => {
  expect(downloadFilename({ titleOriginal: 'English title', titleAr: 'العنوان' }, 7.6)).toBe('English title - Chapter 7.6.pdf');
  expect(downloadFilename({ titleOriginal: '  ', titleAr: 'العنوان' }, 7)).toBe('العنوان - Chapter 7.pdf');
  expect(downloadFilename({ titleAr: 'العنوان' }, 7.125)).toBe('العنوان - Chapter 7.125.pdf');
  const filename = downloadFilename({ titleOriginal: '../unsafe\\path\n\r"quoted\u0000:<>|?*' + 'x'.repeat(300), titleAr: 'fallback' }, 7.6);
  expect(filename.length).toBeLessThanOrEqual(180);
  expect(filename).toEndWith(' - Chapter 7.6.pdf');
  expect(filename).not.toMatch(/[\/\\\u0000-\u001f\u007f"<>:|?*]/);
  expect(filename.startsWith('.')).toBe(false);
  for (const invalid of [NaN, Infinity, 0, -1]) expect(() => downloadFilename({ titleAr: 'title' }, invalid)).toThrow();
});

// A terminal line break must not slip through JavaScript's end-of-line anchor.
test('asset IDs reject trailing line breaks', () => {
  expect(() => contentFingerprint([{ ...page(), assetId: 'asset0\n' }])).toThrow();
});
