import { z } from "zod";
import { normalizeArabic } from "@/lib/arabic-search";

/**
 * Display-name rules shared by registration, invitations, profile settings
 * and onboarding. Readers type any name they like; we only clean it and keep
 * people from posing as the site or its staff (staff badges show real roles).
 */
export const PROFILE_NAME_MIN = 2;
export const PROFILE_NAME_MAX = 40;

// Whole words after Arabic normalization (أ/إ/آ→ا, ة→ه, ى→ي) and case folding.
const RESERVED_TOKENS = new Set([
  "بانيورا", "باني", "اداره", "الاداره", "مشرف", "المشرف", "مشرفه", "دعم", "الدعم",
  "admin", "administrator", "moderator", "mod", "staff", "support", "bunyora", "banyora", "bunny",
]);
// Brand names are refused anywhere, even glued to other letters.
const RESERVED_ANYWHERE = ["بانيورا", "bunyora", "banyora"];

export type ProfileNameResult = { ok: true; name: string } | { ok: false; error: string };

export function cleanProfileName(raw: unknown): ProfileNameResult {
  if (typeof raw !== "string") return { ok: false, error: "اكتب اسمًا يظهر للآخرين." };
  // Control, zero-width and bidi-override characters (Unicode Cc/Cf) can hide or reorder text.
  const name = raw.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/gu, " ").trim();
  if ([...name].length < PROFILE_NAME_MIN) return { ok: false, error: "الاسم حرفان على الأقل." };
  if ([...name].length > PROFILE_NAME_MAX) return { ok: false, error: "الاسم ٤٠ حرفًا على الأكثر." };
  if (!/\p{L}/u.test(name)) return { ok: false, error: "الاسم يجب أن يحتوي على حروف." };
  const normalized = normalizeArabic(name);
  const tokens = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const squashed = tokens.join("");
  if (tokens.some((token) => RESERVED_TOKENS.has(token)) || RESERVED_ANYWHERE.some((word) => squashed.includes(word))) {
    return { ok: false, error: "هذا الاسم محجوز للموقع أو فريق الإدارة. اختر اسمًا آخر." };
  }
  return { ok: true, name };
}

/** Zod field that cleans the name and reports the Arabic rule that failed. */
export const profileNameSchema = z.string().transform((value, ctx) => {
  const result = cleanProfileName(value);
  if (!result.ok) { ctx.addIssue({ code: "custom", message: result.error }); return z.NEVER; }
  return result.name;
});
