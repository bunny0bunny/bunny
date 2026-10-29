// Keep the existing chapter range while allowing bonus/extra chapter fractions.
export const MAX_CHAPTER_NUMBER = 2_147_483_647;
export function isChapterNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= MAX_CHAPTER_NUMBER;
}
export function nextChapterNumber(highest: number | null | undefined): number {
  return highest == null ? 1 : Math.floor(highest) + 1;
}
