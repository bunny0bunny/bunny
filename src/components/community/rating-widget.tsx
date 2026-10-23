"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Star } from "lucide-react";
import { setRating } from "@/lib/actions";

/**
 * Five-star rating control (Release B). Shows the aggregate score, lets the
 * signed-in reader cast/update their rating, and reports the fresh aggregate
 * returned by the Server Action.
 */
export function RatingWidget({
  slug,
  ratingAvg,
  ratingCount,
  userValue,
}: {
  slug: string;
  ratingAvg: number;
  ratingCount: number;
  userValue: number | null;
}) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState(0);
  const [mine, setMine] = useState(userValue);
  const [agg, setAgg] = useState({ avg: ratingAvg, count: ratingCount });

  const cast = (value: number) => {
    if (status !== "authenticated") {
      router.push(loginHref);
      return;
    }
    setError(null);
    const previous = mine;
    startTransition(async () => {
      setMine(value);
      try {
        const res = await setRating({ seriesSlug: slug, value });
        if (!res.ok || typeof res.ratingAvg !== "number" || typeof res.ratingCount !== "number") {
          setMine(previous);
          setError("تعذّر حفظ تقييمك. حاول مرة أخرى.");
          return;
        }
        setAgg({ avg: res.ratingAvg, count: res.ratingCount });
        router.refresh();
      } catch {
        setMine(previous);
        setError("تعذّر حفظ تقييمك. تحقق من اتصالك وحاول مرة أخرى.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">تقييمك يهمّنا</h3>
        <span className="flex items-center gap-1 text-xs text-gold">
          <Star className="size-3.5 fill-gold" aria-hidden />
          {agg.avg.toFixed(1)}
          <span className="font-normal text-muted-foreground">({agg.count})</span>
        </span>
      </div>
      {error && <p role="alert" className="text-xs leading-6 text-danger">{error}</p>}
      {status === "authenticated" ? (
        <div className="flex items-center gap-1" role="radiogroup" aria-label="اختر تقييمًا من ١ إلى ٥">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={v === mine}
              aria-label={`${v} من ٥`}
              disabled={pending}
              onMouseEnter={() => setHover(v)}
              onMouseLeave={() => setHover(0)}
              onClick={() => cast(v)}
              className="grid size-11 place-items-center rounded-md transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star
                className={`size-6 transition ${
                  v <= (hover || (mine ?? 0)) ? "fill-gold text-gold" : "text-muted-foreground/50"
                }`}
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs leading-6 text-muted-foreground">
          <Link href={loginHref} className="text-primary hover:underline">
            سجّل الدخول
          </Link>{" "}
          لتقييم هذا العمل ومشاركة رأيك مع القراء.
        </p>
      )}
    </div>
  );
}
