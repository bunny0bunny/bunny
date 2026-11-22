/**
 * Reading badges: families with four tiers that get much harder at the top.
 * Pure and deterministic, computed from existing reading data (no extra tables).
 */
export type BadgeTier = "bronze" | "silver" | "gold" | "legendary";

export type BadgeMetrics = {
  startedChapters: number;
  completedChapters: number;
  longestStreak: number;
  finishedWorks: number;
  libraryCount: number;
  ratingCount: number;
  commentCount: number;
  genresRead: number;
  /** Most chapters completed on a single day. */
  bestDay: number;
  /** 1-based sign-up order among all accounts. */
  signupRank: number;
};

export type BadgeState = {
  id: string;
  icon: BadgeIcon;
  labelAr: string;
  descriptionAr: string;
  /** Highest tier reached, or null while locked. */
  tier: BadgeTier | null;
  earned: boolean;
  /** Progress toward the next tier (or toward the first one). Null once maxed. */
  next: { tier: BadgeTier; current: number; target: number; labelAr: string } | null;
  /** Arabic progress hint, e.g. "7/10 فصول". */
  hintAr?: string;
};

export type BadgeIcon = "footprints" | "book" | "flame" | "flag" | "library" | "star" | "message" | "compass" | "zap" | "crown";

type Step = { tier: BadgeTier; target: number; labelAr: string };
type Noun = { one: string; two: string; few: string; many: string };
type Family = { id: string; icon: BadgeIcon; metric: keyof BadgeMetrics; descriptionAr: (count: string) => string; noun: Noun; steps: Step[] };

export const TIER_LABELS: Record<BadgeTier, string> = { bronze: "برونزية", silver: "فضية", gold: "ذهبية", legendary: "أسطورية" };
const ORDER: BadgeTier[] = ["bronze", "silver", "gold", "legendary"];

const CHAPTER: Noun = { one: "فصلًا واحدًا", two: "فصلين", few: "فصول", many: "فصلًا" };
const DAY: Noun = { one: "يومًا واحدًا", two: "يومين", few: "أيام", many: "يومًا" };
const WORK: Noun = { one: "عملًا واحدًا", two: "عملين", few: "أعمال", many: "عملًا" };
const COMMENT: Noun = { one: "تعليقًا واحدًا", two: "تعليقين", few: "تعليقات", many: "تعليقًا" };
const GENRE: Noun = { one: "نوعًا واحدًا", two: "نوعين", few: "أنواع", many: "نوعًا" };

/** Arabic counted phrase: 1 «فصلًا واحدًا», 2 «فصلين», 3–10 «3 فصول», 11+ «100 فصلًا». */
export function countedAr(n: number, noun: Noun): string {
  if (n === 1) return noun.one;
  if (n === 2) return noun.two;
  return n >= 3 && n <= 10 ? `${n} ${noun.few}` : `${n} ${noun.many}`;
}

