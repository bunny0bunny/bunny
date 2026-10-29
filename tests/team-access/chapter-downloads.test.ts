import { afterAll, beforeAll, beforeEach, expect, test, mock } from 'bun:test';
import { db, setActor } from './session-fixture';
import { hashRateLimitKey } from '../../src/lib/account-ratelimit';
const signed: string[] = [];
let upstream: () => Response = () => new Response(new Uint8Array([1,2,3]), { headers: { 'content-type': 'image/webp', 'content-length': '3' } });
let fetchOptions: RequestInit | undefined;
mock.module('../../src/lib/media/storage', () => ({ getMediaStorage: async () => ({ signGet: async (key: string, options: { expiresIn: number }) => { expect(options.expiresIn).toBe(120); signed.push(key); return 'https://storage.invalid/private'; } }) }));
const { getChapterDownload, fetchChapterDownloadPage } = await import('../../src/lib/downloads/service');
const { POST } = await import('../../src/app/api/chapters/[chapterId]/download/route');
const { GET } = await import('../../src/app/api/chapters/[chapterId]/download/pages/[assetId]/route');
const tag = `downloads${Date.now()}`;
let admin: string, series: string, chapter: string, foreignChapter: string, asset: string, source: string;
let initialDownloadsEnabled: boolean;
const originalFetch = globalThis.fetch;
beforeAll(async () => {
  admin = (await db.profile.create({ data: { email: `${tag}@bunny.test`, nickname: 'QA', role: 'admin', passwordHash: 'x', emailVerifiedAt: new Date() } })).id;
  series = (await db.series.create({ data: { slug: tag, titleAr: 'عربي', titleOriginal: 'English', synopsisAr: 'QA', author: 'QA', format: 'manga', coverPath: '' } })).id;
  initialDownloadsEnabled = (await db.series.findUniqueOrThrow({ where: { id: series } })).downloadsEnabled;
  chapter = (await db.chapter.create({ data: { seriesId: series, number: 7.6, titleAr: 'QA', workflow: 'published' } })).id;
  foreignChapter = (await db.chapter.create({ data: { seriesId: series, number: 8, titleAr: 'QA', workflow: 'published' } })).id;
  const revision = await db.chapterRevision.create({ data: { chapterId: chapter, revisionNumber: 1, titleAr: 'QA' } });
  const upload = await db.chapterUpload.create({ data: { revisionId: revision.id, chapterId: chapter, createdById: admin, sourceName: 'original.pdf', sourceBytes: 5, expectedPages: 1, revisionVersion: 1, expiresAt: new Date(Date.now()+3600000) } });
  asset = (await db.mediaAsset.create({ data: { uploadId: upload.id, chapterId: chapter, pageIndex: 0, objectKey: `media/test/${upload.id}/page.webp`, mime: 'image/webp', bytes: 3, width: 800, height: 1200, readyAt: new Date() } })).id;
  source = (await db.mediaAsset.create({ data: { uploadId: upload.id, chapterId: chapter, pageIndex: -1, objectKey: `media/test/${upload.id}/source.pdf`, mime: 'application/pdf', bytes: 5, readyAt: new Date() } })).id;
  await db.chapterPage.create({ data: { chapterId: chapter, pageIndex: 0, imagePath: `/api/media/${asset}`, width: 800, height: 1200 } });
});
beforeEach(async () => {
  setActor(null); signed.length = 0;
  globalThis.fetch = (async (_url: unknown, options: RequestInit) => { fetchOptions = options; return upstream(); }) as typeof fetch;
  upstream = () => new Response(new Uint8Array([1,2,3]), { headers: { 'content-type': 'image/webp', 'content-length': '3' } });
  await db.profile.update({ where: { id: admin }, data: { role: 'admin', disabledAt: null, authVersion: 0 } });
  await db.series.update({ where: { id: series }, data: { downloadsEnabled: true, deletedAt: null, format: 'manga' } });
  await db.chapter.update({ where: { id: chapter }, data: { workflow: 'published', deletedAt: null, scheduledFor: null, isPremiumDemo: false } });
  await db.chapterPage.update({ where: { chapterId_pageIndex: { chapterId: chapter, pageIndex: 0 } }, data: { imagePath: `/api/media/${asset}`, width: 800, height: 1200 } });
  await db.mediaAsset.update({ where: { id: asset }, data: { chapterId: chapter, readyAt: new Date(), width: 800, mime: 'image/webp' } });
  await db.accountRateLimit.deleteMany({ where: { keyHash: hashRateLimitKey('client:chapter-download:unidentified') } });
});
afterAll(async () => { globalThis.fetch = originalFetch; setActor(null); await db.series.deleteMany({ where: { id: series } }); await db.profile.deleteMany({ where: { id: admin } }); await db.accountRateLimit.deleteMany({ where: { keyHash: hashRateLimitKey('client:chapter-download:unidentified') } }); });
const context = () => ({ params: Promise.resolve({ chapterId: chapter }) });
const post = (headers: Record<string,string> = {}) => POST(new Request(`http://localhost/api/chapters/${chapter}/download`, { method: 'POST', headers: { origin: 'http://localhost', 'sec-fetch-site': 'same-origin', ...headers } }), context());
const pageRequest = (fingerprint: string, id = asset) => new Request(`http://localhost/api/chapters/${chapter}/download/pages/${id}?fingerprint=${fingerprint}`, { headers: { 'sec-fetch-site': 'same-origin', 'x-chapter-download': '1' } });
async function manifest() { const result = await getChapterDownload(chapter); if (!result.ok) throw Error(result.error); return result; }

