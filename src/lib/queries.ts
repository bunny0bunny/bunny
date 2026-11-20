import { getChapterTitle } from '@/lib/chapter-title';
import { normalizeGenre, normalizeGenres } from "@/lib/genres";
import "server-only";
import type { Prisma } from "@prisma/client";
import { getWorkTitle } from '@/lib/work-title';
import { EDITORIAL_LABELS, latestRevisionSelect, withWorkingState, isPublicChapter } from "@/lib/editorial-state";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { profileAvatarPath } from "@/lib/profile-avatar-policy";
import { CATEGORIES, FORMATS } from "@/lib/constants";
import { scoreDocument, suggestTitle, tokenizeArabic } from "@/lib/arabic-search";
import type { Category, CommentStatus, Format, Role, SeriesStatus, Workflow } from "@/lib/constants";
import { isStaffRole } from "@/lib/team-access";
import { displayCover } from "@/lib/demo-cover-art";
import { resolveReaderPageImages } from "@/lib/media/reader";

/* ------------------------------------------------------------------ */
/* Session / role helpers (application-level authorization — there is   */
/* NO database-level RLS on Neon; see README "What is enforced where") */
/* ------------------------------------------------------------------ */

export async function getSession() {
  return getServerSession(authOptions);
}

/**
 * `next` is an internal path to return to after signing in. The login form
 * validates it again before navigating, so only same-site paths are honoured.
 */
export async function requireProfile(next?: string) {
  const loginHref = next && next.startsWith("/") && !next.startsWith("//") ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const session = await getSession();
  if (!session?.user?.id) redirect(loginHref);
  const profile = await db.profile.findUnique({ where: { id: session.user.id } });
  if (!profile || profile.disabledAt || !profile.emailVerifiedAt) redirect(loginHref);
  if (profile.authVersion !== session.user.authVersion) {
    redirect(loginHref);
  }
  return profile;
}

export async function requireRole(roles: Role[]) {
  const profile = await requireProfile();
  if (!roles.includes(profile.role as Role)) redirect("/admin?denied=1");
  return profile;
}

export async function currentProfileOrNull() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  const profile = await db.profile.findUnique({ where: { id: session.user.id } });
  if (!profile || profile.disabledAt || !profile.emailVerifiedAt) return null;
  if (profile.authVersion !== session.user.authVersion) {
    return null;
  }
  return profile;
}

/* ------------------------------------------------------------------ */
/* Parsing helpers                                                     */
/* ------------------------------------------------------------------ */

export function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Public catalog queries — published content only (application-layer rule) */
/* ------------------------------------------------------------------ */

export type SeriesCard = {
  id: string;
  slug: string;
  titleAr: string;
  titleOriginal?: string | null;
  isAdult: boolean;
  format: Format;
  category?: Category | null;
  status: SeriesStatus;
  genres: string[];
  author: string;
  coverPath: string;
  accent: string;
  ratingAvg: number;
  ratingCount: number;
  reads: number;
  latestChapterAt: Date | null;
  chapterCount: number;
};

export type ExploreFilters = {
  q?: string;
  category?: string;
  format?: string;
  genre?: string;
  status?: string;
  sort?: string; // popular | newest | rating
  hideAdult?: boolean;
};

export function toCard(s: {
  id: string;
  slug: string;
  titleAr: string;
  titleOriginal?: string | null;
  isAdult?: boolean;
  format: string;
  category?: string | null;
  status: string;
  genresJson: string;
  author: string;
  coverPath: string;
  accent: string;
  ratingAvg: number;
  ratingCount: number;
  reads: number;
  chapters: { publishedAt: Date | null }[];
}): SeriesCard {
  const published = s.chapters.filter((c) => c.publishedAt !== null);
  const latest = published.reduce<Date | null>(
    (acc, c) => (acc === null || (c.publishedAt && acc && c.publishedAt > acc) ? c.publishedAt : acc),
    null
  );
  return {
    id: s.id,
    slug: s.slug,
    titleAr: s.titleAr,
    titleOriginal: s.titleOriginal ?? null,
    isAdult: s.isAdult ?? false,
    format: s.format as Format,
    category: (s.category ?? null) as Category | null,
    status: s.status as SeriesStatus,
    genres: normalizeGenres(parseJsonArray(s.genresJson)),
    author: s.author,
    coverPath: displayCover(s.coverPath),
    accent: s.accent,
    ratingAvg: s.ratingAvg,
    ratingCount: s.ratingCount,
    reads: s.reads,
    latestChapterAt: latest,
    chapterCount: published.length,
  };
}

export const cardInclude = {
  chapters: {
    where: liveChapterWhere(),
    select: { id: true, publishedAt: true, scheduledFor: true },
    orderBy: { number: "desc" as const },
  },
};

/**
 * Public visibility rule for chapters (application-layer): workflow must be
 * `published` AND not future-scheduled. Scheduled chapters surface separately
 * with an "ينشر قريبًا" badge (Release B scheduler, FD-5).
 */
