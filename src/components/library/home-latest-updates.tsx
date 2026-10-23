import Image from "next/image";
import Link from "next/link";
import { Clock, LockKeyhole } from "lucide-react";
import type { Category, Format } from "@/lib/constants";
import { getCategoryLabel } from "@/components/library/series-card";
import { readerHref } from "@/lib/reader-route";

export type GroupedSeriesUpdate = {
  series: {
    slug: string;
    titleAr: string;
    coverPath: string;
    format: Format;
    category?: Category | null;
    accent?: string;
  };
  latestPublishedAt: Date;
  chapters: Array<{
    id: string;
    number: number;
    titleAr: string;
    publishedAt: Date;
    isPremiumDemo?: boolean;
  }>;
};

function timeAgoAr(date: Date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `منذ ${Math.max(mins, 1)} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  const months = Math.floor(days / 30);
  return `منذ ${months} شهر`;
}

export function HomeLatestUpdates({
  updates,
}: {
  updates: GroupedSeriesUpdate[];
}) {
  if (updates.length === 0) return null;

  return (
    <section className="mt-7 sm:mt-8" aria-label="آخر الفصول">
      <div className="mb-4 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Clock className="size-5 text-primary" aria-hidden />
          <h2 className="text-lg font-bold text-foreground sm:text-xl">آخر الفصول</h2>
        </div>
        <Link
          href="/updates"
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary transition hover:text-foreground"
        >
          عرض الكل ←
        </Link>
      </div>

      {/* Desktop 3-column grid / Mobile vertical list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {updates.map((item) => {
          const newest = item.chapters[0];
          const second = item.chapters[1];
          const isRecent =
            newest && Date.now() - new Date(newest.publishedAt).getTime() < 1000 * 60 * 60 * 24 * 3; // within 3 days

          return (
            <div
              key={item.series.slug}
              className="group relative flex min-w-0 items-stretch gap-3 overflow-hidden rounded-lg border border-border bg-card/50 transition hover:border-primary/50"
            >
              {/* Cover Thumbnail */}
              <Link
                href={`/series/${item.series.slug}`}
                className="relative w-[86px] shrink-0 overflow-hidden sm:w-[110px]"
                tabIndex={-1}
                aria-hidden
              >
                <Image
                  src={item.series.coverPath || "/art/covers/no-cover.svg"}
                  alt={`غلاف ${item.series.titleAr}`}
                  fill
                  sizes="110px"
                  className="object-cover object-[50%_25%] transition duration-300 group-hover:scale-105"
                />
              </Link>

              {/* Work & Chapters info */}
              <div className="min-w-0 flex-1 py-2 pe-3">
                {/* Title + More */}
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/series/${item.series.slug}`}
                    className="line-clamp-2 min-h-11 text-sm font-bold text-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    {item.series.titleAr}
                  </Link>

                </div>

                {/* Chapter links (up to 2 newest links) */}
                <ul className="flex flex-wrap items-center gap-x-2" aria-label={`فصول ${item.series.titleAr}`}>
                  {newest && (
                    <li>
                    <Link
                      href={readerHref(item.series.format, item.series.slug, newest.number)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-xs font-medium text-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    >
                      <span>الفصل {newest.number}</span>
                      {newest.isPremiumDemo && <><LockKeyhole className="size-3 text-gold" aria-hidden /><span className="sr-only">فصل مقفل</span></>}
                      <span className="sr-only"> — {newest.titleAr}، {item.series.titleAr}</span>
                      {isRecent && (
                        <span className="flex items-center gap-1 text-[10px] text-primary font-bold">
                          <span className="size-1.5 rounded-full bg-primary" />
                          جديد
                        </span>
                      )}
                    </Link>
                    </li>
                  )}

                  {second && (
                    <li>
                    <Link
                      href={readerHref(item.series.format, item.series.slug, second.number)}
                      className="inline-flex min-h-11 items-center rounded-md px-1 text-xs text-muted-foreground transition hover:text-primary"
                    >
                      الفصل {second.number}{second.isPremiumDemo && <><LockKeyhole className="size-3 text-gold" aria-hidden /><span className="sr-only">فصل مقفل</span></>}<span className="sr-only"> — {second.titleAr}، {item.series.titleAr}</span>
                    </Link>
                    </li>
                  )}
                </ul>

                {/* Meta bottom row */}
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-0.5">
                  <span className="rounded bg-black/40 px-1.5 py-0.2 text-[10px]">
                    {getCategoryLabel(item.series.category)}
                  </span>
                  <span>·</span>
                  <span>{timeAgoAr(item.latestPublishedAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
