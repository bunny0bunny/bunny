export type ShareCardData = { slug: string; titleAr: string; author: string; accent: string; format: string; genresJson: string; ratingAvg: number; ratingCount: number };
// Increment when changing layout, fonts, labels or the Arabic text treatment.
export const SHARE_CARD_RENDERER_VERSION = "2";
export const DEFAULT_SHARE_CARD_PATH = "/share/bunyora-default.png";
export type ShareCardManifest = {
  version: 1;
  default: { fingerprint: string; path: string };
  cards: Record<string, { fingerprint: string; path: string }>;
};

export function toShareCardData(work: ShareCardData): ShareCardData {
  const { slug, titleAr, author, accent, format, genresJson, ratingAvg, ratingCount } = work;
  return { slug, titleAr, author, accent, format, genresJson, ratingAvg, ratingCount };
}

export function shareCardGenres(value: string): string[] {
  try {
    const genres: unknown = JSON.parse(value);
    return Array.isArray(genres) ? genres.filter((item): item is string => typeof item === "string").slice(0, 3) : [];
  } catch { return []; }
}

/** Ratings are a preparation-time snapshot; routine reader activity does not invalidate cards. */
export async function shareCardFingerprint(work: ShareCardData | null, version = SHARE_CARD_RENDERER_VERSION): Promise<string> {
  const editorial = work ? [work.slug, work.titleAr, work.author, work.accent, work.format, shareCardGenres(work.genresJson)] : null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([version, editorial])));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Treat manifest paths as untrusted: only this exact local content-addressed filename is allowed. */
export function resolveShareCardPath(slug: string | null, manifest: unknown): string {
  if (!slug || !manifest || typeof manifest !== "object" || !("cards" in manifest)) return DEFAULT_SHARE_CARD_PATH;
  const cards = manifest.cards;
  if (!cards || typeof cards !== "object" || !Object.prototype.hasOwnProperty.call(cards, slug)) return DEFAULT_SHARE_CARD_PATH;
  const entry: unknown = Reflect.get(cards, slug);
  if (!entry || typeof entry !== "object" || !("fingerprint" in entry) || !("path" in entry)) return DEFAULT_SHARE_CARD_PATH;
  return typeof entry.fingerprint === "string" && /^[a-f0-9]{64}$/.test(entry.fingerprint) && entry.path === `/share/${entry.fingerprint}.png`
    ? entry.path : DEFAULT_SHARE_CARD_PATH;
}

export function validateSharePng(bytes: Uint8Array): void {
  const header = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
  if (bytes.length < 24 || header.some((value, index) => bytes[index] !== value)) throw new Error("Share card must be a PNG with an IHDR header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(16) !== 1200 || view.getUint32(20) !== 630) throw new Error("Share card must measure 1200 by 630 pixels");
}
