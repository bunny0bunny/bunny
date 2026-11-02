/** A display fallback only: never write this label back to chapter snapshots. */
export function getChapterTitle(chapter: { number: number; titleAr?: string | null }): string {
  return chapter.titleAr?.trim() || `الفصل ${chapter.number}`;
}

/** Number plus optional title, without repeating the fallback chapter label. */
export function getChapterLabel(chapter: { number: number; titleAr?: string | null }): string {
  const title = chapter.titleAr?.trim();
  const fallback = `الفصل ${chapter.number}`;
  return title && title !== fallback ? `${fallback} · ${title}` : fallback;
}
