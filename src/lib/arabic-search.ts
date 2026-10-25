/**
 * Bunyora Library — Arabic-aware search (Release E, zero DDL).
 *
 * Arabic search needs more than SQL `contains`: readers type hamza-less
 * ("اسطورة" for "أسطورة"), drop diacritics, mix ة/ه and ى/ي, and make typos.
 * This module normalizes the query AND the corpus to one canonical form,
 * then scores with weighted field matching + bounded typo tolerance.
 *
 * Applied in-memory over the catalog (12 series in the demo; comfortably
 * scales to low thousands). The DB `contains` prefilter remains for the
 * no-query path only.
 */

/** Tashkeel (fathatan → sukun), superscript alef, and tatweel. */
const DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;

/**
 * Canonical form used for comparison (never for display):
 * - strip diacritics + tatweel
 * - alef variants أإآٱ → ا
 * - teh marbuta ة → ه
 * - alef maqsura ى → ي
 * - hamza carriers ؤ → و, ئ → ي
 * - latin lowercased (for titleOriginal / slugs typed in the box)
 */
export function normalizeArabic(input: string): string {
  return input
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .trim();
}

/** Words of the normalized text (letters/digits only). */
export function tokenizeArabic(input: string): string[] {
  return normalizeArabic(input)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Bounded Levenshtein with early exit — typo tolerance for words ≥ 4 chars
 * (max distance 1) and ≥ 6 chars (max distance 2). Short Arabic words are
 * too dense for fuzzy matching; exact/prefix handles them.
 */
export function withinEditDistance(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** Max edit distance allowed for a token of this length. */
function fuzzyTolerance(len: number): number {
  if (len >= 6) return 2;
  if (len >= 4) return 1;
  return 0;
}

export type SearchField = { text: string; weight: number };

/**
 * Score of ONE query token against weighted fields. Returns the best
 * (score × weight) of: word-equal 100, word-prefix 70, substring 50,
 * fuzzy(distance) 40/25. 0 when the token is not matched anywhere.
 */
function tokenScore(token: string, fields: SearchField[]): number {
  let best = 0;
  for (const f of fields) {
    const words = tokenizeArabic(f.text);
    let s = 0;
    if (words.some((w) => w === token)) s = 100;
    else if (words.some((w) => w.startsWith(token))) s = 70;
    else if (words.some((w) => token.startsWith(w) && w.length >= 3)) s = 55;
    else if (normalizeArabic(f.text).includes(token)) s = 50;
    else {
      const tol = fuzzyTolerance(token.length);
      if (tol > 0 && words.some((w) => withinEditDistance(token, w, tol))) s = tol === 1 ? 40 : 25;
    }
    if (s > 0) best = Math.max(best, s * f.weight);
  }
  return best;
}

/**
 * Score a document (list of weighted fields) against the query.
 * AND semantics: EVERY query token must match somewhere, otherwise the
 * document scores 0 (keeps precision high for multi-word queries).
 */
export function scoreDocument(queryTokens: string[], fields: SearchField[]): number {
  if (queryTokens.length === 0) return 0;
  let total = 0;
  for (const t of queryTokens) {
    const s = tokenScore(t, fields);
    if (s === 0) return 0;
    total += s;
  }
  return total;
}

/**
 * "Did you mean" support: highest fuzzy title match for the query, returned
 * even when nothing scored (explore empty state). Uses one step LOOSER
 * tolerance than the search itself — otherwise the suggestion would be
 * unreachable (everything close enough to suggest is also close enough to
 * match, so results would never be empty in the first place).
 */
export function suggestTitle(query: string, titles: string[]): string | null {
  const qTokens = tokenizeArabic(query);
  if (qTokens.length === 0 || titles.length === 0) return null;
  let best: { title: string; score: number } | null = null;
  for (const title of titles) {
    const words = tokenizeArabic(title);
    let score = 0;
    for (const t of qTokens) {
      let s = 0;
      if (words.some((w) => w === t)) s = 100;
      else if (words.some((w) => w.startsWith(t))) s = 80;
      else {
        const tol = fuzzyTolerance(t.length) + 1;
        if (words.some((w) => withinEditDistance(t, w, tol))) s = tol === 2 ? 60 : 35;
      }
      if (s > 0) score += s;
      else {
        score = 0;
        break;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { title, score };
  }
  // Suggest only when it is genuinely fuzzy help, not a plain echo.
  return best && best.score < 300 ? best.title : null;
}