export function liveChapterWhere() {
  return {
    deletedAt: null,
    series: { deletedAt: null },
    workflow: "published" as Workflow,
    OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
  };
}

export async function getPublishedSeries(filters: ExploreFilters): Promise<SeriesCard[]> {
  const where: Record<string, unknown> = { chapters: { some: liveChapterWhere() } };
  if (filters.category && (CATEGORIES as readonly string[]).includes(filters.category)) where.category = filters.category;
  if (filters.format && (FORMATS as readonly string[]).includes(filters.format)) where.format = filters.format;
  if (filters.status && ["ongoing", "completed", "hiatus"].includes(filters.status))
    where.status = filters.status;
  if (filters.hideAdult) where.isAdult = false;

  const rows = await db.series.findMany({
    where,
    include: cardInclude,
  });

  let cards = rows.map(toCard);

  // Release E — Arabic smart search: normalized + fuzzy in-memory scoring.
  // (DB `contains` cannot match hamza-less/teh-marbuta/typo queries; the whole
  // catalog is tiny, so relevance is computed here instead.)
  if (filters.q && filters.q.trim()) {
    const qTokens = tokenizeArabic(filters.q);
    const scored = rows.map((row, i) => ({
      card: cards[i],
      score: scoreDocument(qTokens, [
        { text: row.titleAr, weight: 2 },
        ...(row.titleOriginal ? [{ text: row.titleOriginal, weight: 3 }] : []),
        { text: row.author, weight: 2 },
        { text: normalizeGenres(parseJsonArray(row.genresJson)).join(" "), weight: 2 },
        { text: parseJsonArray(row.tagsJson).join(" "), weight: 1 },
        { text: row.synopsisAr, weight: 1 },
      ]),
    }));
    cards = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.card);
    if (filters.genre) cards = cards.filter((c) => c.genres.includes(normalizeGenre(filters.genre!)));
    // Relevance beats sort filters when the reader typed a query.
    return cards;
  }

  if (filters.genre) cards = cards.filter((c) => c.genres.includes(normalizeGenre(filters.genre!)));

  switch (filters.sort) {
    case "newest":
      cards.sort((a, b) => (b.latestChapterAt?.getTime() ?? 0) - (a.latestChapterAt?.getTime() ?? 0));
      break;
    case "rating":
      cards.sort((a, b) => b.ratingAvg - a.ratingAvg);
      break;
    default:
      cards.sort((a, b) => b.reads - a.reads);
  }
  return cards;
}

/**
 * "هل تقصد…؟" for the explore empty state: the closest series title to the
 * query under the same normalization, or null when nothing is near enough.
 */
export async function getSearchSuggestion(q: string): Promise<string | null> {
  if (!q.trim()) return null;
  const rows = await db.series.findMany({ where: { chapters: { some: liveChapterWhere() } }, select: { titleAr: true, titleOriginal: true } });
  const suggestion = suggestTitle(q, rows.flatMap(r => [r.titleAr, r.titleOriginal ?? '']).filter(Boolean));
  const work = rows.find(r => r.titleAr === suggestion || r.titleOriginal === suggestion);
  return work ? getWorkTitle(work) : null;
}

export async function getTrendingSeries(limit = 8): Promise<SeriesCard[]> {
  const rows = await db.series.findMany({ where: { chapters: { some: liveChapterWhere() } }, include: cardInclude, orderBy: { reads: "desc" }, take: limit });
  return rows.map(toCard);
}

/** A direct start action must resolve a live, unlocked chapter; never assume chapter 1. */
export async function getFirstReadableChapter(seriesId: string) {
  return db.chapter.findFirst({
    where: { seriesId, ...liveChapterWhere(), isPremiumDemo: false },
    orderBy: { number: 'asc' },
    select: { number: true },
  });
}

/** Prefer an editorial selection; fall back to the most read work readers can actually start. */
export async function getGuestFeaturedSeries() {
  const readable = { chapters: { some: { ...liveChapterWhere(), isPremiumDemo: false } } };
  const row = await db.series.findFirst({
    where: { ...readable, isFeatured: true }, include: cardInclude,
    orderBy: [{ displayOrder: "asc" }, { reads: "desc" }, { id: "asc" }],
  }) ?? await db.series.findFirst({
    where: readable, include: cardInclude, orderBy: [{ reads: "desc" }, { id: "asc" }],
  });
  if (!row) return null;
  const firstChapter = await getFirstReadableChapter(row.id);
  return firstChapter ? { series: toCard(row), firstChapter } : null;
}

