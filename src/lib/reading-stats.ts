import "server-only";
import { db } from "@/lib/db";

/**
 * Release D — reading streaks, weekly activity, and badges (FD-12).
 *
 * Zero-schema derivation from existing tables:
 *   • AnalyticsEvent (read_start / read_page / read_complete) → activity history
 *   • ReadingProgress.updatedAt → "touched recently" grace, so a reader who
 *     reads today always shows a live streak even if event rows were missed
 *   • ReadingProgress.completed → chapters-finished counters
 *   • LibraryItem / Comment / Rating → badge predicates
 *
 * Day buckets use UTC date strings — the same convention as the admin
 * dashboard chart (getDashboardActivity), so all activity views agree.
 *
 * Streak semantics (webtoon-industry convention):
 *   • If the reader was active today → streak counts back from today.
 *   • Else if active yesterday → the streak is still alive ("at risk") and
 *     counts back from yesterday.
 *   • Otherwise → 0. `longestStreak` scans the full 365-day window.
 */

export type BadgeState = {
  id: string;
  labelAr: string;
  descriptionAr: string;
  earned: boolean;
  /** Arabic progress hint for locked badges, e.g. "7/10 فصلًا" */
  hintAr?: string;
};

export type ReadingStats = {
  currentStreak: number;
  longestStreak: number;
  daysActive30: number;
  startedChapters: number;
  completedChapters: number;
  weekly: { day: string; label: string; events: number }[];
  badges: BadgeState[];
};

const READ_TYPES = ["read_start", "read_page", "read_complete"] as const;
const WINDOW_DAYS = 365;
const CHART_DAYS = 14;

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

export async function getReadingStats(profileId: string): Promise<ReadingStats> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000);

  const [events, progress, libraryItems, commentCount, ratingCount] = await Promise.all([
    db.analyticsEvent.findMany({
      where: { profileId, type: { in: [...READ_TYPES] }, createdAt: { gte: since } },
      select: { type: true, createdAt: true },
    }),
    db.readingProgress.findMany({
      where: { profileId },
      select: { updatedAt: true, completed: true },
    }),
    db.libraryItem.findMany({ where: { profileId }, select: { shelf: true } }),
    db.comment.count({ where: { profileId, status: { in: ["visible", "flagged"] } } }),
    db.rating.count({ where: { profileId } }),
  ]);

  // ── activity days: events ∪ recent progress touches ─────────────
  const activeDays = new Set<string>();
  for (const e of events) activeDays.add(dayKey(e.createdAt));
  for (const p of progress) activeDays.add(dayKey(p.updatedAt));

  const today = new Date();
  const isActive = (d: Date) => activeDays.has(dayKey(d));
  const daysAgoDate = (n: number) => new Date(Date.now() - n * 86400000);

  // current streak — from today, or from yesterday while the day is young
  let currentStreak = 0;
  let cursor = isActive(today) ? 0 : isActive(daysAgoDate(1)) ? 1 : -1;
  if (cursor >= 0) {
    while (isActive(daysAgoDate(cursor))) {
      currentStreak++;
      cursor++;
    }
  }

  // longest streak across the whole window
  const sorted = [...activeDays].sort();
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of sorted) {
    const gap =
      prev === null ? Infinity : (Date.parse(key) - Date.parse(prev)) / 86400000;
    run = gap === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prev = key;
  }

  // days active in the last 30
  const cutoff30 = dayKey(daysAgoDate(30));
  const daysActive30 = [...activeDays].filter((k) => k >= cutoff30).length;

  // 14-day chart buckets (events only — progress touches are a single date and
  // would misrepresent history; the chart mirrors the analytics footprint)
  const weekly: { day: string; label: string; events: number }[] = [];
  const bucket = new Map<string, number>();
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86400000));
    bucket.set(key, 0);
    weekly.push({ day: key, label: `${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}`, events: 0 });
  }
  for (const e of events) {
    const key = dayKey(e.createdAt);
    if (bucket.has(key)) bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }
  for (const w of weekly) w.events = bucket.get(w.day) ?? 0;

  const startedChapters = progress.length;
  const completedChapters = progress.filter((p) => p.completed).length;
  const libraryCount = libraryItems.length;
  const finishedShelf = libraryItems.filter((l) => l.shelf === "finished").length;

  // ── badges: deterministic, honest, with progress hints when locked ──
  const badges: BadgeState[] = [
    {
      id: "first-step",
      labelAr: "الخطوة الأولى",
      descriptionAr: "ابدأ أول فصل لك على المكتبة",
      earned: startedChapters >= 1,
      hintAr: startedChapters === 0 ? "ابدأ أي فصل لتُشعل بدايتك" : undefined,
    },
    {
      id: "streak-3",
      labelAr: "ثلاثة أيام متتالية",
      descriptionAr: "اقرأ ثلاثة أيام في صف واحد",
      earned: longestStreak >= 3,
      hintAr: longestStreak < 3 ? `${currentStreak}/3 أيام` : undefined,
    },
    {
      id: "streak-7",
      labelAr: "أسبوع كامل",
      descriptionAr: "حافظ على قراءتك سبعة أيام متتالية",
      earned: longestStreak >= 7,
      hintAr: longestStreak < 7 ? `${currentStreak}/7 أيام` : undefined,
    },
    {
      id: "chapters-10",
      labelAr: "قارئ مجتهد",
      descriptionAr: "أكمل عشرة فصول",
      earned: completedChapters >= 10,
      hintAr: completedChapters < 10 ? `${completedChapters}/10 فصلًا` : undefined,
    },
    {
      id: "finisher",
      labelAr: "المُتمِّم",
      descriptionAr: "أضف عملًا إلى رف «أنهيته»",
      earned: finishedShelf >= 1,
      hintAr: finishedShelf === 0 ? "أنهِ عملًا وانقله إلى رف «أنهيته»" : undefined,
    },
    {
      id: "first-rating",
      labelAr: "الناقد",
      descriptionAr: "قيّم أول عمل لك",
      earned: ratingCount >= 1,
      hintAr: ratingCount === 0 ? "قيّم أي عمل ب نجمة واحدة على الأقل" : undefined,
    },
    {
      id: "first-comment",
      labelAr: "صوت مجتمع",
      descriptionAr: "شارك أول تعليق لك",
      earned: commentCount >= 1,
      hintAr: commentCount === 0 ? "علّق على أي عمل تحبه" : undefined,
    },
    {
      id: "collector",
      labelAr: "الجامع",
      descriptionAr: "اجمع خمسة أعمال في مكتبتك",
      earned: libraryCount >= 5,
      hintAr: libraryCount < 5 ? `${libraryCount}/5 أعمال` : undefined,
    },
  ];

  return {
    currentStreak,
    longestStreak,
    daysActive30,
    startedChapters,
    completedChapters,
    weekly,
    badges,
  };
}
