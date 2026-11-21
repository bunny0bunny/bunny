import { BookOpen, Check, Compass, Crown, Flag, Flame, Footprints, Library, Lock, MessageSquare, Star, Zap, type LucideIcon } from "lucide-react";
import { TIER_LABELS, type BadgeIcon, type BadgeState, type BadgeTier } from "@/lib/badges";

const ICONS: Record<BadgeIcon, LucideIcon> = {
  footprints: Footprints, book: BookOpen, flame: Flame, flag: Flag, library: Library,
  star: Star, message: MessageSquare, compass: Compass, zap: Zap, crown: Crown,
};

/** Each tier has its own metal: copper, steel, gold, and an animated aurora for legendary. */
const TIER_STYLE: Record<BadgeTier, { card: string; medal: string; text: string; chip: string; bar: string }> = {
  bronze: {
    card: "border-[#c07a45]/45 bg-gradient-to-b from-[#c07a45]/14 to-card",
    medal: "bg-gradient-to-br from-[#e3a06c] to-[#8a4b22] text-[#fff4ea] shadow-[0_0_0_3px_rgba(192,122,69,0.18)]",
    text: "text-[#e3a06c]", chip: "bg-[#c07a45]/15 text-[#e3a06c]", bar: "bg-[#c07a45]",
  },
  silver: {
    card: "border-slate-300/40 bg-gradient-to-b from-slate-300/12 to-card",
    medal: "bg-gradient-to-br from-slate-100 to-slate-400 text-slate-800 shadow-[0_0_0_3px_rgba(203,213,225,0.18)]",
    text: "text-slate-200", chip: "bg-slate-300/15 text-slate-200", bar: "bg-slate-300",
  },
  gold: {
    card: "border-gold/55 bg-gradient-to-b from-gold/16 to-card shadow-[0_10px_30px_-14px_rgba(234,179,8,0.45)]",
    medal: "bg-gradient-to-br from-yellow-200 via-gold to-amber-600 text-amber-950 shadow-[0_0_0_3px_rgba(234,179,8,0.22),0_0_18px_rgba(234,179,8,0.35)]",
    text: "text-gold", chip: "bg-gold/15 text-gold", bar: "bg-gold",
  },
  legendary: {
    card: "border-transparent bg-card badge-legendary shadow-[0_14px_40px_-16px_rgba(192,132,252,0.6)]",
    medal: "badge-legendary-medal text-white shadow-[0_0_22px_rgba(192,132,252,0.55)]",
    text: "bg-gradient-to-l from-fuchsia-300 via-violet-200 to-amber-200 bg-clip-text text-transparent", chip: "bg-violet-400/15 text-violet-200", bar: "bg-gradient-to-l from-fuchsia-400 via-violet-400 to-amber-300",
  },
};

export function BadgeCard({ badge }: { badge: BadgeState }) {
  const Icon = ICONS[badge.icon];
  const style = badge.tier ? TIER_STYLE[badge.tier] : null;
  const next = badge.next;
  const percent = next ? Math.min(100, Math.round((next.current / next.target) * 100)) : 100;
  return (
    <div className={`relative flex flex-col rounded-2xl border p-3.5 transition ${style ? style.card : "border-dashed border-border/60 bg-card"}`}>
      <div className="flex items-start gap-3">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${style ? style.medal : "bg-secondary text-muted-foreground/60"}`} aria-hidden>
          {style ? <Icon className="size-5" /> : <Lock className="size-4" />}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-bold leading-6 ${style ? style.text : "text-muted-foreground"}`}>{badge.labelAr}</p>
          {badge.tier && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style!.chip}`}>
            <Check className="size-3" aria-hidden />{TIER_LABELS[badge.tier]}
          </span>}
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{badge.descriptionAr}</p>
      {next && <div className="mt-auto pt-2.5">
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="truncate">{badge.earned ? `التالي: ${next.labelAr}` : "التقدم"}</span>
          <span className="shrink-0 tabular-nums" dir="ltr">{badge.hintAr}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={next.target} aria-valuenow={Math.min(next.current, next.target)} aria-label={`التقدم نحو ${next.labelAr}`}>
          <div className={`h-full rounded-full ${style ? style.bar : "bg-muted-foreground/40"}`} style={{ width: `${percent}%` }} />
        </div>
      </div>}
      {!next && badge.earned && badge.tier === "legendary" && <p className="mt-auto pt-2 text-[10px] font-semibold text-violet-200">أعلى مستوى</p>}
    </div>
  );
}
