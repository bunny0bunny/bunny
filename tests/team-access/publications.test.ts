import { expect, test } from 'bun:test';
import { db } from './session-fixture';
import { discoverLegacyPublications, baselineLegacyPublications } from '../../src/lib/publications/legacy';
import { drainPublications } from '../../src/lib/publications/service';
test('legacy discovery is read-only and baseline is insert-only without replay', async () => {
    const before = await db.chapter.count();
    const found = await discoverLegacyPublications();
    expect(found.historical.length).toBeGreaterThan(0);
    await baselineLegacyPublications({ allowAmbiguous: true });
    expect((await baselineLegacyPublications({ allowAmbiguous: true })).created).toBe(0);
    expect(await db.chapter.count()).toBe(before);
    expect(await db.chapterPublication.count({ where: { state: 'pending' } })).toBe(0);
    expect((await drainPublications()).delivered).toBe(0);
});
import { recordChapterPublication } from '../../src/lib/publications/service';
import { getNotifications } from '../../src/lib/notifications';
import { Prisma } from '@prisma/client';
async function fixture(suffix: string) {
    const series = await db.series.create({ data: {
            slug: 'publication-' + suffix, titleAr: 'عنوان عربي', titleOriginal: 'English Release', format: 'novel', synopsisAr: 'اختبار', author: 'Author', coverPath: ''
        } });
    const identity = await db.publicIdentity.create({ data: { slug: 'publication-' + suffix, displayName: 'Release Team' } });
    await db.seriesCredit.create({ data: {
            seriesId: series.id, identityId: identity.id, role: 'translation'
        } });
    const chapter = await db.chapter.create({ data: {
            seriesId: series.id, number: 1, titleAr: 'عنوان فصل', novelBody: 'Content'
        } });
    const revision = await db.chapterRevision.create({ data: {
            chapterId: chapter.id, revisionNumber: 1, titleAr: chapter.titleAr, status: 'approved', approvedAt: new Date(), novelBody: 'Content'
        } });
    return {
        series, identity, chapter, revision
    };
}
async function publish(f: Awaited<ReturnType<typeof fixture>>) {
    await db.$transaction(async (tx) => {
        await recordChapterPublication(tx, f.chapter.id, f.revision.id);
        await tx.chapter.update({ where: { id: f.chapter.id }, data: { workflow: 'published', publishedAt: new Date() } });
        await tx.chapterRevision.update({ where: { id: f.revision.id }, data: { status: 'published' } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return db.chapterPublication.findUniqueOrThrow({ where: { chapterId: f.chapter.id } });
}
async function clean(f: Awaited<ReturnType<typeof fixture>>) {
    const ownedChapters = await db.chapter.findMany({ where: { seriesId: f.series.id }, select: { id: true } });
    await db.contentTrash.deleteMany({ where: { OR: [{ seriesId: f.series.id }, { entityId: { in: [f.series.id, ...ownedChapters.map(c => c.id)] } }] } });
    await db.chapterPublication.deleteMany({ where: { seriesId: f.series.id } });
    await db.series.delete({ where: { id: f.series.id } });
    await db.publicIdentity.delete({ where: { id: f.identity.id } });
}
test('bounded union audience reaches later pages once and excludes late follows', async () => {
    const f = await fixture('union');
    const readers = [];
    for (let i = 0; i < 4; i++)
        readers.push(await db.profile.create({ data: {
                email: `publication-union-${i}@bunny.test`, nickname: 'Reader', passwordHash: 'x', emailVerifiedAt: new Date()
            } }));
    try {
        for (const reader of readers.slice(0, 3)) {
            await db.libraryItem.create({ data: {
                    profileId: reader.id, seriesId: f.series.id, shelf: 'reading'
                } });
            await db.identityFollow.create({ data: {
                    profileId: reader.id, identityId: f.identity.id, alertsEnabledAt: new Date()
                } });
        }
        const event = await publish(f);
        await db.identityFollow.create({ data: {
                profileId: readers[3].id, identityId: f.identity.id, alertsEnabledAt: new Date(event.eventAt.getTime() + 1000)
            } });
        let delivered = 0;
        for (let i = 0; i < 5; i++)
            delivered += (await drainPublications({ recipientLimit: 1 })).delivered;
        expect(await db.notification.count({ where: { publicationId: event.id } })).toBe(3);
        expect(await db.notification.count({ where: { publicationId: event.id, profileId: readers[3].id } })).toBe(0);
        expect(delivered).toBeGreaterThanOrEqual(3);
        expect((await db.chapterPublication.findUniqueOrThrow({ where: { id: event.id } })).state).toBe('completed');
        await db.$transaction(tx => recordChapterPublication(tx, f.chapter.id, f.revision.id));
        expect(await db.chapterPublication.count({ where: { chapterId: f.chapter.id } })).toBe(1);
    }
    finally {
        await clean(f);
        await db.profile.deleteMany({ where: { id: { in: readers.map(r => r.id) } } });
    }
});
test('hidden targets suppress terminally and missing delivered targets lose links; unrelated messages persist', async () => {
    const f = await fixture('hidden');
    try {
        const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
        const event = await publish(f);
        await db.chapter.update({ where: { id: f.chapter.id }, data: { workflow: 'draft' } });
        expect((await drainPublications()).suppressed).toBe(1);
        await db.chapter.update({ where: { id: f.chapter.id }, data: { workflow: 'published' } });
        expect((await drainPublications()).delivered).toBe(0);
        await db.notification.create({ data: {
                profileId: admin.id, publicationId: event.id, type: 'new_chapter', titleAr: 'Release', href: '/old'
            } });
        const system = await db.notification.create({ data: {
                profileId: admin.id, type: 'system', titleAr: 'System', bodyAr: 'Body', href: '/profile'
            } });
        await db.chapter.delete({ where: { id: f.chapter.id } });
        const rows = await getNotifications(admin.id, 100);
        expect(rows.find(n => n.type === 'new_chapter' && n.titleAr === 'غير متاح')?.href).toBeNull();
        expect(rows.find(n => n.id === system.id)?.href).toBe('/profile');
        await db.notification.delete({ where: { id: system.id } });
    }
    finally {
        await clean(f);
    }
});
test('overlapping drains dedupe recipients and adult premium output omits chapter title', async () => {
    const f = await fixture('concurrent');
    try {
        const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
        await db.libraryItem.create({ data: {
                profileId: admin.id, seriesId: f.series.id, shelf: 'reading'
            } });
        const event = await publish(f);
        await db.series.update({ where: { id: f.series.id }, data: { isAdult: true } });
        await db.chapter.update({ where: { id: f.chapter.id }, data: { isPremiumDemo: true } });
        await Promise.all([drainPublications(), drainPublications()]);
        const notifications = await db.notification.findMany({ where: { publicationId: event.id } });
        expect(notifications.length).toBe(1);
        expect(notifications[0].titleAr).toContain('English Release +18');
        expect(notifications[0].bodyAr).not.toContain(f.chapter.titleAr);
        expect(notifications[0].bodyAr).toContain('مقفل');
        const feed = await getNotifications(admin.id,100);
        expect(feed.find(row=>row.id===notifications[0].id)?.titleAr).toContain('عمل جديد');
    }
    finally {
        await clean(f);
    }
});
test('ambiguous zero revision trash is reported and default baseline refuses it', async () => {
    const f = await fixture('ambiguity');
    try {
        await db.chapterRevision.delete({ where: { id: f.revision.id } });
        const trash = await db.contentTrash.create({ data: {
                entityType: 'chapter', entityId: f.chapter.id, title: 'Ambiguous', purgeAfter: new Date(Date.now() + 100000), state: 'restored'
            } });
        expect((await discoverLegacyPublications()).ambiguous.some(c => c.chapterId === f.chapter.id)).toBe(true);
        await expect(baselineLegacyPublications()).rejects.toThrow('ambiguous_legacy_publications');
        await db.contentTrash.delete({ where: { id: trash.id } });
    }
    finally {
        await clean(f);
    }
});
test('suspended identities are not snapshotted and reactivation cannot retarget a release', async () => {
    const f = await fixture('suspended');
    try {
        const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
        await db.identityFollow.create({ data: {
                profileId: admin.id, identityId: f.identity.id, alertsEnabledAt: new Date()
            } });
        await db.publicIdentity.update({ where: { id: f.identity.id }, data: { status: 'suspended' } });
        const event = await publish(f);
        expect(event.creditsSnapshot).toEqual([]);
        await db.publicIdentity.update({ where: { id: f.identity.id }, data: { status: 'active' } });
        expect((await drainPublications()).delivered).toBe(0);
    }
    finally {
        await clean(f);
    }
});
test('muted identity does not suppress shelf and disabled account never receives release', async () => {
    const f = await fixture('muted');
    const reader = await db.profile.create({ data: {
            email: 'publication-muted@bunny.test', nickname: 'Muted', passwordHash: 'x', emailVerifiedAt: new Date()
        } });
    try {
        const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
        await db.identityFollow.createMany({ data: [{
                    profileId: admin.id, identityId: f.identity.id, alertsEnabledAt: null
                }, {
                    profileId: reader.id, identityId: f.identity.id, alertsEnabledAt: new Date()
                }] });
        await db.libraryItem.create({ data: {
                profileId: admin.id, seriesId: f.series.id, shelf: 'reading'
            } });
        const event = await publish(f);
        await db.profile.update({ where: { id: reader.id }, data: { disabledAt: new Date() } });
        expect((await drainPublications()).delivered).toBe(1);
        expect(await db.notification.count({ where: { publicationId: event.id, profileId: reader.id } })).toBe(0);
    }
    finally {
        await clean(f);
        await db.profile.delete({ where: { id: reader.id } });
    }
});
test('active lease skips work; expired lease safely resumes cursor', async () => {
    const f = await fixture('lease');
    try {
        const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
        await db.libraryItem.create({ data: {
                profileId: admin.id, seriesId: f.series.id, shelf: 'reading'
            } });
        const event = await publish(f);
        const now = new Date();
        await db.chapterPublication.update({ where: { id: event.id }, data: { leaseToken: 'busy-worker', leaseUntil: new Date(now.getTime() + 60000) } });
        expect((await drainPublications({ now })).examined).toBe(0);
        expect((await drainPublications({ now: new Date(now.getTime() + 60001) })).delivered).toBe(1);
        await drainPublications({ now: new Date(now.getTime() + 60001) });
        expect(await db.notification.count({ where: { publicationId: event.id } })).toBe(1);
    }
    finally {
        await clean(f);
    }
});
import { setActor, withActor } from './session-fixture';
import { publishRevisionNow, withdrawPublishedChapter, openOrCreateDraft, approveRevision, submitForReview } from '../../src/lib/editorial';
test('concurrent first chapters produce one debut under the actual editorial retry path', async () => {
    const f = await fixture('debut');
    try {
        const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
        const chapter = await db.chapter.create({ data: {
                seriesId: f.series.id, number: 2, titleAr: 'عنوان ثاني', novelBody: 'Second Content'
            } });
        const revision = await db.chapterRevision.create({ data: {
                chapterId: chapter.id, revisionNumber: 1, titleAr: chapter.titleAr, status: 'approved', approvedAt: new Date(), novelBody: 'Second Content'
            } });
        const results = await Promise.all([f.revision, revision].map(r => withActor(admin.id, () => publishRevisionNow({ revisionId: r.id, expectedVersion: r.version }))));
        expect(results.every(r => r.ok)).toBe(true);
        expect(await db.chapterPublication.count({ where: { seriesId: f.series.id } })).toBe(2);
        expect(await db.chapterPublication.count({ where: { seriesId: f.series.id, seriesDebut: true } })).toBe(1);
    }
    finally {
        await clean(f);
    }
});
test('actual withdrawal and republication, then trash restoration, never enqueue a second alert', async () => {
    const f = await fixture('lifecycle');
    try {
        const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
        setActor(admin.id);
        await db.libraryItem.create({ data: {
                profileId: admin.id, seriesId: f.series.id, shelf: 'reading'
            } });
        const first = await publishRevisionNow({ revisionId: f.revision.id, expectedVersion: 1 });
        expect(first.ok).toBe(true);
        const event = await db.chapterPublication.findUniqueOrThrow({ where: { chapterId: f.chapter.id } });
        await drainPublications();
        expect((await withdrawPublishedChapter({
            chapterId: f.chapter.id, expectedRevisionId: first.revision!.id, expectedVersion: first.revision!.version, reason: 'Correct content'
        })).ok).toBe(true);
        const draft = await openOrCreateDraft(f.chapter.id);
        const approved = await approveRevision({ revisionId: draft.revision!.id, expectedVersion: draft.revision!.version });
        expect((await publishRevisionNow({ revisionId: approved.revision!.id, expectedVersion: approved.revision!.version })).ok).toBe(true);
        const trashId = await moveFixtureToTrash('chapter', f.chapter.id);
        expect((await restoreTrash({ id: trashId, expectedVersion: 1 })).ok).toBe(true);
        const restoredDraft = await openOrCreateDraft(f.chapter.id);
        expect(restoredDraft.ok).toBe(true);
        const submitted = await submitForReview({ revisionId: restoredDraft.revision!.id, expectedVersion: restoredDraft.revision!.version });
        expect(submitted.ok).toBe(true);
        const restoredApproved = await approveRevision({ revisionId: submitted.revision!.id, expectedVersion: submitted.revision!.version });
        expect(restoredApproved.ok).toBe(true);
        expect((await publishRevisionNow({ revisionId: restoredApproved.revision!.id, expectedVersion: restoredApproved.revision!.version })).ok).toBe(true);
        await drainPublications();
        expect(await db.chapterPublication.count({ where: { chapterId: f.chapter.id } })).toBe(1);
        expect(await db.notification.count({ where: { publicationId: event.id } })).toBe(1);
    }
    finally {
        setActor(null);
        await clean(f);
    }
});
test('lost cursor CAS rolls back notification inserts in the same page transaction', async () => {
    const f = await fixture('cas');
    try {
        const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
        await db.libraryItem.create({ data: {
                profileId: admin.id, seriesId: f.series.id, shelf: 'reading'
            } });
        const event = await publish(f);
        expect(event.id).toMatch(/^[a-z0-9]+$/);
        await db.$executeRawUnsafe(`CREATE FUNCTION publication_test_steal_lease() RETURNS trigger AS $$ BEGIN IF NEW."publicationId" = '${event.id}' THEN UPDATE "ChapterPublication" SET "leaseToken"='stolen' WHERE id=NEW."publicationId"; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
        await db.$executeRawUnsafe('CREATE TRIGGER publication_test_steal BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION publication_test_steal_lease()');
        try {
            expect((await drainPublications()).failed).toBe(1);
            expect(await db.notification.count({ where: { publicationId: event.id } })).toBe(0);
            expect((await db.chapterPublication.findUniqueOrThrow({ where: { id: event.id } })).cursorProfileId).toBeNull();
        }
        finally {
            await db.$executeRawUnsafe('DROP TRIGGER publication_test_steal ON "Notification"');
            await db.$executeRawUnsafe('DROP FUNCTION publication_test_steal_lease()');
        }
        expect((await drainPublications()).delivered).toBe(1);
    }
    finally {
        await clean(f);
    }
});
test('legacy evidence excludes pseudo-public future schedules and merely withdrawn drafts; unknown history stays null', async () => {
    const f = await fixture('evidence');
    try {
        await db.chapter.update({ where: { id: f.chapter.id }, data: {
                workflow: 'published', publishedAt: new Date(), scheduledFor: new Date(Date.now() + 86400000)
            } });
        expect((await discoverLegacyPublications()).historical.some(h => h.chapterId === f.chapter.id)).toBe(false);
        await db.chapter.update({ where: { id: f.chapter.id }, data: {
                workflow: 'draft', publishedAt: null, scheduledFor: null, deletedAt: new Date()
            } });
        await db.chapterRevision.update({ where: { id: f.revision.id }, data: { status: 'withdrawn' } });
        expect((await discoverLegacyPublications()).historical.some(h => h.chapterId === f.chapter.id)).toBe(false);
        await db.chapterRevision.update({ where: { id: f.revision.id }, data: { status: 'published' } });
        const found = (await discoverLegacyPublications()).historical.find(h => h.chapterId === f.chapter.id);
        expect(found?.firstPublishedAt).toBeNull();
        await baselineLegacyPublications();
        const event = await db.chapterPublication.findUniqueOrThrow({ where: { chapterId: f.chapter.id } });
        expect(event.firstPublishedAt).toBeNull();
        expect(event.state).toBe('baseline');
        expect(event.evidenceJson).toContain('baseline_recorded_at_eventAt');
    }
    finally {
        await clean(f);
    }
});
import { getTrashPreview, moveToTrash, restoreTrash } from '../../src/lib/content-trash/service';
async function moveFixtureToTrash(kind: 'chapter' | 'series', id: string) {
    const preview = await getTrashPreview(kind, id);
    expect(preview.ok).toBe(true);
    expect(preview.data).not.toBeNull();
    const result = await moveToTrash({
        kind, id, expectedUpdatedAt: preview.data!.updatedAt, confirmation: preview.data!.confirmation
    });
    expect(result.ok).toBe(true);
    return result.id!;
}
async function submitApprovePublish(chapterId: string) {
    const draft = await openOrCreateDraft(chapterId);
    expect(draft.ok).toBe(true);
    const submitted = await submitForReview({ revisionId: draft.revision!.id, expectedVersion: draft.revision!.version });
    expect(submitted.ok).toBe(true);
    const approved = await approveRevision({ revisionId: submitted.revision!.id, expectedVersion: submitted.revision!.version });
    expect(approved.ok).toBe(true);
    return publishRevisionNow({ revisionId: approved.revision!.id, expectedVersion: approved.revision!.version });
}
test('series trash membership excludes a new zero revision chapter created after restoration', async () => {
    const f = await fixture('trash-membership');
    try {
        const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
        setActor(admin.id);
        await db.chapterRevision.delete({ where: { id: f.revision.id } });
        const trashId = await moveFixtureToTrash('series', f.series.id);
        expect((await restoreTrash({ id: trashId, expectedVersion: 1 })).ok).toBe(true);
        const added = await db.chapter.create({ data: {
                seriesId: f.series.id, number: 2, titleAr: 'New unpublished chapter', novelBody: 'New content'
            } });
        const found = await discoverLegacyPublications(undefined, f.series.id);
        expect(found.ambiguous.some(c => c.chapterId === f.chapter.id)).toBe(true);
        expect(found.ambiguous.some(c => c.chapterId === added.id)).toBe(false);
    }
    finally {
        setActor(null);
        await clean(f);
    }
});
test('zero revision trash history stays ambiguous after lazy initialization and approval and publishes silently', async () => {
    const f = await fixture('lazy-history');
    try {
        const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
        setActor(admin.id);
        await db.libraryItem.create({ data: {
                profileId: admin.id, seriesId: f.series.id, shelf: 'reading'
            } });
        await db.chapterRevision.delete({ where: { id: f.revision.id } });
        const trashId = await moveFixtureToTrash('chapter', f.chapter.id);
        expect((await restoreTrash({ id: trashId, expectedVersion: 1 })).ok).toBe(true);
        expect((await discoverLegacyPublications(undefined, f.series.id)).ambiguous.some(c => c.chapterId === f.chapter.id)).toBe(true);
        const draft = await openOrCreateDraft(f.chapter.id);
        expect(draft.ok).toBe(true);
        const submitted = await submitForReview({ revisionId: draft.revision!.id, expectedVersion: draft.revision!.version });
        expect(submitted.ok).toBe(true);
        const approved = await approveRevision({ revisionId: submitted.revision!.id, expectedVersion: submitted.revision!.version });
        expect(approved.ok).toBe(true);
        expect((await discoverLegacyPublications(undefined, f.series.id)).ambiguous.some(c => c.chapterId === f.chapter.id)).toBe(true);
        expect((await publishRevisionNow({ revisionId: approved.revision!.id, expectedVersion: approved.revision!.version })).ok).toBe(true);
        const event = await db.chapterPublication.findUniqueOrThrow({ where: { chapterId: f.chapter.id } });
        expect(event.state).toBe('baseline');
        expect(event.evidenceJson).toContain('ambiguous_prior_trash');
        await drainPublications();
        expect(await db.notification.count({ where: { publicationId: event.id } })).toBe(0);
    }
    finally {
        setActor(null);
        await clean(f);
    }
});
test('a genuine draft revision predating its trash remains eligible for first publication', async () => {
    const f = await fixture('draft-history');
    try {
        const admin = await db.profile.findUniqueOrThrow({ where: { email: 'admin@bunny.demo' } });
        setActor(admin.id);
        await db.chapterRevision.update({ where: { id: f.revision.id }, data: {
                status: 'draft', approvedAt: null, createdAt: new Date(Date.now() - 86400000)
            } });
        const trashId = await moveFixtureToTrash('chapter', f.chapter.id);
        expect((await restoreTrash({ id: trashId, expectedVersion: 1 })).ok).toBe(true);
        expect((await discoverLegacyPublications(undefined, f.series.id)).ambiguous.some(c => c.chapterId === f.chapter.id)).toBe(false);
        expect((await submitApprovePublish(f.chapter.id)).ok).toBe(true);
        expect((await db.chapterPublication.findUniqueOrThrow({ where: { chapterId: f.chapter.id } })).state).toBe('pending');
    }
    finally {
        setActor(null);
        await clean(f);
    }
});
