import Image from "next/image";
import Link from "next/link";
import { Star, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CATEGORY_LABELS,
  type Category,
  FORMAT_LABELS,
  type Format,
  type SeriesStatus,
  STATUS_LABELS,
} from "@/lib/constants";
import type { SeriesCard as SeriesCardType } from "@/lib/queries";

/**
 * Returns user-facing label for category.
 * If null/undefined, returns "غير مصنف" (unclassified) per design spec.
 */
export function getCategoryLabel(category?: Category | null): string {
  if (category && CATEGORY_LABELS[category]) {
    return CATEGORY_LABELS[category];
  }
  return "غير مصنف";
}

export function SeriesCardItem({
  series,
  badge,
  reasonAr,
  className,
  priority = false,
}: {
  series: Pick<
    SeriesCardType,
    "slug" | "titleAr" | "coverPath" | "format" | "ratingAvg" | "genres" | "status" | "chapterCount"
  > & {
    category?: Category | null;
  };
  badge?: string;
  /** Release D "For You": explainable recommendation chip (FD-12) */
  reasonAr?: string;
  className?: string;
  priority?: boolean;
}) {
  const categoryLabel = getCategoryLabel(series.category);

  return (
    <Link
      href={`/series/${series.slug}`}
      className={`group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl ${
        className ?? "w-[150px] shrink-0 sm:w-[168px]"
      }`}
      aria-label={series.titleAr}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition duration-300 group-hover:-translate-y-1 group-hover:border-primary/50 group-hover:shadow-[0_12px_32px_-12px_rgba(180,151,239,0.35)]">
        <Image
          src={series.coverPath || "/art/covers/no-cover.svg"}
          alt={series.coverPath ? `غلاف ${series.titleAr}` : `الغلاف غير متاح — ${series.titleAr}`}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 180px"
          priority={priority}
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
        />

        {/* Top Badges */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
          {badge ? (
            <span className="rounded-md bg-background/85 px-2 py-0.5 text-[11px] font-semibold text-gold shadow-sm backdrop-blur">
              {badge}
            </span>
          ) : series.ratingAvg > 0 ? (
            <span className="flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-semibold text-gold shadow-sm backdrop-blur">
              <Star className="size-3 fill-gold text-gold" aria-hidden />
              {series.ratingAvg.toFixed(1)}
            </span>
          ) : (
            <span />
          )}

        </div>

        {/* Bottom Badges on Cover */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent p-2 pt-8">
          <div className="flex flex-wrap items-center gap-1">
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground backdrop-blur">
              {categoryLabel}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium backdrop-blur ${
                series.status === "completed"
                  ? "bg-success/20 text-success border border-success/30"
                  : series.status === "ongoing"
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-secondary text-muted-foreground"
              }`}
            >
              {STATUS_LABELS[series.status]}
            </span>
          </div>
        </div>
      </div>

      {/* Title & Metadata */}
      <div className="mt-2 space-y-1">
        <p className="line-clamp-2 text-sm font-bold text-foreground transition group-hover:text-primary">
          {series.titleAr}
        </p>

        {reasonAr ? (
          <p className="line-clamp-1 text-[11px] font-medium text-primary/90" title={reasonAr}>
            {reasonAr}
          </p>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <BookOpen className="size-3 shrink-0" aria-hidden />
            <span>{series.chapterCount} فصلاً</span>
            {series.genres.length > 0 && (
              <>
                <span>·</span>
                <span className="truncate">{series.genres.slice(0, 1).join(" ")}</span>
              </>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export function SeriesMetaBadges({
  format,
  status,
  category,
}: {
  format: Format;
  status: SeriesStatus;
  category?: Category | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {category && (
        <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/25 border">
          {getCategoryLabel(category)}
        </Badge>
      )}
      <Badge variant="secondary" className="border border-border bg-accent text-muted-foreground">
        {FORMAT_LABELS[format]}
      </Badge>
      <Badge variant="secondary" className="border border-border bg-accent text-muted-foreground">
        {STATUS_LABELS[status]}
      </Badge>
    </div>
  );
}

export function Rail({
  title,
  href,
  actionLabel = 'عرض الكل',
  children,
}: {
  title: string;
  href?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10" aria-label={title}>
      <div className="mb-3.5 flex items-center justify-between px-1">
        <h2 className="text-lg font-bold text-foreground sm:text-xl">{title}</h2>
        {href && (
          <Link href={href} className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground transition hover:text-primary">
            {actionLabel} ←
          </Link>
        )}
      </div>
      <div className="scrollbar-none -mx-4 flex gap-3.5 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6" role="list">
        {children}
      </div>
    </section>
  );
}