test('series downloads default off and only a fresh administrator bypasses the switch', async () => {
  expect(initialDownloadsEnabled).toBe(false);
  await db.series.update({ where: { id: series }, data: { downloadsEnabled: false } });
  expect((await getChapterDownload(chapter)).ok).toBe(false);
  setActor(admin); expect((await getChapterDownload(chapter)).ok).toBe(true);
  for (const role of ['reader', 'contributor', 'editor'] as const) {
    await db.profile.update({ where: { id: admin }, data: { role } }); expect((await getChapterDownload(chapter)).ok).toBe(false);
  }
  await db.profile.update({ where: { id: admin }, data: { role: 'admin', authVersion: 1 } }); expect((await getChapterDownload(chapter)).ok).toBe(false);
});

test('manifest exposes current page metadata and decimal filename without storage keys or source assets', async () => {
  const response = await post(); expect(response.status).toBe(200);
  const data = await response.json(); expect(data).toEqual({ ok: true, filename: 'English - Chapter 7.6.pdf', fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), pages: [{ assetId: asset, width: 800, height: 1200, mime: 'image/webp', bytes: 3 }] });
  expect(JSON.stringify(data)).not.toContain('objectKey'); expect(JSON.stringify(data)).not.toContain(source); expect(signed).toEqual([]);
  expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('x-content-type-options')).toBe('nosniff');
});

test('unpublished, deleted, scheduled, locked and novel content fails even for admin', async () => {
  setActor(admin);
  for (const data of [{ workflow: 'draft' as const }, { deletedAt: new Date() }, { scheduledFor: new Date(Date.now()+60000) }, { isPremiumDemo: true }]) {
    await db.chapter.update({ where: { id: chapter }, data }); expect((await getChapterDownload(chapter)).ok).toBe(false);
    await db.chapter.update({ where: { id: chapter }, data: { workflow: 'published', deletedAt: null, scheduledFor: null, isPremiumDemo: false } });
  }
  await db.series.update({ where: { id: series }, data: { format: 'novel' } }); expect((await getChapterDownload(chapter)).ok).toBe(false);
  await db.series.update({ where: { id: series }, data: { format: 'manga', deletedAt: new Date() } }); expect((await getChapterDownload(chapter)).ok).toBe(false);
});

