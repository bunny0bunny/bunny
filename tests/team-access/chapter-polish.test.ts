import { afterAll, beforeAll, expect, test } from 'bun:test';
import { actions, db, setActor } from './session-fixture';
import { getChapterLabel, getChapterTitle } from '../../src/lib/chapter-title';
import { downloadFilename } from '../../src/lib/downloads/policy';
import { openOrCreateDraft, updateDraftSnapshot, submitForReview, approveRevision, publishRevisionNow, validateRevisionContent } from '../../src/lib/editorial';
import { getTrashPreview, moveToTrash, restoreTrash } from '../../src/lib/content-trash/service';

const tag = `chapter-polish-${crypto.randomUUID()}`;
let adminId: string;
const roots: string[] = [];
beforeAll(async () => {
  adminId = (await db.profile.create({ data: { email: `${tag}@bunny.test`, nickname: 'Chapter QA', role: 'admin', passwordHash: 'x', emailVerifiedAt: new Date() } })).id;
  setActor(adminId);
});
afterAll(async () => {
  setActor(null);
  await db.contentTrash.deleteMany({ where: { seriesId: { in: roots } } });
  const chapters = await db.chapter.findMany({where:{seriesId:{in:roots}},select:{id:true}});
  const publications = await db.chapterPublication.findMany({where:{seriesId:{in:roots}},select:{id:true}});
  await db.notification.deleteMany({where:{OR:[{href:{in:chapters.map(c=>`/studio/chapters/${c.id}`)}},{publicationId:{in:publications.map(p=>p.id)}}]}});
  await db.chapterPublication.deleteMany({where:{seriesId:{in:roots}}});
  await db.series.deleteMany({ where: { id: { in: roots } } });
  await db.profile.delete({ where: { id: adminId } });
});
async function series() {
  const row = await db.series.create({ data: { slug: `${tag}-${roots.length}`, titleOriginal: 'Chapter QA', titleAr: 'عمل', synopsisAr: 'Test', author: 'QA', format: 'novel', coverPath: '' } });
  roots.push(row.id); return row;
}
async function create(seriesId: string, number: number, titleAr?: string) {
  return actions.createChapter({ seriesId, number, ...(titleAr === undefined ? {} : { titleAr }), workflow: 'draft', isPremiumDemo: false, novelBody: 'Actual chapter body.' });
}
async function trash(kind: 'series' | 'chapter', id: string) {
  const preview = await getTrashPreview(kind, id);
  expect(preview.ok).toBe(true); expect(preview.data).not.toBeNull();
  const result = await moveToTrash({ kind, id, expectedUpdatedAt: preview.data!.updatedAt, confirmation: preview.data!.confirmation });
  expect(result.ok).toBe(true); return result.id!;
}

test('deleted chapter 20 permits a new identity; restore collision preserves both and archived history', async () => {
  const work = await series();
  const old = await create(work.id, 20, 'Old title'); expect(old.ok).toBe(true);
  const originalRevision = (await openOrCreateDraft(old.id!)).revision!;
  const approved = await approveRevision({ revisionId: originalRevision.id, expectedVersion: originalRevision.version }); expect(approved.ok).toBe(true);
  expect((await publishRevisionNow({ revisionId: originalRevision.id, expectedVersion: approved.revision!.version })).ok).toBe(true);
  const publication = await db.chapterPublication.findUniqueOrThrow({ where: { chapterId: old.id } });
  const journal = await trash('chapter', old.id!);
  const before = await db.chapterRevision.findUniqueOrThrow({ where: { id: originalRevision.id } });
  const replacement = await create(work.id, 20); expect(replacement.ok).toBe(true); expect(replacement.id).not.toBe(old.id);
  expect((await create(work.id, 20, 'Duplicate')).ok).toBe(false);
  expect((await restoreTrash({ id: journal, expectedVersion: 1 })).error).toBe('chapter_number_conflict');
  expect(await db.chapterRevision.findUniqueOrThrow({ where: { id: originalRevision.id } })).toEqual(before);
  expect(await db.chapterRevision.count({ where: { chapterId: old.id } })).toBe(1);
  expect(await db.chapterPublication.findUniqueOrThrow({ where: { id: publication.id } })).toEqual(publication);
  expect(await db.chapterPublication.count({ where: { chapterId: replacement.id } })).toBe(0);
  expect((await db.chapter.findUniqueOrThrow({ where: { id: old.id } })).deletedAt).not.toBeNull();
  expect((await db.chapter.findUniqueOrThrow({ where: { id: replacement.id } })).deletedAt).toBeNull();
  expect((await db.contentTrash.findUniqueOrThrow({ where: { id: journal } })).state).toBe('trashed');
  await trash('chapter', replacement.id!);
  expect((await restoreTrash({ id: journal, expectedVersion: 1 })).ok).toBe(true);
  expect((await db.chapter.findUniqueOrThrow({ where: { id: old.id } })).deletedAt).toBeNull();
  expect((await db.chapter.findUniqueOrThrow({ where: { id: replacement.id } })).deletedAt).not.toBeNull();
  expect(await db.chapter.count({ where: { seriesId: work.id, number: 20 } })).toBe(2);
});

