/**
 * Pure rules for public reader profiles (no DB, safe to import on the client).
 */
export const HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,23}$/;
export const MAX_FEATURED_SERIES = 6;
export const MAX_FEATURED_BADGES = 3;

const RESERVED_HANDLES = new Set([
  "admin", "administrator", "moderator", "mod", "staff", "support", "help", "team", "teams",
  "bunny", "bunyora", "banyora", "official", "system", "root", "null", "undefined",
  "api", "u", "me", "profile", "settings", "login", "register", "studio", "explore", "library",
]);

export type HandleResult = { ok: true; handle: string | null } | { ok: false; error: string };

/** Empty clears the handle; otherwise 3–24 latin letters, digits or _ starting with a letter. */
export function cleanHandle(raw: unknown): HandleResult {
  if (raw === null || raw === undefined) return { ok: true, handle: null };
  if (typeof raw !== "string") return { ok: false, error: "اسم المستخدم غير صالح." };
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  if (!handle) return { ok: true, handle: null };
  if (!HANDLE_PATTERN.test(handle)) return { ok: false, error: "اسم المستخدم من 3 إلى 24 حرفًا إنجليزيًا أو رقمًا أو _ ويبدأ بحرف." };
  if (RESERVED_HANDLES.has(handle) || /bunyora|banyora/.test(handle)) return { ok: false, error: "اسم المستخدم هذا محجوز. اختر اسمًا آخر." };
  return { ok: true, handle };
}

export const COVER_THEMES = {
  dusk: { labelAr: "غسق", className: "bg-gradient-to-l from-violet-600/70 via-fuchsia-500/40 to-amber-400/40" },
  ocean: { labelAr: "محيط", className: "bg-gradient-to-l from-sky-600/70 via-cyan-500/40 to-emerald-400/30" },
  sakura: { labelAr: "ساكورا", className: "bg-gradient-to-l from-pink-500/70 via-rose-400/40 to-orange-200/30" },
  forest: { labelAr: "غابة", className: "bg-gradient-to-l from-emerald-700/70 via-teal-500/40 to-lime-300/30" },
  ember: { labelAr: "جمر", className: "bg-gradient-to-l from-red-700/70 via-orange-500/45 to-yellow-300/30" },
  night: { labelAr: "ليل", className: "bg-gradient-to-l from-slate-800 via-indigo-900/80 to-violet-800/60" },
} as const;
export type CoverTheme = keyof typeof COVER_THEMES;

export function isCoverTheme(value: unknown): value is CoverTheme {
  return typeof value === "string" && Object.hasOwn(COVER_THEMES, value);
}

export function coverClass(value: string | null | undefined): string {
  return COVER_THEMES[isCoverTheme(value) ? value : "dusk"].className;
}

/** Parse a stored JSON id list defensively (bad legacy data reads as empty). */
export function parseIdList(raw: string | null | undefined, max: number): string[] {
  try {
    const value = JSON.parse(raw || "[]");
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id)))].slice(0, max);
  } catch { return []; }
}

/** Public URL key: the handle when set, else the stable profile id. */
export function publicProfileHref(profile: { id: string; handle?: string | null; profilePublic?: boolean; disabledAt?: Date | null }): string | null {
  if (profile.profilePublic === false || profile.disabledAt) return null;
  return `/u/${profile.handle || profile.id}`;
}