const FAMILIES: Family[] = [
  { id: "chapters", icon: "book", metric: "completedChapters", noun: CHAPTER, descriptionAr: n => `أكمل ${n}`, steps: [
    { tier: "bronze", target: 10, labelAr: "قارئ مجتهد" }, { tier: "silver", target: 100, labelAr: "قارئ نهم" },
    { tier: "gold", target: 500, labelAr: "دودة كتب" }, { tier: "legendary", target: 1000, labelAr: "أسطورة المكتبة" }] },
  { id: "streak", icon: "flame", metric: "longestStreak", noun: DAY, descriptionAr: n => `اقرأ ${n} على التوالي`, steps: [
    { tier: "bronze", target: 3, labelAr: "ثلاثة أيام متتالية" }, { tier: "silver", target: 7, labelAr: "أسبوع كامل" },
    { tier: "gold", target: 30, labelAr: "شهر بلا انقطاع" }, { tier: "legendary", target: 100, labelAr: "شعلة لا تنطفئ" }] },
  { id: "finisher", icon: "flag", metric: "finishedWorks", noun: WORK, descriptionAr: n => `انقل ${n} إلى رف «أنهيته»`, steps: [
    { tier: "bronze", target: 1, labelAr: "المُتمِّم" }, { tier: "silver", target: 10, labelAr: "صائد النهايات" },
    { tier: "gold", target: 25, labelAr: "لا يترك قصة" }, { tier: "legendary", target: 50, labelAr: "خاتم الحكايات" }] },
  { id: "collector", icon: "library", metric: "libraryCount", noun: WORK, descriptionAr: n => `اجمع ${n} في مكتبتك`, steps: [
    { tier: "bronze", target: 5, labelAr: "الجامع" }, { tier: "silver", target: 25, labelAr: "صاحب رفوف" },
    { tier: "gold", target: 60, labelAr: "أمين المكتبة" }, { tier: "legendary", target: 150, labelAr: "خزانة الكنوز" }] },
  { id: "marathon", icon: "zap", metric: "bestDay", noun: CHAPTER, descriptionAr: n => `أكمل ${n} في يوم واحد`, steps: [
    { tier: "bronze", target: 10, labelAr: "جلسة طويلة" }, { tier: "silver", target: 25, labelAr: "ماراثون" },
    { tier: "gold", target: 50, labelAr: "ليلة بيضاء" }, { tier: "legendary", target: 100, labelAr: "لا يُوقَف" }] },
  { id: "explorer", icon: "compass", metric: "genresRead", noun: GENRE, descriptionAr: n => `اقرأ أعمالًا من ${n} مختلفة`, steps: [
    { tier: "bronze", target: 3, labelAr: "فضولي" }, { tier: "silver", target: 6, labelAr: "مستكشف" },
    { tier: "gold", target: 9, labelAr: "رحّالة" }, { tier: "legendary", target: 12, labelAr: "عابر العوالم" }] },
  { id: "critic", icon: "star", metric: "ratingCount", noun: WORK, descriptionAr: n => `قيّم ${n}`, steps: [
    { tier: "bronze", target: 1, labelAr: "الناقد" }, { tier: "silver", target: 10, labelAr: "ذوّاق" },
    { tier: "gold", target: 30, labelAr: "ناقد محترف" }, { tier: "legendary", target: 75, labelAr: "حَكَم المكتبة" }] },
  { id: "voice", icon: "message", metric: "commentCount", noun: COMMENT, descriptionAr: n => `شارك ${n}`, steps: [
    { tier: "bronze", target: 1, labelAr: "صوت مجتمع" }, { tier: "silver", target: 25, labelAr: "محاور" },
    { tier: "gold", target: 100, labelAr: "روح النقاش" }, { tier: "legendary", target: 300, labelAr: "صوت بانيورا" }] },
];

function family(f: Family, m: BadgeMetrics): BadgeState {
  const value = Math.max(0, m[f.metric]);
  const reached = f.steps.filter(s => value >= s.target);
  const top = reached.at(-1) ?? null;
  const upcoming = f.steps.find(s => value < s.target) ?? null;
  const shown = top ?? f.steps[0];
  return {
    id: f.id, icon: f.icon, labelAr: shown.labelAr, tier: top?.tier ?? null, earned: top !== null,
    descriptionAr: f.descriptionAr(countedAr(upcoming?.target ?? shown.target, f.noun)),
    next: upcoming ? { tier: upcoming.tier, current: value, target: upcoming.target, labelAr: upcoming.labelAr } : null,
    hintAr: upcoming ? `${Math.min(value, upcoming.target)}/${upcoming.target}` : undefined,
  };
}

export function computeBadges(m: BadgeMetrics): BadgeState[] {
  const firstStep: BadgeState = {
    id: "first-step", icon: "footprints", labelAr: "الخطوة الأولى", descriptionAr: "ابدأ أول فصل لك على المكتبة",
    tier: m.startedChapters >= 1 ? "bronze" : null, earned: m.startedChapters >= 1,
    next: m.startedChapters >= 1 ? null : { tier: "bronze", current: 0, target: 1, labelAr: "الخطوة الأولى" },
    hintAr: m.startedChapters >= 1 ? undefined : "ابدأ أي فصل لتُشعل بدايتك",
  };
  const pioneerEarned = m.signupRank >= 1 && m.signupRank <= 100;
  const pioneer: BadgeState = {
    id: "pioneer", icon: "crown", labelAr: "من الأوائل", descriptionAr: "من أول 100 حساب في بانيورا. لا تُكتسب بعد الآن.",
    tier: pioneerEarned ? "legendary" : null, earned: pioneerEarned, next: null,
  };
  const all = [firstStep, ...FAMILIES.map(f => family(f, m))];
  // The pioneer badge is only shown to the people who hold it.
  return pioneerEarned ? [pioneer, ...all] : all;
}

export function tierRank(tier: BadgeTier | null): number {
  return tier ? ORDER.indexOf(tier) + 1 : 0;
}