export async function getNewestSeries(limit = 8): Promise<SeriesCard[]> {
  const rows = await db.series.findMany({ where: { chapters: { some: liveChapterWhere() } }, include: cardInclude, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toCard);
}

export async function getGenreCounts(): Promise<{ genre: string; count: number }[]> {
  const rows = await db.series.findMany({ where: { chapters: { some: liveChapterWhere() } }, select: { genresJson: true } });
  const counts = new Map<string, number>();
  for (const r of rows)
    for (const g of normalizeGenres(parseJsonArray(r.genresJson))) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ */
/* Series detail                                                       */
/* ------------------------------------------------------------------ */

export type ChapterListItem = {
  id: string;
  number: number;
  titleAr: string;
  isPremiumDemo: boolean;
  publishedAt: Date | null;
  scheduledFor: Date | null;
  pageCount: number;
  novelWords: number;
};

export async function getSeriesBySlug(slug: string) {
  const s = await db.series.findUnique({
    where: { slug, deletedAt: null },
    include: {
      chapters: {
        where: { deletedAt: null, workflow: "published" as Workflow },
        orderBy: { number: "asc" as const },
        include: { _count: { select: { pages: true } } },
      },
    },
  });
  if (!s || s.chapters.length === 0) return null;
  const now = new Date();
  const mapChapter = (c: (typeof s.chapters)[number]): ChapterListItem => ({
    id: c.id,
    number: c.number,
    titleAr: c.titleAr,
    isPremiumDemo: c.isPremiumDemo,
    publishedAt: c.publishedAt,
    scheduledFor: c.scheduledFor,
    pageCount: c._count.pages,
    novelWords: c.novelBody ? c.novelBody.split(/\s+/).filter(Boolean).length : 0,
  });
  const live = s.chapters.filter((c) => !c.scheduledFor || c.scheduledFor <= now);
  const scheduled = s.chapters.filter((c) => c.scheduledFor && c.scheduledFor > now);
  return {
    ...s,
    coverPath: displayCover(s.coverPath),
    publishedChapters: live.map(mapChapter),
    scheduledChapters: scheduled.map(mapChapter),
  };
}

export async function getRelatedSeries(seriesId: string, genres: string[], limit = 6) {
  const rows = await db.series.findMany({
    where: { id: { not: seriesId }, chapters: { some: liveChapterWhere() } },
    include: cardInclude,
    take: 24,
  });
  const cards = rows.map(toCard);
  return cards
    .map((c) => ({ c, score: c.genres.filter((g) => normalizeGenres(genres).includes(g)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.c.reads - a.c.reads)
    .slice(0, limit)
    .map((x) => x.c);
}

/* ------------------------------------------------------------------ */
/* Reader                                                              */
/* ------------------------------------------------------------------ */

export async function getChapterForReading(seriesSlug: string, chapterNumber: number) {
  const series = await db.series.findUnique({ where: { slug: seriesSlug, deletedAt: null } });
  if (!series) return null;
  const now = new Date();
  const chapter = await db.chapter.findFirst({
    where: {
      seriesId: series.id,
      number: chapterNumber,
      deletedAt: null,
      series: { deletedAt: null },
      workflow: "published",
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
    },
    include: { pages: { orderBy: { pageIndex: "asc" } } },
  });
  if (!chapter) return null;
  const readerPages: (typeof chapter.pages[number] & { fallbackImagePath?: string })[] = chapter.pages;
  const [siblings, pages] = await Promise.all([db.chapter.findMany({
    where: { seriesId: series.id, ...liveChapterWhere() },
    orderBy: { number: "asc" },
    select: { number: true, titleAr: true, isPremiumDemo: true },
  }), chapter.isPremiumDemo ? readerPages : resolveReaderPageImages(chapter.id, readerPages, {
    findAssets: (ids) => db.mediaAsset.findMany({
      where: { id: { in: ids }, chapterId: chapter.id, readyAt: { not: null }, pageIndex: { gte: 0 }, mime: { in: ["image/webp", "image/jpeg"] } },
      select: { id: true, chapterId: true, objectKey: true, readyAt: true, pageIndex: true, mime: true },
    }),
    getStorage: async () => {
      const { getMediaStorage } = await import("@/lib/media/storage");
      return getMediaStorage();
    },
  })]);
  const idx = siblings.findIndex((c) => c.number === chapter.number);
  return {
    series,
    chapter: { ...chapter, pages },
    prev: idx > 0 ? siblings[idx - 1] : null,
    next: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null,
    chapterList: siblings,
  };
}

export async function getReaderProgress(profileId: string | null, chapterId: string) {
  if (!profileId) return null;
  const row = await db.readingProgress.findUnique({
    where: { profileId_chapterId: { profileId, chapterId }, chapter: { ...liveChapterWhere(), isPremiumDemo: false } },
    select: { pageIndex: true, pageOffset: true, percent: true, completed: true, updatedAt: true },
  });
  return row ? { ...row, updatedAt: row.updatedAt.getTime() } : null;
}

export async function getProgressMap(profileId: string | null, seriesId: string) {
  if (!profileId) return new Map<string, { pageIndex: number; percent: number; completed: boolean }>();
  const rows = await db.readingProgress.findMany({
    where: { profileId, seriesId, chapter: liveChapterWhere() },
    select: { chapterId: true, pageIndex: true, percent: true, completed: true },
  });
  return new Map(rows.map((r) => [r.chapterId, { pageIndex: r.pageIndex, percent: r.percent, completed: r.completed }]));
}

export type ContinueReadingItem = {
  isAdult?: boolean;
  seriesSlug: string;
  seriesTitle: string;
  coverPath: string;
  accent: string;
  format: Format;
  chapterNumber: number;
  chapterTitle: string;
  percent: number;
  updatedAt: Date;
  /** The previous chapter is finished; this is the next one to start. */
  nextChapter?: boolean;
};

export async function getContinueReading(profileId: string, limit = 3, options: { includeNext?: boolean } = {}): Promise<ContinueReadingItem[]> {
  const includeNext = options.includeNext ?? true;
  const seriesSelect = { slug: true, titleAr: true, titleOriginal: true, coverPath: true, accent: true, format: true, isAdult: true } as const;
  // Latest position per work first, then de-duplicate: several open chapters of one work must not crowd out other works.
  const rows = await db.readingProgress.findMany({
    where: { profileId, series: { deletedAt: null }, chapter: { ...liveChapterWhere(), isPremiumDemo: false }, ...(includeNext ? {} : { completed: false, percent: { gt: 0, lt: 99 } }) },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: Math.min(500, Math.max(limit * 6, 30)),
    include: { series: { select: seriesSelect }, chapter: { select: { number: true, titleAr: true } } },
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.seriesId)) latest.set(row.seriesId, row);
  const finished = (row: (typeof rows)[number]) => row.completed || row.percent >= 99;
  const unfinished = [...latest.values()].filter((row) => !finished(row) && row.percent > 0);
  // When the latest chapter of a work is finished, "continue" means its next readable chapter.
  const done = includeNext ? [...latest.values()].filter(finished) : [];
  const nextChapters = done.length
    ? await db.chapter.findMany({
        where: { ...liveChapterWhere(), isPremiumDemo: false, OR: done.map((row) => ({ seriesId: row.seriesId, number: { gt: row.chapter.number } })) },
        orderBy: [{ number: "asc" }],
        select: { seriesId: true, number: true, titleAr: true },
      })
    : [];
  const nextBySeries = new Map<string, (typeof nextChapters)[number]>();
  for (const chapter of nextChapters) if (!nextBySeries.has(chapter.seriesId)) nextBySeries.set(chapter.seriesId, chapter);
  const items: ContinueReadingItem[] = [];
  for (const row of latest.values()) {
    const base = { seriesSlug: row.series.slug, seriesTitle: getWorkTitle(row.series), isAdult: row.series.isAdult, coverPath: displayCover(row.series.coverPath), accent: row.series.accent, format: row.series.format as Format, updatedAt: row.updatedAt };
    if (unfinished.includes(row)) items.push({ ...base, chapterNumber: row.chapter.number, chapterTitle: getChapterTitle(row.chapter), percent: row.percent });
    else {
      const next = nextBySeries.get(row.seriesId);
      if (next) items.push({ ...base, chapterNumber: next.number, chapterTitle: getChapterTitle(next), percent: 0, nextChapter: true });
    }
    if (items.length >= limit) break;
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* Home rows                                                           */
/* ------------------------------------------------------------------ */

export async function getLatestUpdates(limit = 10) {
  const chapters = await db.chapter.findMany({
    where: liveChapterWhere(),
    orderBy: [{ publishedAt: "desc" }],
    take: limit,
    include: { series: { select: { slug: true, titleAr: true, titleOriginal: true, coverPath: true, accent: true, format: true, category: true } } },
  });
  return chapters.map((c) => ({
    id: c.id,
    number: c.number,
    titleAr: c.titleAr,
    publishedAt: c.publishedAt as Date,
    isPremiumDemo: c.isPremiumDemo,
    series: { ...c.series, coverPath: displayCover(c.series.coverPath) },
  }));
}

export async function getFeaturedCollections() {
  return db.editorialCollection.findMany({ where: { isFeatured: true }, orderBy: { displayOrder: "asc" } });
}

/* ------------------------------------------------------------------ */
/* Admin queries (role already enforced by caller)                     */
/* ------------------------------------------------------------------ */

// Analytics stores a scalar chapterId without a Chapter relation. Filter those
// IDs explicitly while retaining account events that have no content target.
async function liveAnalyticsWhere(): Promise<Prisma.AnalyticsEventWhereInput> {
  const hidden = await db.chapter.findMany({
    where: { OR: [{ deletedAt: { not: null } }, { series: { deletedAt: { not: null } } }] },
    select: { id: true },
  });
  return { AND: [
    { OR: [{ seriesId: null }, { series: { deletedAt: null } }] },
    { OR: [{ chapterId: null }, { chapterId: { notIn: hidden.map(chapter => chapter.id) } }] },
  ] };
}

export async function getAdminOverview() {
  const profile = await currentProfileOrNull();
  if (!profile || profile.role !== "admin") return null;

  const analyticsWhere = await liveAnalyticsWhere();
  const [seriesCount, chapters, profileCount, eventCount] = await Promise.all([
    db.series.count({ where: { deletedAt: null } }),
    db.chapter.findMany({ where: { deletedAt: null, series: { deletedAt: null } }, select: { workflow: true, scheduledFor: true, revisions: { ...latestRevisionSelect, select: { status: true } } } }),
    db.profile.count(), db.analyticsEvent.count({ where: analyticsWhere }),
  ]);
  const chapterCount = chapters.length;
  const publishedCount = chapters.filter((c) => isPublicChapter(c)).length;
  const statusCount = (status: string) => chapters.filter((c) => (c.revisions[0]?.status ?? c.workflow) === status).length;
  const draftCount = statusCount("draft");
  const reviewCount = statusCount("review");
  const changesRequestedCount = statusCount("changes_requested");
  const approvedCount = statusCount("approved");
  const scheduledCount = statusCount("scheduled");
  const recentEvents = await db.analyticsEvent.findMany({
    where: analyticsWhere,
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      profile: { select: { nickname: true } },
      series: { select: { titleAr: true, titleOriginal: true, slug: true } },
    },
  });
  const topSeries = await db.series.findMany({ where: { deletedAt: null }, orderBy: { reads: "desc" }, take: 5 });
  return {
    seriesCount,
    chapterCount,
    publishedCount,
    draftCount,
    reviewCount,
    changesRequestedCount,
    approvedCount,
    scheduledCount,
    profileCount,
    eventCount,
    recentEvents,
    topSeries,
  };
}

export type AdminSeriesFilters = { q?: string; format?: string; status?: string };

export async function getAdminSeries(filters: AdminSeriesFilters) {
  const profile = await currentProfileOrNull();
  if (!profile || !isStaffRole(profile.role)) return [];

  const where: Record<string, unknown> = { deletedAt: null };
  if (profile.role !== "admin") {
    where.assignments = { some: { profileId: profile.id } };
  }
  if (filters.format && (FORMATS as readonly string[]).includes(filters.format)) where.format = filters.format;
  if (filters.status && ["ongoing", "completed", "hiatus"].includes(filters.status))
    where.status = filters.status;
  if (filters.q?.trim()) where.OR = [{titleAr: {contains: filters.q.trim(), mode: 'insensitive'}}, {titleOriginal: {contains: filters.q.trim(), mode: 'insensitive'}}];
  return db.series.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { chapters: { where: { deletedAt: null } } } } },
  });
}

export async function getAdminSeriesById(id: string) {
  const profile = await currentProfileOrNull();
  if (!profile || !isStaffRole(profile.role)) return null;

  if (profile.role === "admin") {
    const series = await db.series.findUnique({
      where: { id, deletedAt: null },
      include: {
        chapters: {
          orderBy: { number: "asc" },
          include: { _count: { select: { pages: true } }, revisions: latestRevisionSelect },
        },
        assignments: {
          include: {
            profile: { select: { id: true, email: true, nickname: true, role: true } },
          },
        },
      },
    });
    return series ? { ...series, chapters: series.chapters.map(withWorkingState) } : null;
  }

  // Non-admin staff: combined id + assignment membership, no team assignment or email list
  const series = await db.series.findFirst({
    where: {
      id,
      deletedAt: null,
      assignments: {
        some: {
          profileId: profile.id,
          profile: { role: { in: ["contributor", "editor"] } },
        },
      },
    },
    include: {
      chapters: {
        orderBy: { number: "asc" },
        include: { _count: { select: { pages: true } }, revisions: latestRevisionSelect },
      },
    },
  });
  return series ? { ...series, chapters: series.chapters.map(withWorkingState) } : null;
}

export async function getAdminChapters(filters: { workflow?: string; format?: string; seriesId?: string }) {
  const profile = await currentProfileOrNull();
  if (!profile || !isStaffRole(profile.role)) return [];

  const chapterWhere: Record<string, unknown> = { deletedAt: null };
  if (filters.seriesId) {
    chapterWhere.seriesId = filters.seriesId;
  }

  const seriesWhere: Record<string, unknown> = { deletedAt: null };
  if (filters.format && (FORMATS as readonly string[]).includes(filters.format)) seriesWhere.format = filters.format;
  if (profile.role !== "admin") {
    seriesWhere.assignments = { some: { profileId: profile.id } };
  }
  chapterWhere.series = seriesWhere;

  const chapters = await db.chapter.findMany({
    where: chapterWhere,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: {
      series: { select: { id: true, slug: true, titleAr: true, titleOriginal: true, format: true, accent: true } },
      _count: { select: { pages: true } },
      revisions: latestRevisionSelect,
    },
  });
  const rows = chapters.map(withWorkingState);
  if (filters.workflow === "published") return rows.filter((c) => isPublicChapter(c));
  return filters.workflow && filters.workflow in EDITORIAL_LABELS
    ? rows.filter((c) => c.workingStatus === filters.workflow) : rows;
}

export async function getStaffOverview() {
  const profile = await currentProfileOrNull();
  if (!profile || !isStaffRole(profile.role)) return null;
  const series = await db.series.findMany({
    where: { deletedAt: null, ...(profile.role === "admin" ? {} : { assignments: { some: { profileId: profile.id } } }) },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { chapters: { where: { deletedAt: null } } } } },
  });
  return { profile, series };
}

