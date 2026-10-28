import "server-only";
import { db } from "@/lib/db";
import type { NotificationType } from "@prisma/client";
/** Publication alerts resolve durable scalar targets; comment/system alerts keep their own links. */
export const BELL_ITEMS = 8;
export const PAGE_ITEMS = 50;
export type NotificationView = {
    id: string;
    type: NotificationType;
    titleAr: string;
    bodyAr: string | null;
    href: string | null;
    readAt: Date | null;
    createdAt: Date;
};
export async function getUnreadCount(profileId: string): Promise<number> {
    return db.notification.count({ where: { profileId, readAt: null } });
}
export async function getNotifications(profileId: string, limit = PAGE_ITEMS): Promise<NotificationView[]> {
    const rows = await db.notification.findMany({
        where: { profileId },
        orderBy: { createdAt: "desc" },
        take: limit
    });
    const publications = await db.chapterPublication.findMany({ where: { id: { in: rows.flatMap(n => n.publicationId ? [n.publicationId] : []) } }, select: {
            id: true, chapterId: true, isAdult: true, isPremium: true, seriesTitle: true, chapterNumber: true, seriesDebut: true
        } });
    const targets = await db.chapter.findMany({ where: {
            id: { in: publications.map(p => p.chapterId) }, deletedAt: null, workflow: 'published', series: { deletedAt: null }, OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }]
        }, include: { series: true } });
    const resolved = new Map(publications.map(p => [p.id, { publication: p, target: targets.find(t => t.id === p.chapterId) }]));
    return rows.map((n) => {
        const publication = n.publicationId ? resolved.get(n.publicationId) : null;
        const unavailable = !!n.publicationId && !publication?.target;
        const adult = publication && (publication.publication.isAdult || publication.target?.series.isAdult);
        const premium = publication && (publication.publication.isPremium || publication.target?.isPremiumDemo);
        return ({
            id: n.id,
            type: n.type,
            titleAr: unavailable ? 'غير متاح' : adult ? `${publication!.publication.seriesDebut ? 'عمل جديد' : 'تحديث'} في «${publication!.publication.seriesTitle} +18»` : n.titleAr,
            bodyAr: unavailable ? null : publication?.target ? `الفصل ${publication.publication.chapterNumber}${adult ? '' : ` — ${publication.target.titleAr}`} ${premium ? 'مقفل' : 'متاح الآن'}.` : n.bodyAr,
            href: unavailable ? null : publication?.target ? `/read/${publication.target.series.format}/${publication.target.series.slug}/${publication.target.number}` : n.href,
            readAt: n.readAt,
            createdAt: n.createdAt
        });
    });
}
/**
 * Notify a fixed set of profile ids (already resolved by the caller).
 * Skips empty sets silently — callers never need a guard.
 */
export async function notifyProfiles(profileIds: string[], data: {
    type: NotificationType;
    titleAr: string;
    bodyAr?: string | null;
    href?: string | null;
}): Promise<number> {
    const ids = [...new Set(profileIds)];
    if (ids.length === 0)
        return 0;
    const res = await db.notification.createMany({
        data: ids.map((profileId) => ({
            profileId,
            type: data.type,
            titleAr: data.titleAr,
            bodyAr: data.bodyAr ?? null,
            href: data.href ?? null
        })),
    });
    return res.count;
}
/** Single like notification for the comment author (callers skip self-likes). */
export async function notifyCommentLike(input: {
    authorProfileId: string;
    likerNickname: string;
    seriesSlug: string;
    seriesTitle: string;
}): Promise<number> {
    return notifyProfiles([input.authorProfileId], {
        type: "comment_like",
        titleAr: `أُعجب ${input.likerNickname} بتعليقك`,
        bodyAr: `على «${input.seriesTitle}» — استمر بالمشاركة!`,
        href: `/series/${input.seriesSlug}`
    });
}
