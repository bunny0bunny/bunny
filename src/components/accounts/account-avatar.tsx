import { BrandMark } from "@/components/library/brand-mark";

export type AvatarSeed = "initials" | "bunny" | "violet" | "teal" | "gold";

export const VALID_AVATAR_SEEDS: AvatarSeed[] = ["initials", "bunny", "violet", "teal", "gold"];

export const AVATAR_SEED_LABELS: Record<AvatarSeed, string> = {
  initials: "الأحرف الأولى",
  bunny: "شعار بانيورا",
  violet: "بنفسجي هادئ",
  teal: "أزرق مخضر",
  gold: "ذهبي دافئ",
};

export function normalizeAvatarSeed(seed: unknown): AvatarSeed {
  if (typeof seed === "string" && (VALID_AVATAR_SEEDS as readonly string[]).includes(seed)) {
    return seed as AvatarSeed;
  }
  return "initials";
}

export function AccountAvatar({
  seed,
  name,
  className = "size-9",
  brandMarkSize = "size-5",
}: {
  seed?: string | null;
  name?: string | null;
  className?: string;
  brandMarkSize?: string;
}) {
  const safeSeed = normalizeAvatarSeed(seed);
  const initial = (name?.trim() || "؟").slice(0, 1);

  if (safeSeed === "bunny") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-primary/10 ${className}`}
        aria-hidden="true"
      >
        <BrandMark className={brandMarkSize} />
      </span>
    );
  }

  if (safeSeed === "violet") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-violet-500/40 bg-violet-600/25 text-violet-200 font-bold ${className}`}
        aria-hidden="true"
      >
        {initial}
      </span>
    );
  }

  if (safeSeed === "teal") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-teal-500/40 bg-teal-600/25 text-teal-200 font-bold ${className}`}
        aria-hidden="true"
      >
        {initial}
      </span>
    );
  }

  if (safeSeed === "gold") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-600/25 text-amber-200 font-bold ${className}`}
        aria-hidden="true"
      >
        {initial}
      </span>
    );
  }

  // Fallback: initials
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground font-semibold ${className}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
