import "server-only";
import { db } from "@/lib/db";
import { cardInclude, getFavoriteGenres, liveChapterWhere, toCard, type SeriesCard } from "@/lib/queries";
import { getReadingStats } from "@/lib/reading-stats";
import { profileAvatarPath } from "@/lib/profile-avatar-policy";
import { GENRES } from "@/lib/constants";
import { MAX_FEATURED_BADGES, MAX_FEATURED_SERIES, parseIdList } from "@/lib/public-profile-policy";
import type { BadgeState } from "@/lib/badges";

const PLACEHOLDER_BIO = "حساب تجريبي ضمن النسخة التجريبية من مكتبة باني.";

export type PublicProfileView = {
  id: string;
  handle: string | null;
  nickname: string;
  role: string;
  bio: string;
  avatarSeed: string;
  avatarPath: string | null;
  coverTheme: string;
  joinedAt: Date;
  genres: string[];
  featured: SeriesCard[];
  badges: BadgeState[];
  showcase: BadgeState[];
  stats: { chapters: number; library: number; comments: number; ratings: number; longestStreak: number };
  recentComments: { id: string; body: string; createdAt: Date; series: { slug: string; titleAr: string; titleOriginal: string | null } }[];
};

/** Featured works must be live and in the reader's own library, in the order they chose. */
export async function featuredSeriesFor(profileId: string, ids: string[]): Promise<SeriesCard[]> {
  if (!ids.length) return [];
  const rows = await db.series.findMany({
    where: { id: { in: ids }, deletedAt: null, libraryItems: { some: { profileId } } },
    include: cardInclude,
  });
  const byId = new Map(rows.map(row => [row.id, toCard(row)]));
  return ids.map(id => byId.get(id)).filter((card): card is SeriesCard => Boolean(card));
}

/** Look up by handle (lowercase) or by profile id. Private or disabled profiles read as missing. */
export async function getPublicProfile(key: string): Promise<PublicProfileView | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) return null;
  const profile = await db.profile.findFirst({
    where: { OR: [{ handle: key.toLowerCase() }, { id: key }], profilePublic: true, disabledAt: null },
  });
  if (!profile) return null;

  const [reading, library, comments, ratings, chapters, featured, recentComments] = await Promise.all([
    getReadingStats(profile.id),
    db.libraryItem.count({ where: { profileId: profile.id, series: { deletedAt: null } } }),
    db.comment.count({ where: { profileId: profile.id, status: "visible", series: { deletedAt: null } } }),
    db.rating.count({ where: { profileId: profile.id, series: { deletedAt: null } } }),
    db.readingProgress.count({ where: { profileId: profile.id, completed: true, chapter: liveChapterWhere() } }),
    featuredSeriesFor(profile.id, parseIdList(profile.featuredSeriesJson, MAX_FEATURED_SERIES)),
    // Only comments that are already public on work pages, never on adult or removed works.
    db.comment.findMany({
      where: { profileId: profile.id, status: "visible", series: { deletedAt: null, isAdult: false }, OR: [{ chapterId: null }, { chapter: liveChapterWhere() }] },
      orderBy: { createdAt: "desc" }, take: 5,
      select: { id: true, body: true, createdAt: true, series: { select: { slug: true, titleAr: true, titleOriginal: true } } },
    }),
  ]);

  let genres: string[] = [];
  try {
    const raw = JSON.parse(profile.preferredGenresJson || "[]");
    genres = Array.isArray(raw) ? raw.filter((g): g is string => (GENRES as readonly string[]).includes(g)) : [];
  } catch { genres = []; }
  // No picked genres yet: fall back to what their library says they read most.
  if (!genres.length) genres = (await getFavoriteGenres(profile.id)).map(g => g.genre);

  const earned = reading.badges.filter(b => b.earned);
  const chosen = parseIdList(profile.featuredBadgesJson, MAX_FEATURED_BADGES);
  const showcase = (chosen.length ? chosen.map(id => earned.find(b => b.id === id)) : [...earned].sort((a, b) => tierWeight(b) - tierWeight(a)))
    .filter((b): b is BadgeState => Boolean(b)).slice(0, MAX_FEATURED_BADGES);

  return {
    id: profile.id, handle: profile.handle, nickname: profile.nickname, role: profile.role,
    bio: profile.bio === PLACEHOLDER_BIO ? "" : (profile.bio ?? ""),
    avatarSeed: profile.avatarSeed, avatarPath: profileAvatarPath(profile.id, profile.avatarKey),
    coverTheme: profile.coverTheme, joinedAt: profile.createdAt, genres, featured,
    badges: reading.badges, showcase,
    stats: { chapters, library, comments, ratings, longestStreak: reading.longestStreak },
    recentComments,
  };
}

function tierWeight(badge: BadgeState): number {
  return ({ bronze: 1, silver: 2, gold: 3, legendary: 4 } as const)[badge.tier ?? "bronze"] * (badge.earned ? 1 : 0);
}
