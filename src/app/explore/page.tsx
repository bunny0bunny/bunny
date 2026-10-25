import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchX, RotateCcw } from "lucide-react";
import { SiteHeader, SiteFooter, BottomNav } from "@/components/library/chrome";
import { SeriesCardItem } from "@/components/library/series-card";
import {
  ExploreSearchInput,
  ExploreDesktopSidebar,
  ExploreMobileCategoryTabs,
  ExploreMobileFilterSheet,
  ExploreSortSelector,
  ExploreActiveChips,
} from "@/components/library/explore-filters";
import { getPublishedSeries, getSearchSuggestion, type ExploreFilters } from "@/lib/queries";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "استكشف المكتبة — مكتبة باني",
  description: "اكتشف آلاف الفصول والقصص المصورة والروايات العربية المنسقة بعناية.",
};

function EmptyState({
  filtered,
  suggestion,
  searchedTitle,
}: {
  filtered: boolean;
  suggestion?: string | null;
  searchedTitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-[#191C25]/60 px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent/60 text-muted-foreground">
        <SearchX className="size-6" aria-hidden />
      </span>

      <h2 className="mt-4 text-lg font-bold text-foreground">
        {filtered ? "لا توجد نتائج مطابقة" : "المكتبة فارغة حاليًا"}
      </h2>

      <p className="mt-1.5 max-w-sm text-xs sm:text-sm leading-relaxed text-muted-foreground">
        {filtered
          ? "جرّب تغيير كلمات البحث أو تخفيف المرشحات للوصول إلى المزيد من الأعمال."
          : "لم تُضف أعمال بعد. عد لاحقًا، الرفوف تُرتّب الآن."}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="min-h-11"><Link href={searchedTitle ? `/requests/new?title=${encodeURIComponent(searchedTitle)}` : "/requests/new"}>اطلب عملًا</Link></Button>
        {filtered && suggestion && (
          <Button asChild variant="outline" size="sm" className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20">
            <Link href={`/explore?q=${encodeURIComponent(suggestion)}`}>
              هل تقصد «{suggestion}»؟
            </Link>
          </Button>
        )}

        {filtered && (
          <Button asChild size="sm" variant="secondary" className="gap-1.5 text-xs">
            <Link href="/explore">
              <RotateCcw className="size-3.5" />
              <span>مسح كل المرشحات</span>
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const filters: ExploreFilters = {
    q: get("q"),
    category: get("category"),
    format: get("format"),
    genre: get("genre"),
    status: get("status"),
    sort: get("sort") ?? "popular",
  };

  const series = await getPublishedSeries(filters);
  const hasFilters = Boolean(
    filters.q || filters.category || filters.format || filters.genre || filters.status
  );
  const suggestion =
    filters.q && series.length === 0 ? await getSearchSuggestion(filters.q) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex-1 pb-20 md:pb-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {/* Header */}
          <header className="pt-6 sm:pt-8 pb-4">
            <Link href="/requests/new" className="float-end inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm text-primary hover:bg-accent">اطلب عملًا</Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">
              استكشف المكتبة
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              اكتشف قصصاً جديدة من المانجا والمانهوا والروايات والكوميك
            </p>
          </header>

          <Suspense fallback={<div className="h-20 animate-pulse rounded-xl bg-card/60" />}>
            {/* Layout Container */}
            <div className="flex flex-col lg:flex-row items-start gap-5">
              {/* Desktop Filters Sidebar */}
              <ExploreDesktopSidebar />

              {/* Main Content Area */}
              <div className="min-w-0 flex-1 w-full space-y-4">
                {/* Search Input */}
                <ExploreSearchInput />
                <ExploreMobileCategoryTabs />

                {/* Mobile Filter Controls Row (Sheet trigger + Sort + Result count) */}
                <div className="flex lg:hidden items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <ExploreMobileFilterSheet />
                    <ExploreSortSelector />
                  </div>
                  <span className="text-xs text-muted-foreground font-semibold">
                    {series.length} عملاً
                  </span>
                </div>

                {/* Desktop Action & Sort Bar */}
                <div className="hidden lg:flex items-center justify-between gap-3 pt-1 border-b border-border/50 pb-3">
                  <ExploreActiveChips resultCount={series.length} />
                  <ExploreSortSelector />
                </div>

                {/* Mobile Active Chips */}
                <div className="lg:hidden">
                  <ExploreActiveChips resultCount={series.length} />
                </div>

                {/* Results Grid or Empty State */}
                {series.length === 0 ? (
                  <EmptyState filtered={hasFilters} suggestion={suggestion} searchedTitle={filters.q} />
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4 pt-1">
                    {series.map((s, idx) => (
                      <SeriesCardItem
                        key={s.id}
                        series={s}
                        className="w-full"
                        priority={idx < 4}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Suspense>
        </div>
      </main>

      <SiteFooter />
      <BottomNav />
    </div>
  );
}
