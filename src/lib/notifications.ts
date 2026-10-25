import "server-only";
import { db } from "@/lib/db";
import type { NotificationType } from "@prisma/client";

/**
 * Bunyora Library — in-app notifications (Release E).
 *
 * One table, zero fan-out infrastructure: publishing a chapter notifies the
 * profiles that shelved the series (any shelf — plan readers opted in too),
 * and a comment like notifies the comment author (never self). Everything is
 * batched with createMany and capped per trigger so a popular series cannot
 * explode the table.
 */

export const NOTIFICATIONS_PER_TRIGGER = 500;
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
    take: limit,
  });
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    titleAr: n.titleAr,
    bodyAr: n.bodyAr,
    href: n.href,
    readAt: n.readAt,
    createdAt: n.createdAt,
  }));
}

/**
 * Notify a fixed set of profile ids (already resolved by the caller).
 * Skips empty sets silently — callers never need a guard.
 */
export async function notifyProfiles(
  profileIds: string[],
  data: { type: NotificationType; titleAr: string; bodyAr?: string | null; href?: string | null }
): Promise<number> {
  const ids = [...new Set(profileIds)];
  if (ids.length === 0) return 0;
  const res = await db.notification.createMany({
    data: ids.map((profileId) => ({
      profileId,
      type: data.type,
      titleAr: data.titleAr,
      bodyAr: data.bodyAr ?? null,
      href: data.href ?? null,
    })),
  });
  return res.count;
}

/**
 * Fan-out on chapter publish: every profile that shelved the series
 * (reading / plan / finished) learns a new chapter is live.
 */
export async function notifyNewChapter(input: {
  seriesId: string;
  seriesSlug: string;
  seriesTitle: string;
  seriesFormat: string;
  chapterNumber: number;
  chapterTitle: string;
}): Promise<number> {
  const shelves = await db.libraryItem.findMany({
    where: { seriesId: input.seriesId },
    select: { profileId: true },
    take: NOTIFICATIONS_PER_TRIGGER,
  });
  return notifyProfiles(shelves.map((s) => s.profileId), {
    type: "new_chapter",
    titleAr: `فصل جديد في «${input.seriesTitle}»`,
    bodyAr: `الفصل ${input.chapterNumber} — ${input.chapterTitle} متاح الآن.`,
    href: `/read/${input.seriesFormat}/${input.seriesSlug}/${input.chapterNumber}`,
  });
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
    href: `/series/${input.seriesSlug}`,
  });
}
