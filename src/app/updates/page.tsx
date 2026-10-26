import { getWorkTitle } from '@/lib/work-title';
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BookMarked, BookOpen, Check, CheckCheck, Library, Lock, Play } from "lucide-react";
import { SiteHeader, SiteFooter, BottomNav } from "@/components/library/chrome";
import { requireProfile, getLibraryUpdatesFeed } from "@/lib/queries";
import { CATEGORY_LABELS } from "@/lib/constants";
import { readerHref } from "@/lib/reader-route";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "التحديثات — مكتبة بانيورا" };

const arabicDateFormatter = new Intl.DateTimeFormat("ar-EG", {
  calendar: "gregory",
  year: "numeric",
  month: "short",
  day: "numeric",
});

export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const profile = await requireProfile();
  const { tab } = await searchParams;

  const activeTab = tab === "unread" ? "unread" : "all";

  // getLibraryUpdatesFeed returns real published chapters of saved works (scope latest 40)
  const feed = await getLibraryUpdatesFeed(profile.id);

  const totalCount = feed.length;
  const unreadCount = feed.filter((f) => !f.read).length;

  const TABS = [
    { key: "all", label: "الكل", count: totalCount },
    { key: "unread", label: "غير مقروء", count: unreadCount },
  ];

  const displayedItems = activeTab === "unread" ? feed.filter((f) => !f.read) : feed;
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1 pb-24 md:pb-12">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          {/* Header & Compact Crossnav to Library */}
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                التحديثات
              </h1>
              {/* Scope description explicitly states latest 40 rather than pretending total library */}
              <p className="mt-1 text-sm text-muted-foreground">
                أحدث 40 فصلاً منشورًا من أعمال مكتبتك المحفوظة
                {unreadCount > 0 && (
                  <>
                    {" "}—{" "}
                    <span className="font-semibold text-primary">
                      {unreadCount} غير مقروء في هذه القائمة
                    </span>
                  </>
                )}
                .
              </p>
            </div>
            <Link
              href="/library"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/80 bg-card/60 px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              <Library className="size-4 text-primary" aria-hidden />
              <span>مكتبتي</span>
            </Link>
          </header>

          {/* Filter Tabs with 44px links */}
          <nav aria-label="تصنيفات التحديثات" className="mb-6 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/updates?tab=${t.key}`}
                aria-current={activeTab === t.key ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  activeTab === t.key
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border/70 bg-secondary/30 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    activeTab === t.key
                      ? "bg-primary font-bold text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {t.count}
                </span>
              </Link>
            ))}
          </nav>

          {/* Differentiated Empty States vs Richer Rows */}
          {feed.length === 0 ? (
            /* Empty feed: no saved series or no published updates */
            <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center">
              <BookMarked
                className="mx-auto size-10 text-muted-foreground/50"
                aria-hidden
              />
              <h2 className="mt-3 text-base font-semibold text-foreground">
                لا توجد تحديثات حالياً
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                أضف أعمالاً إلى مكتبتك من صفحة الاستكشاف لتتابع أحدث الفصول المنشورة هنا
                تلقائيًا فور صدورها.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/explore"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  استكشف المكتبة
                </Link>
                <Link
                  href="/library"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                >
                  الذهاب إلى مكتبتي
                </Link>
              </div>
            </div>
          ) : displayedItems.length === 0 ? (
            /* Empty unread state: reader has read all 40 recent updates */
            <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center">
              <CheckCheck
                className="mx-auto size-10 text-primary/80"
                aria-hidden
              />
              <h2 className="mt-3 text-base font-semibold text-foreground">
                قرأت جميع التحديثات!
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                لا توجد فصول غير مقروءة ضمن آخر 40 تحديثًا لمكتبتك.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/updates?tab=all"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  عرض كل التحديثات ({totalCount})
                </Link>
                <Link
                  href="/library"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                >
                  الذهاب إلى مكتبتي
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <ol className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xs">
                {displayedItems.map((f) => {
                  const pubDate =
                    f.publishedAt instanceof Date
                      ? f.publishedAt
                      : new Date(f.publishedAt);
                  const isValidDate = !isNaN(pubDate.getTime());
                  const isoTime = isValidDate ? pubDate.toISOString() : "";
                  const formattedDate = isValidDate
                    ? arabicDateFormatter.format(pubDate)
                    : "";

                  const pubTime = pubDate.getTime();
                  // 'جديد' ONLY if publishedAt within past 7 days and not future (not every unread)
                  const isWithinPast7Days =
                    isValidDate && pubTime <= now && now - pubTime <= sevenDaysMs;

                  return (
                    <li
                      key={f.chapterId}
                      className="flex flex-col gap-4 p-4 transition hover:bg-accent/20 sm:flex-row sm:items-center sm:justify-between"
                    >
                      {/* Portrait cover & meta content */}
                      <div className="flex min-w-0 flex-1 items-start gap-3.5">
                        {/* Richer portrait cover with neutral BookOpen fallback */}
                        <Link
                          href={`/series/${f.series.slug}`}
                          className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-secondary/40 shadow-xs sm:w-20"
                          aria-label={`انتقل إلى صفحة عمل ${getWorkTitle(f.series)}`}
                        >
                          {f.series.coverPath ? (
                            <Image
                              src={f.series.coverPath}
                              alt={`غلاف ${getWorkTitle(f.series)}`}
                              fill
                              sizes="80px"
                              className="object-cover transition duration-300 hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
                              <BookOpen className="size-6" aria-hidden />
                            </div>
                          )}
                        </Link>

                        {/* Series title / work link + chapter link + tags */}
                        <div className="min-w-0 flex-1">
                          {/* Badges bar */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="rounded bg-secondary/80 px-1.5 py-0.5 font-medium text-foreground/80">
                              {f.series.category ? CATEGORY_LABELS[f.series.category] : "غير مصنف"}
                            </span>

                            {/* Read/completed indicator 'تمت القراءة' vs 'غير مقروء' */}
                            {f.read ? (
                              <span className="inline-flex items-center gap-1 rounded bg-secondary/60 px-2 py-0.5 font-medium text-muted-foreground">
                                <Check className="size-3" aria-hidden />
                                <span>تمت القراءة</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-2 py-0.5 font-bold text-primary">
                                <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                                <span>غير مقروء</span>
                              </span>
                            )}

                            {/* 'جديد' ONLY if publishedAt within past 7 days and not future */}
                            {isWithinPast7Days && (
                              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                                جديد
                              </span>
                            )}

                            {/* Actual premium demo lock retained with label */}
                            {f.isPremiumDemo && (
                              <span className="inline-flex items-center gap-1 rounded bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">
                                <Lock className="size-3" aria-hidden />
                                <span>غير متاح حاليًا</span>
                              </span>
                            )}
                          </div>

                          {/* Work link */}
                          <div className="mt-1.5">
                            <Link
                              href={`/series/${f.series.slug}`}
                              className="flex min-h-11 items-center text-xs font-semibold text-muted-foreground transition hover:text-foreground"
                            >
                              {getWorkTitle(f.series)}
                            </Link>
                          </div>

                          {/* Separate chapter link via readerHref */}
                          <div className="mt-0.5">
                            <Link
                              href={readerHref(
                                f.series.format,
                                f.series.slug,
                                f.number
                              )}
                              className="flex min-h-11 items-center text-sm font-bold text-foreground transition hover:text-primary sm:text-base"
                            >
                              الفصل {f.number}
                              {f.titleAr ? `: ${f.titleAr}` : ""}
                            </Link>
                          </div>

                          {/* Safe Arabic Intl DateTimeFormat */}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {isValidDate ? (
                              <time dateTime={isoTime}>{formattedDate}</time>
                            ) : (
                              <span>حديثًا</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Direct reading action button (min-h-11, 44px control) */}
                      <div className="flex shrink-0 items-center">
                        <Link
                          href={readerHref(
                            f.series.format,
                            f.series.slug,
                            f.number
                          )}
                          className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold shadow-xs transition sm:w-auto ${
                            f.read
                              ? "border border-border/70 bg-secondary/30 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                              : "bg-primary text-primary-foreground hover:bg-primary/90"
                          }`}
                          aria-label={`قراءة الفصل ${f.number} من ${getWorkTitle(f.series)}`}
                        >
                          <Play className="size-3.5 fill-current" aria-hidden />
                          <span>{f.read ? "إعادة القراءة" : "اقرأ الفصل"}</span>
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {/* Scope footer note */}
              <p className="text-center text-xs text-muted-foreground">
                تقتصر هذه القائمة على أحدث 40 فصلاً منشوراً للأعمال المحفوظة في مكتبتك.
              </p>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
