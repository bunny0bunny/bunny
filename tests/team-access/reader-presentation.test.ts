import {afterAll, beforeAll, expect, test} from 'bun:test';
import {actions, db, setActor} from './session-fixture';
import {getReaderProgress} from '../../src/lib/queries';

const tag = `presentation-${crypto.randomUUID()}`;
const ids: string[] = [];
let adminId: string, readerId: string;
const base = {titleOriginal: 'Presentation QA', titleAr: 'اختبار', synopsisAr: 'ملخص طويل لاختبار إعدادات القراءة الافتراضية', category: 'manga', format: 'manga', status: 'ongoing', author: 'QA Author', genres: ['شونين'], isFeatured: false};
beforeAll(async () => {
  for (const role of ['admin', 'reader'] as const) {
    const row = await db.profile.create({data: {email: `${tag}-${role}@bunny.test`, nickname: role, role, passwordHash: 'x', emailVerifiedAt: new Date()}});
    if (role === 'admin') adminId = row.id; else readerId = row.id;
  }
});
afterAll(async () => {
  setActor(null);
  await db.series.deleteMany({where: {id: {in: ids}}});
  await db.profile.deleteMany({where: {id: {in: [adminId, readerId]}}});
});
async function work() {
  setActor(adminId);
  const input = {...base, slug: `${tag}-${ids.length}`};
  const result = await actions.upsertSeries(input);
  expect(result.ok).toBe(true); ids.push(result.id!);
  return {...input, id: result.id!};
}

test('manga defaults persist, omitted edits retain them, and invalid defaults are rejected', async () => {
  const input = await work();
  const initial = await db.series.findUniqueOrThrow({where: {id: input.id}});
  expect(initial.defaultPresentation).toBe('paged'); expect(initial.defaultReadingDirection).toBe('rtl');
  expect((await actions.upsertSeries({...input, defaultPresentation: 'continuous', defaultReadingDirection: 'ltr'})).ok).toBe(true);
  expect((await actions.upsertSeries(input)).ok).toBe(true);
  const row = await db.series.findUniqueOrThrow({where: {id: input.id}});
  expect(row.defaultPresentation).toBe('continuous'); expect(row.defaultReadingDirection).toBe('ltr');
  expect((await actions.upsertSeries({...input, defaultPresentation: 'spread'})).ok).toBe(false);
  expect((await actions.upsertSeries({...input, defaultReadingDirection: 'up'})).ok).toBe(false);
  setActor(readerId); expect((await actions.upsertSeries({...input, defaultPresentation: 'paged'})).ok).toBe(false);
});

test('new chapter inherits current server default; explicit and existing directions survive default edits', async () => {
  const input = await work();
  await actions.upsertSeries({...input, defaultReadingDirection: 'ltr'});
  const chapterInput = {seriesId: input.id, number: 1, titleAr: 'فصل', workflow: 'draft', isPremiumDemo: false};
  const inherited = await actions.createChapter(chapterInput); expect(inherited.ok).toBe(true);
  expect((await db.chapter.findUniqueOrThrow({where: {id: inherited.id}})).readingDirection).toBe('ltr');
  const explicit = await actions.createChapter({...chapterInput, number: 2, readingDirection: 'rtl'}); expect(explicit.ok).toBe(true);
  await actions.upsertSeries({...input, defaultReadingDirection: 'rtl'});
  expect((await db.chapter.findUniqueOrThrow({where: {id: inherited.id}})).readingDirection).toBe('ltr');
  expect((await db.chapter.findUniqueOrThrow({where: {id: explicit.id}})).readingDirection).toBe('rtl');
  const next = await actions.createChapter({...chapterInput, number: 3}); expect(next.ok).toBe(true);
  expect((await db.chapter.findUniqueOrThrow({where: {id: next.id}})).readingDirection).toBe('rtl');
});

test('webtoon defaults do not apply manga comfort settings or chapter inheritance', async () => {
  setActor(adminId);
  const result = await actions.upsertSeries({...base, slug: `${tag}-${ids.length}`, format: 'webtoon', defaultPresentation: 'continuous', defaultReadingDirection: 'ltr'});
  expect(result.ok).toBe(true); ids.push(result.id!);
  const row = await db.series.findUniqueOrThrow({where: {id: result.id}});
  expect(row.defaultPresentation).toBe('paged'); expect(row.defaultReadingDirection).toBe('rtl');
  const chapter = await actions.createChapter({seriesId: row.id, number: 1, titleAr: 'فصل', workflow: 'draft', isPremiumDemo: false});
  expect(chapter.ok).toBe(true);
  expect((await db.chapter.findUniqueOrThrow({where: {id: chapter.id}})).readingDirection).toBe('rtl');
});

test('image offsets round trip, reject malformed input, preserve completion on concurrent rereads and deny unavailable chapters', async () => {
  const input = await work();
  const chapter = await db.chapter.create({data: {seriesId: input.id, number: 1, titleAr: 'فصل', workflow: 'published', publishedAt: new Date()}});
  const progress = {seriesSlug: input.slug, chapterNumber: 1, pageIndex: 2, percent: 45, completed: false, pageOffset: 0.375};
  setActor(readerId);
  expect((await actions.saveReadingProgress(progress)).ok).toBe(true);
  expect((await getReaderProgress(readerId, chapter.id))?.pageOffset).toBe(0.375);
  for (const pageOffset of [-0.01, 1.01, NaN, Infinity, '0.5']) expect((await actions.saveReadingProgress({...progress, pageOffset})).ok).toBe(false);
  expect((await getReaderProgress(readerId, chapter.id))?.pageOffset).toBe(0.375);
  expect((await actions.saveReadingProgress({...progress, percent: 100, completed: true, pageOffset: 1})).ok).toBe(true);
  const results = await Promise.all(Array.from({length: 5}, (_, i) => actions.saveReadingProgress({...progress, pageIndex: i, completed: false})));
  expect(results.every(r => r.ok)).toBe(true);
  expect((await db.readingProgress.findUniqueOrThrow({where: {profileId_chapterId: {profileId: readerId, chapterId: chapter.id}}})).completed).toBe(true);
  const {pageOffset: _offset, ...legacy} = progress;
  expect((await actions.saveReadingProgress(legacy)).ok).toBe(true);
  expect((await getReaderProgress(readerId, chapter.id))?.pageOffset).toBeNull();
  expect((await getReaderProgress(readerId, chapter.id))?.completed).toBe(true);
  expect((await actions.saveReadingProgress({...progress, pageOffset: null})).ok).toBe(true);
  expect((await getReaderProgress(readerId, chapter.id))?.completed).toBe(true);
  await db.chapter.update({where: {id: chapter.id}, data: {isPremiumDemo: true}});
  expect((await actions.saveReadingProgress(progress)).ok).toBe(false);
  expect(await getReaderProgress(readerId, chapter.id)).toBeNull();
  await db.chapter.update({where: {id: chapter.id}, data: {isPremiumDemo: false, scheduledFor: new Date(Date.now() + 86400000)}});
  expect((await actions.saveReadingProgress(progress)).ok).toBe(false);
  expect(await getReaderProgress(readerId, chapter.id)).toBeNull();
  await db.chapter.update({where: {id: chapter.id}, data: {isPremiumDemo: false, deletedAt: new Date()}});
  expect((await actions.saveReadingProgress(progress)).ok).toBe(false);
  expect(await getReaderProgress(readerId, chapter.id)).toBeNull();
  setActor(null); expect((await actions.saveReadingProgress(progress)).ok).toBe(false);
});
