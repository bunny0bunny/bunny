import 'server-only';
import { randomUUID } from 'node:crypto';
import { Prisma, type ChapterPublication } from '@prisma/client';
import { db } from '@/lib/db';
import { getWorkTitle } from '@/lib/work-title';
import { discoverLegacyPublications } from './legacy';
import type { PublicationSummary } from './contracts';
type Tx = Prisma.TransactionClient;
export async function recordChapterPublication(tx: Tx, chapterId: string, revisionId: string): Promise<void> {
    const initial = await tx.chapter.findUniqueOrThrow({ where: { id: chapterId }, select: { seriesId: true } });
    await tx.$queryRaw `SELECT id FROM "Series" WHERE id=${initial.seriesId} FOR UPDATE`;
    if (await tx.chapterPublication.findUnique({ where: { chapterId }, select: { id: true } }))
        return;
    const ch = await tx.chapter.findUniqueOrThrow({ where: { id: chapterId }, include: { series: { include: { publicCredits: { where: { identity: { status: 'active' } }, select: { identityId: true, role: true } } } } } });
    const revision = await tx.chapterRevision.findUniqueOrThrow({ where: { id: revisionId } });
    const discovered = await discoverLegacyPublications(tx, ch.seriesId);
    const historical = discovered.historical.find(h => h.chapterId === chapterId);
    const ambiguous = discovered.ambiguous.some(h => h.chapterId === chapterId);
    const previous = await tx.chapterPublication.count({ where: { seriesId: ch.seriesId } });
    const seriesHistorical = discovered.historical.some(h => h.seriesId === ch.seriesId && h.chapterId !== chapterId);
    await tx.chapterPublication.create({ data: {
            chapterId, seriesId: ch.seriesId, state: historical || ambiguous ? 'baseline' : 'pending', firstPublishedAt: historical?.firstPublishedAt ? new Date(historical.firstPublishedAt) : historical || ambiguous ? null : new Date(), evidenceJson: historical ? [...historical.evidence, 'baseline_recorded_at_eventAt'] : ambiguous ? ['ambiguous_prior_trash', 'baseline_recorded_at_eventAt'] : [], seriesDebut: !historical && !ambiguous && !previous && !seriesHistorical, creditsSnapshot: ch.series.publicCredits, seriesTitle: getWorkTitle(ch.series), chapterTitle: revision.titleAr, chapterNumber: ch.number, seriesSlug: ch.series.slug, format: ch.series.format, isAdult: ch.series.isAdult, isPremium: revision.isPremiumDemo
        } });
}
function bounded(value: number | undefined, fallback: number, max: number) {
    return value !== undefined && Number.isFinite(value) ? Math.max(1, Math.min(Math.floor(value), max)) : fallback;
}
async function liveTarget(tx: Tx, event: ChapterPublication, now: Date) {
    return tx.chapter.findFirst({ where: {
            id: event.chapterId, seriesId: event.seriesId, deletedAt: null, workflow: 'published', OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }], series: { deletedAt: null }
        }, include: { series: true } });
}
function identityIds(snapshot: Prisma.JsonValue): string[] {
    return Array.isArray(snapshot) ? snapshot.flatMap(c => c && typeof c === 'object' && !Array.isArray(c) && typeof c.identityId === 'string' ? [c.identityId] : []) : [];
}
export async function drainPublications(options: {
    limit?: number;
    recipientLimit?: number;
    now?: Date;
} = {}): Promise<PublicationSummary> {
    const summary: PublicationSummary = {
        examined: 0, delivered: 0, completed: 0, suppressed: 0, failed: 0, skipped: 0
    };
    const now = options.now ?? new Date();
    const recipientLimit = bounded(options.recipientLimit, 200, 500);
    const candidates = await db.chapterPublication.findMany({
        where: { state: 'pending', OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, orderBy: [{ eventAt: 'asc' }, { id: 'asc' }], take: bounded(options.limit, 3, 10)
    });
    for (const candidate of candidates) {
        summary.examined++;
        const token = randomUUID();
        const leaseUntil = new Date(now.getTime() + 60000);
        const claim = await db.chapterPublication.updateMany({ where: {
                id: candidate.id, state: 'pending', OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }]
            }, data: {
                leaseToken: token, leaseUntil, attempts: { increment: 1 }, errorCode: null
            } });
        if (!claim.count) {
            summary.skipped++;
            continue;
        }
        try {
            const page = await db.$transaction(async (tx) => {
                const event = await tx.chapterPublication.findUniqueOrThrow({ where: { id: candidate.id } });
                if (event.leaseToken !== token || event.state !== 'pending' || !event.leaseUntil || event.leaseUntil <= now)
                    throw new Error('lease_lost');
                const target = await liveTarget(tx, event, now);
                if (!target) {
                    const changed = await tx.chapterPublication.updateMany({ where: {
                            id: event.id, state: 'pending', leaseToken: token, cursorProfileId: event.cursorProfileId
                        }, data: {
                            state: 'suppressed', leaseToken: null, leaseUntil: null, errorCode: 'target_unavailable'
                        } });
                    if (!changed.count)
                        throw new Error('lease_lost');
                    return {
                        delivered: 0, completed: 0, suppressed: 1
                    };
                }
                const ids = identityIds(event.creditsSnapshot);
                const cursor = event.cursorProfileId ?? '';
                // UNION deduplicates shelf + multiple identity subscriptions before keyset LIMIT.
                const recipients = await tx.$queryRaw<{
                    profileId: string;
                }[]>(Prisma.sql `
 SELECT audience."profileId" FROM (
 SELECT li."profileId" FROM "LibraryItem" li WHERE li."seriesId"=${event.seriesId} AND li."createdAt"<=(SELECT "eventAt" FROM "ChapterPublication" WHERE id=${event.id})
 UNION
 SELECT f."profileId" FROM "IdentityFollow" f JOIN "PublicIdentity" i ON i.id=f."identityId"
 WHERE f."identityId" IN (${ids.length ? Prisma.join(ids) : Prisma.sql `NULL`}) AND i.status='active' AND f."alertsEnabledAt" IS NOT NULL AND f."alertsEnabledAt"<=(SELECT "eventAt" FROM "ChapterPublication" WHERE id=${event.id})
 ) audience JOIN "Profile" p ON p.id=audience."profileId"
 WHERE p."disabledAt" IS NULL AND p."emailVerifiedAt" IS NOT NULL AND audience."profileId">${cursor}
 ORDER BY audience."profileId" ASC LIMIT ${recipientLimit}`);
                let delivered = 0;
                if (recipients.length) {
                    const adult = event.isAdult || target.series.isAdult;
                    const premium = event.isPremium || target.isPremiumDemo;
                    const title = `${event.seriesTitle}${adult ? ' +18' : ''}`;
                    delivered = (await tx.notification.createMany({ skipDuplicates: true, data: recipients.map(({ profileId }) => ({
                            profileId, publicationId: event.id, type: 'new_chapter', titleAr: `${event.seriesDebut ? 'عمل جديد' : 'تحديث'} في «${title}»`, bodyAr: `الفصل ${event.chapterNumber}${adult ? '' : ` — ${target.titleAr}`} ${premium ? 'مقفل' : 'متاح الآن'}.`, href: `/read/${target.series.format}/${target.series.slug}/${target.number}`
                        })) })).count;
                }
                const changed = await tx.chapterPublication.updateMany({ where: {
                        id: event.id, state: 'pending', leaseToken: token, leaseUntil: { gt: now }, cursorProfileId: event.cursorProfileId
                    }, data: {
                        cursorProfileId: recipients.at(-1)?.profileId ?? event.cursorProfileId, state: recipients.length ? 'pending' : 'completed', leaseToken: null, leaseUntil: null
                    } });
                if (!changed.count)
                    throw new Error('lease_lost');
                return {
                    delivered, completed: recipients.length ? 0 : 1, suppressed: 0
                };
            }, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 15000
            });
            summary.delivered += page.delivered;
            summary.completed += page.completed;
            summary.suppressed += page.suppressed;
        }
        catch (error) {
            summary.failed++;
            await db.chapterPublication.updateMany({ where: {
                    id: candidate.id, state: 'pending', leaseToken: token
                }, data: {
                    leaseToken: null, leaseUntil: null, errorCode: error instanceof Error && error.message === 'lease_lost' ? 'lease_lost' : 'delivery_failed'
                } });
        }
    }
    return summary;
}
