type WorkTitles = { titleOriginal?: string | null; titleAr?: string | null };

// titleOriginal is the existing storage field for the English/romanized title.
// Keep the stored translations separate from the title chosen for presentation.
export function getWorkTitles(work: WorkTitles) {
  const english = work.titleOriginal?.trim() ?? '';
  const arabic = work.titleAr?.trim() ?? '';
  return { primary: english || arabic || 'Untitled work', secondary: english && arabic && english !== arabic ? arabic : null };
}

export function getWorkTitle(work: WorkTitles): string {
  return getWorkTitles(work).primary;
}

export function workTitleIssue(work: WorkTitles & { id?: string }): string | null {
  const english = work.titleOriginal?.trim() ?? '', arabic = work.titleAr?.trim() ?? '';
  if (!work.id && english.length < 2) return 'العنوان الإنجليزي مطلوب (حرفان على الأقل)';
  if (english && english.length < 2) return 'العنوان الإنجليزي قصير جدًا';
  if (arabic && arabic.length < 2) return 'العنوان العربي قصير جدًا';
  return english || arabic ? null : 'أدخل عنوانًا للعمل';
}
