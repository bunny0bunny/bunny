/**
 * One Arabic "time ago" for the whole site, with correct number agreement:
 * 1 → «يوم», 2 → «يومين», 3–10 → «3 أيام», 11+ → «11 يومًا».
 */
type Unit = { one: string; two: string; few: string; many: string };

const UNITS = {
  minute: { one: "دقيقة", two: "دقيقتين", few: "دقائق", many: "دقيقة" },
  hour: { one: "ساعة", two: "ساعتين", few: "ساعات", many: "ساعة" },
  day: { one: "يوم", two: "يومين", few: "أيام", many: "يومًا" },
  month: { one: "شهر", two: "شهرين", few: "أشهر", many: "شهرًا" },
  year: { one: "سنة", two: "سنتين", few: "سنوات", many: "سنة" },
} satisfies Record<string, Unit>;

export function countAr(n: number, unit: keyof typeof UNITS): string {
  const u = UNITS[unit];
  if (n === 1) return u.one;
  if (n === 2) return u.two;
  if (n >= 3 && n <= 10) return `${n} ${u.few}`;
  return `${n} ${u.many}`;
}

export function timeAgoAr(input: Date | string | number, options: {
  now?: number; prefix?: "قبل" | "منذ"; precision?: "minute" | "day";
} = {}): string {
  const { now = Date.now(), prefix = "قبل", precision = "minute" } = options;
  const time = new Date(input).getTime();
  if (!Number.isFinite(time)) return "";
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (precision === "day" && days < 1) return "اليوم";
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `${prefix} ${countAr(minutes, "minute")}`;
  if (hours < 24) return `${prefix} ${countAr(hours, "hour")}`;
  if (days < 30) return `${prefix} ${countAr(days, "day")}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${prefix} ${countAr(months, "month")}`;
  return `${prefix} ${countAr(Math.floor(months / 12), "year")}`;
}