test('foreign, unready, mismatched and legacy image references fail closed', async () => {
  for (const imagePath of [`/api/media/${source}`, 'https://example.com/image.webp', '/art/pages/legacy.webp', `/api/media/${asset}?x=1`]) {
    await db.chapterPage.update({ where: { chapterId_pageIndex: { chapterId: chapter, pageIndex: 0 } }, data: { imagePath } }); expect((await getChapterDownload(chapter)).ok).toBe(false);
  }
  await db.chapterPage.update({ where: { chapterId_pageIndex: { chapterId: chapter, pageIndex: 0 } }, data: { imagePath: `/api/media/${asset}` } });
  for (const data of [{ chapterId: foreignChapter }, { readyAt: null }, { width: 801 }, { mime: 'application/pdf' }]) {
    await db.mediaAsset.update({ where: { id: asset }, data }); expect((await getChapterDownload(chapter)).ok).toBe(false);
    await db.mediaAsset.update({ where: { id: asset }, data: { chapterId: chapter, readyAt: new Date(), width: 800, mime: 'image/webp' } });
  }
});

test('manifest POST rejects cross-origin requests before rate gate and limits repeated requests', async () => {
  expect((await post({ origin: 'https://evil.example' })).status).toBe(403);
  expect((await post({ origin: '' })).status).toBe(403);
  expect((await post({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
  expect(await db.accountRateLimit.count({ where: { keyHash: hashRateLimitKey('client:chapter-download:unidentified') } })).toBe(0);
  await db.accountRateLimit.create({ data: { keyHash: hashRateLimitKey('client:chapter-download:unidentified'), count: 20000, windowEnd: new Date(Date.now()+60000) } });
  expect((await post()).status).toBe(429);
});

test('page fetch revalidates permissions, projection and fingerprint and never redirects', async () => {
  const data = await manifest();
  const response = await GET(pageRequest(data.fingerprint), { params: Promise.resolve({ chapterId: chapter, assetId: asset }) });
  expect(response.status).toBe(200); expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1,2,3]); expect(signed).toHaveLength(1); expect(fetchOptions?.redirect).toBe('error'); expect(fetchOptions?.signal).toBeDefined();
  expect((await GET(pageRequest(data.fingerprint, source), { params: Promise.resolve({ chapterId: chapter, assetId: source }) })).status).toBe(404);
  await db.mediaAsset.update({ where: { id: asset }, data: { bytes: 4 } }); expect((await GET(pageRequest(data.fingerprint), { params: Promise.resolve({ chapterId: chapter, assetId: asset }) })).status).toBe(409);
  await db.mediaAsset.update({ where: { id: asset }, data: { bytes: 3 } });
  await db.series.update({ where: { id: series }, data: { downloadsEnabled: false } }); expect((await GET(pageRequest(data.fingerprint), { params: Promise.resolve({ chapterId: chapter, assetId: asset }) })).status).toBe(403);
  expect(signed).toHaveLength(1);
});

test('upstream images enforce MIME, byte limits and bounded streams', async () => {
  const data = await manifest();
  for (const headers of [{ 'content-type': 'application/pdf', 'content-length': '3' }, { 'content-type': 'image/webp', 'content-length': '6291457' }, { 'content-type': 'image/webp', 'content-length': '4' }]) {
    upstream = () => new Response(new Uint8Array([1,2,3]), { headers });
    expect((await fetchChapterDownloadPage(chapter, asset, data.fingerprint)).status).toBe(503);
  }
  upstream = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(6291457)); controller.close(); } }), { headers: { 'content-type': 'image/webp' } });
  const response = await fetchChapterDownloadPage(chapter, asset, data.fingerprint); expect(response.status).toBe(200); await expect(response.arrayBuffer()).rejects.toThrow();
});

test('oversized chapters return an actionable page-limit error', async () => {
  await db.chapterPage.createMany({ data: Array.from({ length: 200 }, (_, index) => ({ chapterId: chapter, pageIndex: index + 1, imagePath: `/api/media/${asset}`, width: 800, height: 1200 })) });
  const response = await post();
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe('too_many_pages');
});
