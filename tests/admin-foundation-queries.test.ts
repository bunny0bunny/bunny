import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, mock, test } from 'bun:test';
mock.module('../src/components/admin/admin-client', () => ({ ChapterWorkflowControls: () => createElement('span', null, 'controls') }));
mock.module('server-only', () => ({}));
mock.module('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'admin', authVersion: 0 } }) }));
mock.module('../src/lib/auth', () => ({ authOptions: {} }));
const calls: Record<string, any> = {};
const chapter = (id: string, workflow: string, status?: string) => ({ id, series: { id: 's', titleAr: 'series', format: 'manga' }, number: 1, titleAr: 'public', workflow, publishedAt: workflow === 'published' ? new Date(0) : null, scheduledFor: null, novelBody: 'old words', _count: { pages: 2 }, revisions: status ? [{ status, titleAr: 'working', pagesJson: [{}, {}, {}], novelBody: 'new text here', scheduledFor: null }] : [] });
let rows: any[];
let featuredAvailable = true;
let hasReadableChapter = true;
const series = { id: 's', slug: 'chosen', titleAr: 'chosen', format: 'novel', status: 'ongoing', genresJson: '[]', coverPath: '', chapters: [{ publishedAt: new Date(0) }] };
mock.module('../src/lib/db', () => ({ db: {
 profile: { findUnique: async () => ({ id: 'admin', role: 'admin', authVersion: 0, emailVerifiedAt: new Date() }), count: async () => 1 },
 series: { count: async () => 1, findUnique: async (args: any) => { calls.detail = args; return { ...series, chapters: rows }; }, findMany: async (args: any) => { calls.series = args; return [series]; }, findFirst: async (args: any) => { calls.featured = args; return args.where.isFeatured && !featuredAvailable ? null : series; } },
 chapter: { count: async (args: any) => rows.filter(c => !args?.where?.workflow || c.workflow === args.where.workflow).length, findMany: async (args: any) => { calls.chapters = args; return rows; }, findFirst: async (args: any) => { calls.first = args; return hasReadableChapter ? { number: 4 } : null; } },
 analyticsEvent: { count: async () => 0, findMany: async () => [] },
 editorialCollection: { findMany: async (args: any) => { calls.collections = args; return []; } },
} }));
const queries = await import('../src/lib/queries');
beforeEach(() => { featuredAvailable = true; hasReadableChapter = true; rows = [chapter('replacement', 'published', 'draft'), chapter('submitted', 'draft', 'review'), chapter('legacy', 'draft')]; });
test('admin rows show latest revision content without replacing public workflow', async () => {
 const result = await queries.getAdminChapters({});
 expect(result[0]).toMatchObject({ workflow: 'published', workingStatus: 'draft', workingTitleAr: 'working', workingPageCount: 3, workingWordCount: 3 });
 expect(result[2]).toMatchObject({ workingStatus: 'draft', workingTitleAr: 'public', workingPageCount: 2 });
 expect(calls.chapters.include.revisions.orderBy).toEqual({ revisionNumber: 'desc' });
 expect(calls.chapters.include.revisions.take).toBe(1);
});
test('editorial filters find submitted revisions and published filter retains replacement drafts', async () => {
 expect((await queries.getAdminChapters({ workflow: 'review' })).map(c => c.id)).toEqual(['submitted']);
 expect((await queries.getAdminChapters({ workflow: 'published' })).map(c => c.id)).toEqual(['replacement']);
});
test('dashboard counts use latest working state, retaining independent publication count', async () => {
 const overview = await queries.getAdminOverview();
 expect(overview).toMatchObject({ chapterCount: 3, publishedCount: 1, draftCount: 2, reviewCount: 1 });
});
test('series detail uses same latest working status and pages', async () => {
 const result = await queries.getAdminSeriesById('s');
 expect(result?.chapters[0]).toMatchObject({ workflow: 'published', workingStatus: 'draft', workingPageCount: 3 });
});
test('only enabled editorial collections reach the home query', async () => {
 await queries.getFeaturedCollections();
 expect(calls.collections.where).toEqual({ isFeatured: true });
});
test('guest selection prefers enabled featured works with an unlocked live chapter and finds the real first chapter', async () => {
 const selection = await (queries as any).getGuestFeaturedSeries();
 expect(selection?.series.slug).toBe('chosen');
 expect(selection?.firstChapter.number).toBe(4);
 expect(calls.featured.where.isFeatured).toBe(true);
 expect(calls.featured.where.chapters.some.isPremiumDemo).toBe(false);
 expect(calls.first.orderBy).toEqual({ number: 'asc' });
});

test('guest selection falls back when no featured work is available and omits an unreadable start', async () => {
 featuredAvailable = false;
 expect((await queries.getGuestFeaturedSeries())?.series.slug).toBe('chosen');
 expect(calls.featured.where.isFeatured).toBeUndefined();
 expect(calls.featured.where.chapters.some.isPremiumDemo).toBe(false);
 hasReadableChapter = false;
 expect(await queries.getGuestFeaturedSeries()).toBeNull();
});
test('every editorial status filters independently and future public chapters are not counted live', async () => {
 rows = ['changes_requested', 'approved', 'scheduled', 'withdrawn'].map(status => chapter(status, 'draft', status));
 rows.push({ ...chapter('future', 'published', 'scheduled'), scheduledFor: new Date('2999-01-01') });
 for (const status of ['changes_requested', 'approved', 'withdrawn']) {
   expect((await queries.getAdminChapters({ workflow: status })).map(c => c.id)).toEqual([status]);
 }
 expect((await queries.getAdminChapters({ workflow: 'published' }))).toEqual([]);
 expect(await queries.getAdminOverview()).toMatchObject({ publishedCount: 0, changesRequestedCount: 1, approvedCount: 1, scheduledCount: 2 });
});

test('actual admin chapter page renders replacement status, public availability and latest page count', async () => {
 const { default: Page } = await import('../src/app/admin/chapters/page');
 const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
 expect(html).toContain('working');
 expect(html).toContain('النسخة العامة منشورة');
 expect(html).toContain('قيد المراجعة');
 expect(html).toContain('3 صفحة');
 expect(html).toContain('2 صفحة');
}, 30000);
