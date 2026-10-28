import 'server-only';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { getWorkTitle } from '@/lib/work-title';
import type { LegacyPublicationDiscovery } from './contracts';
type Tx = Prisma.TransactionClient;
/** Evidence is inspected before projection writes; withdrawn revision status alone is never proof. */
export async function discoverLegacyPublications(tx: Tx = db, seriesId?: string): Promise<LegacyPublicationDiscovery> {
    const now = new Date();
    const [chapters, analytics] = await Promise.all([tx.chapter.findMany({ where: seriesId ? { seriesId } : {}, select: {
                id: true, seriesId: true, workflow: true, scheduledFor: true, publishedAt: true, deletedAt: true, trashBatchId: true, series: { select: { deletedAt: true } }, revisions: { orderBy: { revisionNumber: 'asc' }, select: {
                        status: true, revisionNumber: true, createdAt: true
                    } }, editorialEvents: { where: { action: { in: ['publish_now', 'publish_due_scheduled', 'withdraw_chapter'] } }, select: { action: true, createdAt: true } }
            } }), tx.analyticsEvent.findMany({ where: { type: 'publish', ...(seriesId ? { seriesId } : {}) }, select: { chapterId: true, createdAt: true } })]);
    const trash = await tx.contentTrash.findMany({ where: seriesId ? { OR: [{ seriesId }, { entityType: 'series', entityId: seriesId }, { entityType: 'chapter', entityId: { in: chapters.map(c => c.id) } }, { id: { in: chapters.flatMap(c => c.trashBatchId ? [c.trashBatchId] : []) } }] } : {}, select: {
            id: true, deletedAt: true, entityType: true, entityId: true, detailsJson: true
        } });
    const result: LegacyPublicationDiscovery = { historical: [], ambiguous: [] };
    for (const chapter of chapters) {
        const future = !!chapter.scheduledFor && chapter.scheduledFor > now;
        const evidence: string[] = [];
        if (chapter.workflow === 'published' && !future && !chapter.deletedAt && !chapter.series.deletedAt)
            evidence.push('currently_live');
        if (chapter.revisions.some(r => r.status === 'published'))
            evidence.push('published_revision');
        for (const event of chapter.editorialEvents)
            evidence.push(event.action);
        const publishes = analytics.filter(a => a.chapterId === chapter.id);
        if (publishes.length)
            evidence.push('publish_analytics');
        if (chapter.publishedAt && !future)
            evidence.push('published_at');
        if (evidence.length) {
            const dates = [...publishes.map(a => a.createdAt), ...chapter.editorialEvents.filter(e => e.action !== 'withdraw_chapter').map(e => e.createdAt), ...(!future && chapter.publishedAt ? [chapter.publishedAt] : [])];
            result.historical.push({
                chapterId: chapter.id, seriesId: chapter.seriesId, evidence: [...new Set(evidence)], firstPublishedAt: dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))).toISOString() : null
            });
        }
        else {
            const firstRevision = chapter.revisions[0];
            const lostHistory = trash.some(journal => {
                const details = journal.detailsJson;
                // A series journal is not evidence that a child belonged to that batch.
                const exactMember = journal.entityType === 'chapter' && journal.entityId === chapter.id
                    || chapter.trashBatchId === journal.id
                    || !!details && typeof details === 'object' && !Array.isArray(details)
                        && Array.isArray(details.chapterIds) && details.chapterIds.includes(chapter.id);
                // Lazy initialization after trash cannot reconstruct the missing pre-trash history.
                // An existing first draft before every trash entry remains a genuine new release.
                return exactMember && (!firstRevision || firstRevision.createdAt >= journal.deletedAt);
            });
            if (lostHistory)
                result.ambiguous.push({ chapterId: chapter.id, seriesId: chapter.seriesId });
        }
    }
    return result;
}
export async function baselineLegacyPublications(options: {
    allowAmbiguous?: boolean;
} = {}): Promise<{
    created: number;
    ambiguous: number;
}> {
    return db.$transaction(async (tx) => {
        const found = await discoverLegacyPublications(tx);
        if (found.ambiguous.length && !options.allowAmbiguous)
            throw new Error(`ambiguous_legacy_publications:${found.ambiguous.length}`);
        let created = 0;
        for (const item of [...found.historical, ...(options.allowAmbiguous ? found.ambiguous.map(c => ({
                ...c, evidence: ['ambiguous_prior_trash'], firstPublishedAt: null
            })) : [])]) {
            const ch = await tx.chapter.findUnique({ where: { id: item.chapterId }, include: { series: true } });
            if (!ch)
                continue;
            created += (await tx.chapterPublication.createMany({ skipDuplicates: true, data: [{
                        chapterId: ch.id, seriesId: ch.seriesId, state: 'baseline', evidenceJson: [...item.evidence, 'baseline_recorded_at_eventAt'], firstPublishedAt: item.firstPublishedAt ? new Date(item.firstPublishedAt) : null, seriesTitle: getWorkTitle(ch.series), chapterTitle: ch.titleAr, chapterNumber: ch.number, seriesSlug: ch.series.slug, format: ch.series.format, isAdult: ch.series.isAdult, isPremium: ch.isPremiumDemo
                    }] })).count;
        }
        return { created, ambiguous: found.ambiguous.length };
    }, { timeout: 30000 });
}