test('concurrent creation has one active winner and a clear duplicate failure', async () => {
  const work = await series();
  const results = await Promise.all([create(work.id, 20), create(work.id, 20)]);
  expect(results.filter(r => r.ok)).toHaveLength(1);
  expect(results.find(r => !r.ok)?.error).toBe('رقم الفصل مستخدم في هذا العمل');
  expect(await db.chapter.count({ where: { seriesId: work.id, number: 20, deletedAt: null } })).toBe(1);
});

test('series restore rejects the whole batch before invalidating any revisions', async () => {
  const work = await series();
  const first = await create(work.id, 20, 'First'); const second = await create(work.id, 21, 'Second');
  expect(first.ok && second.ok).toBe(true);
  await openOrCreateDraft(first.id!); await openOrCreateDraft(second.id!);
  const journal = await trash('series', work.id);
  // Model a preexisting conflicting active row while the parent is archived.
  const live = await db.chapter.create({ data: { seriesId: work.id, number: 21, titleAr: 'Conflict' } });
  const before = await db.chapterRevision.findMany({ where: { chapterId: { in: [first.id!, second.id!] } }, orderBy: { id: 'asc' } });
  expect((await restoreTrash({ id: journal, expectedVersion: 1 })).error).toBe('chapter_number_conflict');
  expect(await db.chapterRevision.findMany({ where: { chapterId: { in: [first.id!, second.id!] } }, orderBy: { id: 'asc' } })).toEqual(before);
  expect((await db.series.findUniqueOrThrow({ where: { id: work.id } })).deletedAt).not.toBeNull();
  expect(await db.chapter.count({ where: { id: { in: [first.id!, second.id!] }, deletedAt: { not: null } } })).toBe(2);
  await db.chapter.update({ where: { id: live.id }, data: { deletedAt: new Date() } });
  expect((await restoreTrash({ id: journal, expectedVersion: 1 })).ok).toBe(true);
});

test('omitted, whitespace and one-character titles can be reviewed and published with actual content', async () => {
  const work = await series();
  for (const [index, title] of [undefined, '   ', 'س'].entries()) {
    const result = await create(work.id, 20 + index / 10, title); expect(result.ok).toBe(true);
    expect((await db.chapter.findUniqueOrThrow({ where: { id: result.id } })).titleAr).toBe(title?.trim() ?? '');
    let revision = (await openOrCreateDraft(result.id!)).revision!;
    const saved = await updateDraftSnapshot({ revisionId: revision.id, expectedVersion: revision.version, titleAr: title ?? '' });
    expect(saved.ok).toBe(true); revision = saved.revision!;
    const reviewed = await submitForReview({ revisionId: revision.id, expectedVersion: revision.version }); expect(reviewed.ok).toBe(true);
    const approved = await approveRevision({ revisionId: revision.id, expectedVersion: reviewed.revision!.version }); expect(approved.ok).toBe(true);
    const published = await publishRevisionNow({ revisionId: revision.id, expectedVersion: approved.revision!.version }); expect(published.ok).toBe(true);
    expect((await db.chapter.findUniqueOrThrow({ where: { id: result.id } })).titleAr).toBe(title?.trim() ?? '');
  }
});

test('optional title never permits missing body or pages; display and filename stay usable', async () => {
  expect(validateRevisionContent('novel', { titleAr: '', novelBody: '  ' }).valid).toBe(false);
  expect(validateRevisionContent('manga', { titleAr: '', pagesJson: [] }).valid).toBe(false);
  expect(validateRevisionContent('novel', { titleAr: 'x'.repeat(301), novelBody: 'Body' }).valid).toBe(false);
  const work = await series(); const chapter = await create(work.id, 20, '  '); expect(chapter.ok).toBe(true);
  let revision = (await openOrCreateDraft(chapter.id!)).revision!;
  const saved = await updateDraftSnapshot({ revisionId: revision.id, expectedVersion: revision.version, novelBody: '   ' }); expect(saved.ok).toBe(true); revision = saved.revision!;
  expect((await submitForReview({ revisionId: revision.id, expectedVersion: revision.version })).ok).toBe(false);
  expect((await approveRevision({ revisionId: revision.id, expectedVersion: revision.version })).ok).toBe(false);
  const preview = (await getTrashPreview('chapter', chapter.id!)).data!;
  expect(preview.confirmation).toBe('الفصل 20'); expect(preview.title).toBe('Chapter QA — الفصل 20');
  const journal = await trash('chapter', chapter.id!);
  expect((await db.contentTrash.findUniqueOrThrow({ where: { id: journal } })).title).toBe(preview.title);
  expect(getChapterTitle({ number: 20, titleAr: ' ' })).toBe('الفصل 20');
  expect(getChapterLabel({ number: 20, titleAr: 'الفصل 20' })).toBe('الفصل 20');
  expect(downloadFilename({ titleOriginal: '', titleAr: '' }, 20)).toBe('Chapter - Chapter 20.pdf');
  expect(downloadFilename({ titleOriginal: 'Title / unsafe', titleAr: '' }, 20.5)).toBe('Title _ unsafe - Chapter 20.5.pdf');
});
