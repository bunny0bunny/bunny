/** Canonical display/filter names; legacy stored JSON is left untouched on reads. */
export function normalizeGenre(genre: string): string {
  const value = genre.trim();
  return ['شريحة من الحياة', 'الحياه اليوميه', 'الحياة اليومية'].includes(value) ? 'الحياة اليومية' : value;
}
export function normalizeGenres(genres: string[]): string[] {
  return [...new Set(genres.map(normalizeGenre).filter(Boolean))];
}
