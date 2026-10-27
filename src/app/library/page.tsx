import { AdultBadge } from "@/components/library/adult-badge";
import { getWorkTitle } from '@/lib/work-title';
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BookMarked, BookOpen, CheckCheck, Clock, Play, Search } from "lucide-react";
import { SiteHeader, SiteFooter, BottomNav } from "@/components/library/chrome";
import { LibraryCardActions } from "@/components/library/library-card-actions";
import {
  requireProfile,
  getLibrary,
  getContinueReading,
  type ContinueReadingItem,
  type LibraryEntry,
} from "@/lib/queries";
import {
  CATEGORY_LABELS,
  SHELF_LABELS,
  type Shelf,
  type Category,
} from "@/lib/constants";
import { readerHref } from "@/lib/reader-route";
import { normalizeArabic, tokenizeArabic, scoreDocument } from "@/lib/arabic-search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "مكتبتي — مكتبة بانيورا" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const profile = await requireProfile();
  const { tab, q } = await searchParams;

  const activeTab =
    tab && ["all", "reading", "plan", "finished"].includes(tab) ? tab : "all";
  const searchQuery = (q ?? "").trim();

  // Call requireProfile and getLibrary once for ALL shelves, plus getContinueReading(profile.id, 100)
  const [allEntries, continueReadingItems] = await Promise.all([
    getLibrary(profile.id),
    getContinueReading(profile.id, 100),
  ]);

  // Compute shelf counts from all entries
  const counts = {
    all: allEntries.length,
    reading: allEntries.filter((e) => e.shelf === "reading").length,
    plan: allEntries.filter((e) => e.shelf === "plan").length,
    finished: allEntries.filter((e) => e.shelf === "finished").length,
  };

  const TABS = [
    { key: "all", label: "الكل", count: counts.all },
    { key: "reading", label: SHELF_LABELS.reading, count: counts.reading },
    { key: "plan", label: SHELF_LABELS.plan, count: counts.plan },
    { key: "finished", label: SHELF_LABELS.finished, count: counts.finished },
  ];

  // Distinct latest saved works with incomplete progress (max 3, deduplicated by series slug)
  const savedSlugs = new Set(allEntries
    .filter(e => activeTab !== "reading" || e.shelf === "reading")
    .map(e => e.series.slug));
  const savedResumeItems: ContinueReadingItem[] = [];
  const seenResumeSlugs = new Set<string>();

  for (const item of continueReadingItems) {
    if (savedSlugs.has(item.seriesSlug) && !seenResumeSlugs.has(item.seriesSlug)) {
      seenResumeSlugs.add(item.seriesSlug);
      savedResumeItems.push(item);
      if (savedResumeItems.length >= 3) break;
    }
  }

  // Progress map for valid latest per-work progress on individual cards
  const progressMap = new Map<string, ContinueReadingItem>();
  for (const item of continueReadingItems) {
    if (!progressMap.has(item.seriesSlug)) {
      progressMap.set(item.seriesSlug, item);
    }
  }

  // Filter entries by active shelf
  let filteredEntries: LibraryEntry[] =
    activeTab === "all"
      ? allEntries
      : allEntries.filter((e) => e.shelf === activeTab);

  // Filter entries by search query across Arabic title and English slug/author
  if (searchQuery) {
    const qTokens = tokenizeArabic(searchQuery);
    const normQ = normalizeArabic(searchQuery);

    filteredEntries = filteredEntries.filter((e) => {
      const normTitle = normalizeArabic(e.series.titleAr);
      const normOriginal = normalizeArabic(e.titleOriginal);
      const normSlug = normalizeArabic(e.series.slug.replace(/-/g, " "));
      if (normTitle.includes(normQ) || normOriginal.includes(normQ) || normSlug.includes(normQ)) return true;
      if (qTokens.length > 0) {
        return (
          scoreDocument(qTokens, [
            { text: e.series.titleAr, weight: 3 },
            { text: e.titleOriginal, weight: 3 },
            { text: e.series.slug.replace(/-/g, " "), weight: 2 },
            { text: e.series.author, weight: 1 },
          ]) > 0
        );
      }
      return false;
    });
  }

  const getTabHref = (tabKey: string) => {
    const params = new URLSearchParams();
    if (tabKey !== "all") params.set("tab", tabKey);
    if (searchQuery) params.set("q", searchQuery);
    const qs = params.toString();
    return qs ? `/library?${qs}` : "/library";
  };

  const showResumeRail =
    (activeTab === "all" || activeTab === "reading") && savedResumeItems.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1 pb-24 md:pb-12">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {/* Header & Crossnav */}
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                مكتبتي
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                أعمالك المحفوظة — يتزامن تقدمك تلقائيًا عبر أجهزتك عند تسجيل الدخول.
              </p>
            </div>
            <Link
              href="/updates"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/80 bg-card/60 px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              <Clock className="size-4 text-primary" aria-hidden />
              <span>آخر التحديثات</span>
            </Link>
          </header>

          {/* Compact Top Resume Rail (all/reading tabs only, max 3 distinct saved works) */}
          {showResumeRail && (
            <section
              aria-label="استئناف القراءة للأعمال المحفوظة"
              className="mb-8 rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5"
            >
              <div className="mb-3.5 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                  <Play className="size-4 fill-current text-primary" aria-hidden />
                  <span>تابع من حيث توقفت</span>
                </h2>
                <span className="text-xs text-muted-foreground">
                  {savedResumeItems.length === 1
                    ? "عمل واحد قيد المتابعة"
                    : savedResumeItems.length === 2
                    ? "عملان قيد المتابعة"
                    : `${savedResumeItems.length} أعمال قيد المتابعة`}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {savedResumeItems.map((item) => (
                  <div
                    key={item.seriesSlug}
                    className="flex items-stretch gap-3 overflow-hidden rounded-xl border border-border/70 bg-card p-3 shadow-xs transition hover:border-primary/40"
                  >
                    {/* Thumbnail without invented fallback cover */}
                    <Link
                      href={`/series/${item.seriesSlug}`}
                      className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-secondary/50"
                      aria-label={`انتقل إلى صفحة عمل ${item.seriesTitle}`}
                    >
                      {item.coverPath ? (
                        <Image
                          src={item.coverPath}
                          alt={`غلاف ${item.seriesTitle}`}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
                          <BookOpen className="size-5" aria-hidden />
                        </div>
                      )}
                    </Link>

                    {/* Meta & actions */}
                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                      <div>
                        <Link
                          href={`/series/${item.seriesSlug}`}
                          className="block truncate text-sm font-semibold text-foreground transition hover:text-primary"
                        >
                          {item.seriesTitle} {item.isAdult && <AdultBadge />}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          الفصل {item.chapterNumber}
                          {item.chapterTitle ? ` · ${item.chapterTitle}` : ""}
                        </p>
                      </div>

                      <div className="mt-2 space-y-2">
                        {/* Real percent progress bar */}
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-300"
                              style={{
                                width: `${Math.max(5, Math.min(100, item.percent))}%`,
                              }}
                            />
                          </div>
                          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                            {Math.round(item.percent)}٪
                          </span>
                        </div>

                        {/* Direct resume and work page links */}
                        <div className="flex items-center gap-2">
                          <Link
                            href={readerHref(
                              item.format,
                              item.seriesSlug,
                              item.chapterNumber
                            )}
                            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90"
                          >
                            <Play className="size-3.5 fill-current" aria-hidden />
                            <span>كمّل القراءة</span>
                          </Link>
                          <Link
                            href={`/series/${item.seriesSlug}`}
                            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-3 text-xs text-muted-foreground transition hover:text-foreground"
                            aria-label={`صفحة عمل ${item.seriesTitle}`}
                          >
                            العمل
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Search Form (preserves tab in URL) */}
          <form
            method="GET"
            action="/library"
            className="mb-6 flex flex-col gap-2 sm:flex-row"
            role="search"
          >
            {activeTab !== "all" && (
              <input type="hidden" name="tab" value={activeTab} />
            )}
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                name="q"
                defaultValue={searchQuery}
                placeholder="ابحث في مكتبتك بالاسم العربي أو الإنجليزي…"
                className="h-11 w-full rounded-xl border border-border/70 bg-card pe-3 ps-10 text-sm text-foreground placeholder:text-muted-foreground transition focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/60"
                aria-label="ابحث في مكتبتك"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                بحث
              </button>
              {searchQuery && (
                <Link
                  href={activeTab !== "all" ? `/library?tab=${activeTab}` : "/library"}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-secondary/40 px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                >
                  إلغاء البحث
                </Link>
              )}
            </div>
          </form>

          {/* Shelf Tabs (preserve q switching tabs) */}
          <nav aria-label="أرفف المكتبة" className="mb-6 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={getTabHref(t.key)}
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

          {/* Empty States or Cards Grid */}
          {allEntries.length === 0 ? (
            /* Wholly empty library */
            <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center">
              <BookMarked
                className="mx-auto size-10 text-muted-foreground/50"
                aria-hidden
              />
              <h2 className="mt-3 text-base font-semibold text-foreground">
                مكتبتك فارغة تمامًا
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                لم تحفظ أي أعمال بعد. تصفح المكتبة وأضف أعمالك المفضلة إلى رفوفك لتتابع
                قراءتك وتحديثاتك هنا.
              </p>
              <div className="mt-5">
                <Link
                  href="/explore"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  استكشف المكتبة
                </Link>
              </div>
            </div>
          ) : filteredEntries.length === 0 ? (
            /* Empty shelf or search with reset links */
            <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center">
              {searchQuery ? (
                <>
                  <Search
                    className="mx-auto size-10 text-muted-foreground/50"
                    aria-hidden
                  />
                  <h2 className="mt-3 text-base font-semibold text-foreground">
                    لا توجد نتائج مطابقة لـ «{searchQuery}»
                  </h2>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    لم نتمكن من العثور على أي عمل يطابق بحثك{" "}
                    {activeTab !== "all"
                      ? `في رف «${SHELF_LABELS[activeTab as Shelf]}»`
                      : "في مكتبتك"}
                    .
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <Link
                      href={
                        activeTab !== "all"
                          ? `/library?tab=${activeTab}`
                          : "/library"
                      }
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                    >
                      إعادة ضبط البحث
                    </Link>
                    <Link
                      href="/explore"
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      بحث في كامل الكتالوج
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <BookMarked
                    className="mx-auto size-10 text-muted-foreground/50"
                    aria-hidden
                  />
                  <h2 className="mt-3 text-base font-semibold text-foreground">
                    رف «{SHELF_LABELS[activeTab as Shelf]}» فارغ
                  </h2>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    لا توجد أعمال في هذا الرف حاليًا. يمكنك تغيير رف الأعمال المحفوظة أو
                    استكشاف أعمال جديدة.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <Link
                      href="/library"
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                    >
                      عرض جميع أعمال المكتبة ({allEntries.length})
                    </Link>
                    <Link
                      href="/explore"
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      استكشف المكتبة
                    </Link>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              {/* Actual Filtered Count & Active Search Info */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <p>
                  عرض {filteredEntries.length}{" "}
                  {filteredEntries.length === 1
                    ? "عمل"
                    : filteredEntries.length === 2
                    ? "عملان"
                    : filteredEntries.length <= 10
                    ? "أعمال"
                    : "عملاً"}
                  {searchQuery && (
                    <>
                      {" "}مطابقة للبحث «<span className="font-semibold text-foreground">{searchQuery}</span>»
                    </>
                  )}
                  {activeTab !== "all" && (
                    <>
                      {" "}في رف «<span className="font-semibold text-foreground">{SHELF_LABELS[activeTab as Shelf]}</span>»
                    </>
                  )}
                </p>
                {searchQuery && (
                  <Link
                    href={activeTab !== "all" ? `/library?tab=${activeTab}` : "/library"}
                    className="inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:underline"
                  >
                    إلغاء البحث
                  </Link>
                )}
              </div>

              {/* Editorial Saved-Work Cards Grid */}
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {filteredEntries.map((e) => {
                  const categoryLabel = e.series.category
                    ? (CATEGORY_LABELS[e.series.category as Category] ?? "غير مصنف")
                    : "غير مصنف";
                  const cardProgress = progressMap.get(e.series.slug);

                  return (
                    <li
                      key={e.series.id}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs transition hover:border-primary/40"
                    >
                      {/* Work cover link with BookOpen neutral blank fallback */}
                      <Link
                        href={`/series/${e.series.slug}`}
                        className="relative block aspect-[3/4] overflow-hidden bg-secondary/40"
                        aria-label={`انتقل إلى صفحة ${getWorkTitle(e.series)}`}
                      >
                        {e.series.coverPath ? (
                          <Image
                            src={e.series.coverPath}
                            alt={`غلاف ${getWorkTitle(e.series)}`}
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                            className="object-cover transition duration-300 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
                            <BookOpen className="size-10" aria-hidden />
                          </div>
                        )}
                        {/* Unread count labelled 'غير مقروء' not 'جديد' */}
                        {e.unreadCount > 0 && (
                          <span className="absolute end-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow-sm">
                            {e.unreadCount} غير مقروء
                          </span>
                        )}
                      </Link>

                      {/* Editorial card body */}
                      <div className="flex flex-1 flex-col justify-between p-3.5">
                        <div className="space-y-1.5">
                          {/* Category (actual category, not format) & shelf label */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="rounded bg-secondary/80 px-1.5 py-0.5 font-medium text-foreground/80">
                              {categoryLabel}
                            </span>
                            <span className="truncate">
                              {SHELF_LABELS[e.shelf as Shelf]}
                            </span>
                          </div>

                          {/* Work title */}
                          <Link
                            href={`/series/${e.series.slug}`}
                            className="flex min-h-11 items-center text-sm font-semibold text-foreground transition hover:text-primary"
                          >
                            {getWorkTitle(e.series)} {e.series.isAdult && <AdultBadge />}
                          </Link>

                          {/* Chapter count */}
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <CheckCheck className="size-3 text-muted-foreground/70" aria-hidden />
                            <span>{e.series.chapterCount} فصل متاح</span>
                          </p>
                        </div>

                        {/* Actions region: distinct resume link + existing LibraryCardActions */}
                        <div className="mt-3 space-y-2 border-t border-border/40 pt-2.5">
                          {cardProgress ? (
                            <Link
                              href={readerHref(
                                cardProgress.format,
                                e.series.slug,
                                cardProgress.chapterNumber
                              )}
                              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/25"
                              aria-label={`متابعة قراءة ${getWorkTitle(e.series)} من الفصل ${cardProgress.chapterNumber}`}
                            >
                              <Play className="size-3.5 fill-current" aria-hidden />
                              <span>
                                كمّل ف {cardProgress.chapterNumber} ({Math.round(cardProgress.percent)}٪)
                              </span>
                            </Link>
                          ) : (
                            <Link
                              href={`/series/${e.series.slug}`}
                              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-secondary/30 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary/60"
                              aria-label={`عرض تفاصيل ${getWorkTitle(e.series)}`}
                            >
                              <span>عرض العمل</span>
                            </Link>
                          )}
                          <LibraryCardActions
                            slug={e.series.slug}
                            shelf={e.shelf as Shelf}
                            title={getWorkTitle(e.series)}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
