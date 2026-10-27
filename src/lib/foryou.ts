import { normalizeGenres } from "@/lib/genres";
import "server-only";
import { getWorkTitle } from '@/lib/work-title';
import { db } from "@/lib/db";
import { cardInclude, toCard } from "@/lib/queries";
import type { SeriesCard } from "@/lib/queries";

/**
 * Release D — "لك" (For You) recommendation rail (FD-12).
 *
 * Zero-schema personalization: genre affinity is derived entirely from the
 * reader's OWN footprint on existing tables —
 *   • ReadingProgress  → strongest signal (completed > mostly-read > touched)
 *   • LibraryItem      → shelf intent (finished/reading count; `plan` does NOT
 *                        express taste — those series are already queued)
 *   • Rating           • 5★ +4 · 4★ +2 · 3★ 0 · 2★ −2 · 1★ −3 (negative taste signal)
 *
 * Candidates = published series the reader has NOT touched, shelved, or rated.
 * Score = Σ affinity(genre) with a small popularity tiebreak (reads), so equal
 * affinity resolves by what the community is actually reading.
 *
 * Cold-start rule (D-01 "no noise that doesn't concern you"): with fewer than
 * 2 distinct history series — or no positive affinity at all — the rail
 * returns empty and the home page simply stays with the editorial rails.
 *
 * Every recommendation is explainable: each card carries an anchor reason
 * ("لأنك قرأت …" / "يشبه … من مكتبتك" / "يطابق ذوقك في …").
 */

const GENRE_WEIGHT = {
  PROGRESS_COMPLETED: 3,
  PROGRESS_MID: 2, // percent >= 50
  PROGRESS_TOUCHED: 1,
  LIBRARY_ACTIVE: 2, // finished | reading shelves
  RATING_5: 4,
  RATING_4: 2,
  RATING_2: -2,
  RATING_1: -3,
} as const;

export type ForYouItem = {
  series: SeriesCard;
  reasonAr: string;
};

type HistorySeries = { id: string; titleAr: string; genres: string[] };

function affinityFromRatings(value: number): number {
  if (value >= 5) return GENRE_WEIGHT.RATING_5;
  if (value === 4) return GENRE_WEIGHT.RATING_4;
  if (value <= 1) return GENRE_WEIGHT.RATING_1;
  if (value === 2) return GENRE_WEIGHT.RATING_2;
  return 0; // 3★ is neutral
}

export async function getForYouSeries(profileId: string, limit = 8): Promise<ForYouItem[]> {
  const [progress, library, ratings] = await Promise.all([
    db.readingProgress.findMany({
      where: { profileId, chapter: { deletedAt: null, series: { deletedAt: null } } },
      select: { seriesId: true, percent: true, completed: true, updatedAt: true },
    }),
    db.libraryItem.findMany({
      where: { profileId, series: { deletedAt: null }, shelf: { in: ["reading", "finished"] } },
      select: { seriesId: true },
    }),
    db.rating.findMany({
      where: { profileId, series: { deletedAt: null } },
      select: { seriesId: true, value: true },
    }),
  ]);

  const historyIds = new Set<string>();
  for (const p of progress) historyIds.add(p.seriesId);
  for (const l of library) historyIds.add(l.seriesId);
  for (const r of ratings) historyIds.add(r.seriesId);

  // Cold start: an anecdote is not a taste profile.
  if (historyIds.size < 2) return [];

  const historyRows = await db.series.findMany({
    where: { deletedAt: null, id: { in: [...historyIds] } },
    select: { id: true, titleAr: true, titleOriginal: true, genresJson: true },
  });
  const history: HistorySeries[] = historyRows.map((s) => ({
    id: s.id,
    titleAr: getWorkTitle(s),
    genres: normalizeGenres(JSON.parse(s.genresJson || "[]") as string[]),
  }));

  // ── genre affinity ──────────────────────────────────────────────
  const affinity = new Map<string, number>();
  const addAffinity = (genres: string[], w: number) => {
    for (const g of genres) affinity.set(g, (affinity.get(g) ?? 0) + w);
  };

  const progressBySeries = new Map<string, { percent: number; completed: boolean; updatedAt: Date }>();
  for (const p of progress) {
    const prev = progressBySeries.get(p.seriesId);
    // A series can have many chapter rows; the furthest read state represents it.
    if (!prev || p.percent > prev.percent || (p.completed && !prev.completed)) {
      progressBySeries.set(p.seriesId, { percent: p.percent, completed: p.completed, updatedAt: p.updatedAt });
    }
  }
  for (const h of history) {
    const p = progressBySeries.get(h.id);
    if (p) addAffinity(h.genres, p.completed ? GENRE_WEIGHT.PROGRESS_COMPLETED : p.percent >= 50 ? GENRE_WEIGHT.PROGRESS_MID : GENRE_WEIGHT.PROGRESS_TOUCHED);
    if (library.some((l) => l.seriesId === h.id)) addAffinity(h.genres, GENRE_WEIGHT.LIBRARY_ACTIVE);
    const r = ratings.find((x) => x.seriesId === h.id);
    if (r) addAffinity(h.genres, affinityFromRatings(r.value));
  }

  // Nothing positive to recommend from → stay quiet (no noise rule).
  if (![...affinity.values()].some((v) => v > 0)) return [];

  // ── candidates: untouched published series ──────────────────────
  const rows = await db.series.findMany({
    where: { deletedAt: null, id: { notIn: [...historyIds] } },
    include: cardInclude,
  });
  const candidates = rows.map(toCard).filter((c) => c.chapterCount > 0);

  const scored = candidates
    .map((c) => {
      const score = c.genres.reduce((sum, g) => sum + (affinity.get(g) ?? 0), 0);
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.c.reads - a.c.reads ||
        b.c.ratingAvg - a.c.ratingAvg
    )
    .slice(0, limit);

  // ── explainable anchors ─────────────────────────────────────────
  const progressSeriesIds = new Set(progressBySeries.keys());
  return scored.map(({ c }) => {
    const overlaps = history
      .map((h) => ({
        title: h.titleAr,
        shared: h.genres.filter((g) => c.genres.includes(g)).length,
        fromProgress: progressSeriesIds.has(h.id),
      }))
      .filter((o) => o.shared > 0)
      .sort((a, b) => b.shared - a.shared || Number(b.fromProgress) - Number(a.fromProgress));

    const anchor = overlaps[0];
    let reasonAr: string;
    if (anchor?.fromProgress) {
      reasonAr = `لأنك قرأت «${anchor.title}»`;
    } else if (anchor) {
      reasonAr = `يشبه «${anchor.title}» من مكتبتك`;
    } else {
      const topGenre = [...affinity.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "ذوقك";
      reasonAr = `يطابق ذوقك في «${topGenre}»`;
    }
    return { series: c, reasonAr };
  });
}