export async function getSeriesAssignments(seriesId: string) {
  const profile = await currentProfileOrNull();
  if (!profile || profile.role !== "admin") return [];
  return db.seriesAssignment.findMany({
    where: { seriesId, series: { deletedAt: null } },
    include: {
      profile: { select: { id: true, email: true, nickname: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAssignableStaff() {
  const profile = await currentProfileOrNull();
  if (!profile || profile.role !== "admin") return [];
  return db.profile.findMany({
    where: { role: { in: ["contributor", "editor"] } },
    select: { id: true, email: true, nickname: true, role: true },
    orderBy: { nickname: "asc" },
  });
}

/* ------------------------------------------------------------------ */
/* Release B — personal library, updates feed, community, admin extras */
/* ------------------------------------------------------------------ */

export type LibraryEntry = {
  series: SeriesCard;
  titleOriginal: string;
  shelf: "reading" | "plan" | "finished";
  addedAt: Date;
  unreadCount: number;
};

export async function getLibrary(profileId: string, shelf?: string): Promise<LibraryEntry[]> {
  const shelfFilter =
    shelf && ["reading", "plan", "finished"].includes(shelf)
      ? { profileId, shelf: shelf as "reading" | "plan" | "finished" }
      : { profileId };
  const items = await db.libraryItem.findMany({
    where: { ...shelfFilter, series: { deletedAt: null } },
    orderBy: { updatedAt: "desc" },
    include: { series: { include: cardInclude } },
  });
  if (items.length === 0) return [];
  const seriesIds = items.map((i) => i.series.id);
  const progressRows = await db.readingProgress.findMany({
    where: { profileId, seriesId: { in: seriesIds }, OR: [{ completed: true }, { percent: { gte: 99 } }] },
    select: { seriesId: true, chapterId: true },
  });
  const readBy = new Map<string, Set<string>>();
  for (const r of progressRows) {
    if (!readBy.has(r.seriesId)) readBy.set(r.seriesId, new Set());
    readBy.get(r.seriesId)!.add(r.chapterId);
  }
  return items.map((item) => {
    const liveChapterIds = item.series.chapters.map((c) => c.id);
    const readSet = readBy.get(item.series.id) ?? new Set<string>();
    const unreadCount = liveChapterIds.filter((id) => !readSet.has(id)).length;
    return {
      series: toCard(item.series),
      titleOriginal: item.series.titleOriginal ?? "",
      shelf: item.shelf as LibraryEntry["shelf"],
      addedAt: item.createdAt,
      unreadCount,
    };
  });
}

export async function getLibrarySeriesIds(profileId: string): Promise<Set<string>> {
  const rows = await db.libraryItem.findMany({ where: { profileId, series: { deletedAt: null } }, select: { seriesId: true } });
  return new Set(rows.map((r) => r.seriesId));
}

export type UpdatesFeedItem = {
  chapterId: string;
  number: number;
  titleAr: string;
  publishedAt: Date;
  isPremiumDemo: boolean;
  read: boolean;
  series: { slug: string; titleAr: string; titleOriginal?: string | null; coverPath: string; accent: string; format: Format; category: Category | null };
};

export async function getLibraryUpdatesFeed(profileId: string, limit = 40): Promise<UpdatesFeedItem[]> {
  const items = await db.libraryItem.findMany({ where: { profileId, series: { deletedAt: null } }, select: { seriesId: true } });
  if (items.length === 0) return [];
  const seriesIds = items.map((i) => i.seriesId);
  const chapters = await db.chapter.findMany({
    where: { seriesId: { in: seriesIds }, ...liveChapterWhere() },
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: {
      series: { select: { slug: true, titleAr: true, titleOriginal: true, coverPath: true, accent: true, format: true, category: true } },
    },
  });
  if (chapters.length === 0) return [];
  const progress = await db.readingProgress.findMany({
    where: { profileId, chapterId: { in: chapters.map((c) => c.id) } },
    select: { chapterId: true, completed: true, percent: true },
  });
  const readSet = new Set(progress.filter((p) => p.completed || p.percent >= 99).map((p) => p.chapterId));
  return chapters.map((c) => ({
    chapterId: c.id,
    number: c.number,
    titleAr: c.titleAr,
    publishedAt: (c.publishedAt ?? c.createdAt) as Date,
    isPremiumDemo: c.isPremiumDemo,
    read: readSet.has(c.id),
    series: { ...c.series, coverPath: displayCover(c.series.coverPath) },
  }));
}

export type CommentView = {
  id: string;
  body: string;
  createdAt: Date;
  status: CommentStatus;
  author: { id: string; nickname: string; avatarSeed: string; role: string; avatarPath: string | null };
  chapterNumber: number | null;
  likeCount: number;
  likedByMe: boolean;
};

export const COMMENTS_PAGE_SIZE = 30;

/**
 * Public comments, newest first. "flagged" comments stay public while they
 * wait for a moderator; only "hidden" ones are withheld.
 */
export async function getVisibleComments(
  seriesId: string,
  chapterId: string | null,
  viewerProfileId?: string | null,
  limit = COMMENTS_PAGE_SIZE,
  offset = 0
): Promise<CommentView[]> {
  const rows = await db.comment.findMany({
    where: { seriesId, chapterId, series: { deletedAt: null }, OR: [{ chapterId: null }, { chapter: liveChapterWhere() }], status: { in: ["visible", "flagged"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: offset,
    take: limit,
    include: {
      profile: { select: { id: true, nickname: true, avatarSeed: true, role: true, avatarKey: true, disabledAt: true } },
      chapter: { select: { number: true } },
      _count: { select: { likes: true } },
      likes: { select: { profileId: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    status: c.status as CommentStatus,
    author: { id: c.profile.id, nickname: c.profile.nickname, avatarSeed: c.profile.avatarSeed, role: c.profile.role, avatarPath: c.profile.disabledAt ? null : profileAvatarPath(c.profile.id, c.profile.avatarKey) },
    chapterNumber: c.chapter?.number ?? null,
    likeCount: c._count.likes,
    likedByMe: viewerProfileId ? c.likes.some((l) => l.profileId === viewerProfileId) : false,
  }));
}

export async function getCommentCount(seriesId: string) {
  return db.comment.count({ where: { seriesId, series: { deletedAt: null }, OR: [{ chapterId: null }, { chapter: liveChapterWhere() }], status: { in: ["visible", "flagged"] } } });
}

export async function getUserRating(profileId: string | null, seriesId: string) {
  if (!profileId) return null;
  return db.rating.findUnique({
    where: { profileId_seriesId: { profileId, seriesId }, series: { deletedAt: null } },
    select: { value: true },
  });
}

export async function getProfileStats(profileId: string) {
  const [libraryCount, chaptersRead, commentCount, ratingCount, recentProgress] = await Promise.all([
    db.libraryItem.count({ where: { profileId, series: { deletedAt: null } } }),
    db.readingProgress.count({ where: { profileId, completed: true, chapter: liveChapterWhere() } }),
    db.comment.count({ where: { profileId, status: { in: ["visible", "flagged"] }, series: { deletedAt: null }, OR: [{ chapterId: null }, { chapter: { deletedAt: null } }] } }),
    db.rating.count({ where: { profileId, series: { deletedAt: null } } }),
    db.readingProgress.findMany({
      where: { profileId, chapter: liveChapterWhere() },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        series: { select: { slug: true, titleAr: true, titleOriginal: true, coverPath: true, accent: true, format: true, isAdult: true } },
        chapter: { select: { number: true, titleAr: true } },
      },
    }),
  ]);
  return { libraryCount, chaptersRead, commentCount, ratingCount, recentProgress };
}

export async function getProfileActivity(profileId: string, limit = 8) {
  return db.analyticsEvent.findMany({
    where: { profileId, ...await liveAnalyticsWhere() },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { series: { select: { slug: true, titleAr: true, titleOriginal: true } } },
  });
}

export async function getFavoriteGenres(profileId: string) {
  const items = await db.libraryItem.findMany({
    where: { profileId, series: { deletedAt: null } },
    include: { series: { select: { genresJson: true } } },
  });
  const counts = new Map<string, number>();
  for (const i of items)
    for (const g of normalizeGenres(parseJsonArray(i.series.genresJson))) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts.entries()].map(([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count).slice(0, 5);
}

/* --- admin: moderation, users, collections, dashboard analytics --- */

export async function getModerationQueue() {
  const profile = await currentProfileOrNull();
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { items: [], hiddenCount: 0, reportCount: 0 };
  }
  const [items, hiddenCount, reportCount] = await Promise.all([
    db.comment.findMany({
      where: { series: { deletedAt: null }, OR: [{ chapterId: null }, { chapter: { deletedAt: null } }], status: { in: ["flagged", "hidden"] as ("flagged" | "hidden")[] } },
      orderBy: { updatedAt: "desc" },
      include: {
        profile: { select: { id: true, nickname: true, avatarSeed: true, avatarKey: true } },
        series: { select: { slug: true, titleAr: true, titleOriginal: true } },
        chapter: { select: { number: true } },
        reports: { include: { profile: { select: { nickname: true } } } },
      },
    }),
    db.comment.count({ where: { series: { deletedAt: null }, OR: [{ chapterId: null }, { chapter: { deletedAt: null } }], status: "hidden" } }),
    db.commentReport.count(),
  ]);
  return { items, hiddenCount, reportCount };
}

export async function getAdminUsers() {
  const profile = await currentProfileOrNull();
  if (!profile || profile.role !== "admin") return [];
  return db.profile.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, email: true, nickname: true, role: true, avatarSeed: true, avatarKey: true, createdAt: true,
      emailVerifiedAt: true, disabledAt: true,
      _count: { select: { comments: true, libraryItems: true, readingProgress: true, assignments: true } },
    },
  });
}

export async function getAdminCollections() {
  const profile = await currentProfileOrNull();
  if (!profile || profile.role !== "admin") return [];
  return db.editorialCollection.findMany({ orderBy: { displayOrder: "asc" } });
}

export type DashboardPoint = { day: string; reads: number; logins: number; publish: number };

export async function getDashboardActivity(days = 14): Promise<DashboardPoint[]> {
  const profile = await currentProfileOrNull();
  if (!profile || profile.role !== "admin") return [];
  const since = new Date(Date.now() - days * 86400000);
  const events = await db.analyticsEvent.findMany({
    where: {
      ...await liveAnalyticsWhere(),
      createdAt: { gte: since },
      type: { in: ["read_start", "login", "publish"] as ("read_start" | "login" | "publish")[] },
    },
    select: { type: true, createdAt: true },
  });
  const buckets = new Map<string, DashboardPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    buckets.set(key, { day: key, reads: 0, logins: 0, publish: 0 });
  }
  for (const e of events) {
    const b = buckets.get(e.createdAt.toISOString().slice(0, 10));
    if (!b) continue;
    if (e.type === "read_start") b.reads++;
    else if (e.type === "login") b.logins++;
    else b.publish++;
  }
  return [...buckets.values()];
}

export async function getCommunityCounts() {
  const [comments, ratings, libraryItems, avg] = await Promise.all([
    db.comment.count({ where: { series: { deletedAt: null }, OR: [{ chapterId: null }, { chapter: { deletedAt: null } }], status: { in: ["visible", "flagged"] } } }),
    db.rating.count({ where: { series: { deletedAt: null } } }),
    db.libraryItem.count({ where: { series: { deletedAt: null } } }),
    db.rating.aggregate({ where: { series: { deletedAt: null } }, _avg: { value: true } }),
  ]);
  return { comments, ratings, libraryItems, avgRating: avg._avg.value ?? 0 };
}

/* ------------------------------------------------------------------ */
/* Release E — creator studio lite (read-only insights, editor+)       */
/* ------------------------------------------------------------------ */

export type StudioSeriesRow = {
  seriesId: string;
  slug: string;
  titleAr: string;
  format: Format;
  accent: string;
  reads: number;
  ratingAvg: number;
  ratingCount: number;
  comments: number;
  libraryAdds: number;
  published: number;
  review: number;
  drafts: number;
  scheduled: number;
  latestPublishAt: Date | null;
  topChapters: { number: number; reads: number }[];
};

export async function getStudioOverview(): Promise<StudioSeriesRow[]> {
  const profile = await currentProfileOrNull();
  if (!profile || !isStaffRole(profile.role)) return [];

  const where: Record<string, unknown> = { deletedAt: null };
  if (profile.role !== "admin") {
    where.assignments = { some: { profileId: profile.id } };
  }

  const rows = await db.series.findMany({
    where,
    orderBy: { reads: "desc" },
    include: {
      _count: { select: { libraryItems: true } },
      chapters: { where: { deletedAt: null }, select: { id: true, number: true, workflow: true, publishedAt: true, scheduledFor: true } },
    },
  });
  if (rows.length === 0) return [];
  const [commentCounts, topEvents] = await Promise.all([
    db.comment.groupBy({ by: ["seriesId"], where: { series: { deletedAt: null }, OR: [{ chapterId: null }, { chapter: { deletedAt: null } }], status: { in: ["visible", "flagged"] } }, _count: { _all: true } }),
    db.analyticsEvent.groupBy({
      by: ["seriesId", "chapterId"],
      where: { type: "read_start", chapterId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const commentsBy = new Map(commentCounts.map((c) => [c.seriesId, c._count._all]));
  // chapterId → read_start count (for per-series top chapters)
  const chapterReads = new Map<string, number>();
  for (const e of topEvents) {
    if (!e.chapterId) continue;
    chapterReads.set(e.chapterId, (chapterReads.get(e.chapterId) ?? 0) + e._count._all);
  }
  return rows.map((s) => {
    const published = s.chapters.filter((c) => c.workflow === "published");
    const topChapters = s.chapters
      .map((c) => ({ number: c.number, reads: chapterReads.get(c.id) ?? 0 }))
      .filter((c) => c.reads > 0)
      .sort((a, b) => b.reads - a.reads)
      .slice(0, 3);
    const latest = published.reduce<Date | null>(
      (acc, c) => (acc === null || (c.publishedAt && acc && c.publishedAt > acc) ? c.publishedAt : acc),
      null
    );
    return {
      seriesId: s.id,
      slug: s.slug,
      titleAr: getWorkTitle(s),
      format: s.format as Format,
      accent: s.accent,
      reads: s.reads,
      ratingAvg: s.ratingAvg,
      ratingCount: s.ratingCount,
      comments: commentsBy.get(s.id) ?? 0,
      libraryAdds: s._count.libraryItems,
      published: published.length,
      review: s.chapters.filter((c) => c.workflow === "review").length,
      drafts: s.chapters.filter((c) => c.workflow === "draft").length,
      scheduled: s.chapters.filter((c) => c.scheduledFor && c.scheduledFor > new Date()).length,
      latestPublishAt: latest,
      topChapters,
    };
  });
}
