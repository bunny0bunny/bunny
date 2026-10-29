"use client";

import { isReaderProgress } from "@/lib/reader-progress";
import { isChapterNumber } from '@/lib/chapter-number';
import type { Format } from "@/lib/constants";

/**
 * Guest/mirror reading progress in localStorage (docs/DECISIONS.md D-16, D-25).
 * Signed-in users also persist via the saveReadingProgress Server Action;
 * this mirror is always written so the Continue Reading hero works instantly.
 */

export type LocalProgress = {
  seriesSlug: string;
  seriesTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  pageIndex: number;
  pageOffset?: number | null;
  completed?: boolean;
  percent: number;
  total: number;
  format: "manga" | "webtoon" | "novel";
  coverPath: string;
  accent: string;
  updatedAt: number;
};

const KEY = "bunny.progress.v1";

function isLocalProgress(value: unknown): value is LocalProgress {
  if (!isReaderProgress(value)) return false;
  const p = value as LocalProgress;
  return typeof p.seriesSlug === "string" && p.seriesSlug.length > 0 &&
    isChapterNumber(p.chapterNumber) &&
    Number.isSafeInteger(p.total) && p.total > 0 &&
    ["manga", "webtoon", "novel"].includes(p.format) &&
    [p.seriesTitle, p.chapterTitle, p.coverPath, p.accent].every(v => typeof v === "string");
}

export function readAllLocal(): LocalProgress[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(isLocalProgress) : [];
  } catch {
    return [];
  }
}

export function readLocal(seriesSlug: string): LocalProgress | null {
  const all = readAllLocal();
  return all.find((p) => p.seriesSlug === seriesSlug) ?? null;
}

export function readChapterLocal(seriesSlug: string, chapterNumber: number, format: Format): LocalProgress | null {
  return readAllLocal().filter(p => p.seriesSlug === seriesSlug && p.chapterNumber === chapterNumber && p.format === format)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

export function writeLocal(p: Omit<LocalProgress, "updatedAt">) {
  if (typeof window === "undefined") return;
  try {
    const all = readAllLocal().filter((x) => x.seriesSlug !== p.seriesSlug);
    all.unshift({ ...p, updatedAt: Date.now() });
    window.localStorage.setItem(KEY, JSON.stringify(all.slice(0, 20)));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function hasReadLocal(seriesSlug: string, chapterNumber: number): boolean {
  const p = readLocal(seriesSlug);
  if (!p) return false;
  return p.chapterNumber > chapterNumber || (p.chapterNumber === chapterNumber && (p.completed === true || p.percent >= 99));
}
