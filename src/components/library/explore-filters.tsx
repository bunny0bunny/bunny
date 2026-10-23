"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  X,
  SlidersHorizontal,
  RotateCcw,
  Check,
  ArrowUpDown,
  BookOpen,
  Layers,
  BookText,
  Palette,
  Compass,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  GENRES,
  SERIES_STATUSES,
  STATUS_LABELS,
  FORMAT_LABELS,
  isFormat,
  type Category,
  type SeriesStatus,
} from "@/lib/constants";

const CATEGORY_ICONS = { manga: BookOpen, manhwa: Layers, novel: BookText, comic: Palette };

const SORT_LABELS: Record<string, string> = {
  popular: "الأكثر قراءة",
  newest: "آخر الفصول",
  rating: "الأعلى تقييمًا",
};

/**
 * Hook to read and update explore search params smoothly
 */
function useExploreFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const updateParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === "all") {
        next.delete(k);
      } else {
        next.set(k, v);
      }
    }
    startTransition(() => {
      router.push(`/explore?${next.toString()}`, { scroll: false });
    });
  };

  const clearAll = () => {
    startTransition(() => {
      router.push("/explore", { scroll: false });
    });
  };

  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category");
  const format = searchParams.get("format");
  const genre = searchParams.get("genre");
  const status = searchParams.get("status");
  const sort = searchParams.get("sort") ?? "popular";

  const activeFilterCount = [category, format, genre, status].filter(Boolean).length;
  const hasAnyFilter = Boolean(q || category || format || genre || status || (sort && sort !== "popular"));

  return {
    q,
    category,
    format,
    genre,
    status,
    sort,
    activeFilterCount,
    hasAnyFilter,
    updateParam,
    clearAll,
  };
}

/**
 * Prominent Search Input (matches explore-concept.png)
 */
export function ExploreSearchInput() {
  const { q, updateParam } = useExploreFilters();
  return <ExploreSearchField key={q} q={q} updateParam={updateParam} />;
}

function ExploreSearchField({ q, updateParam }: { q: string; updateParam: (patch: Record<string, string | null>) => void }) {
  const [value, setValue] = useState(q);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParam({ q: value.trim() || null });
  };

  return (
    <form onSubmit={handleSubmit} role="search" className="w-full">
      <div className="relative">
        <Search
          className="absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
          aria-hidden
        />
        <Input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ابحث بعنوان العمل أو المؤلف…"
          className="h-11 sm:h-12 w-full rounded-xl border-border/70 bg-[#191C25] pe-10 ps-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-primary shadow-sm"
          aria-label="البحث في المكتبة"
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              updateParam({ q: null });
            }}
            className="absolute end-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="مسح نص البحث"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Desktop Sidebar Filters (matches explore-concept.png right panel)
 */
export function ExploreDesktopSidebar() {
  const { category, genre, status, updateParam, clearAll, hasAnyFilter } = useExploreFilters();

  return (
    <aside
      className="hidden lg:block w-60 shrink-0 space-y-5 rounded-2xl border border-border/70 bg-card/40 p-4"
      aria-label="مرشحات الاستكشاف"
    >
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <SlidersHorizontal className="size-4 text-primary" aria-hidden />
          <span>المرشحات</span>
        </div>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="min-h-11 text-xs text-muted-foreground hover:text-primary transition flex items-center gap-1"
          >
            <RotateCcw className="size-3" />
            <span>مسح</span>
          </button>
        )}
      </div>

      {/* 1. Category */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-muted-foreground ">
          تصنيف العمل
        </h3>
        <div className="space-y-1">
          <button
            type="button"
            aria-pressed={!category}
            onClick={() => updateParam({ category: null })}
            className={`min-h-11 w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
              !category
                ? "bg-primary/20 text-primary border border-primary/40 font-bold"
                : "text-foreground hover:bg-accent/60"
            }`}
          >
            <span>الكل</span>
            {!category && <Check className="size-3.5" />}
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => updateParam({ category: category === c ? null : c })}
              className={`min-h-11 w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                category === c
                  ? "bg-primary/20 text-primary border border-primary/40 font-bold"
                  : "text-foreground hover:bg-accent/60"
              }`}
            >
              <span>{CATEGORY_LABELS[c]}</span>
              {category === c && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Genre */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-muted-foreground ">
          النوع القصصي
        </h3>
        <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-elegant pe-1">
          <button
            type="button"
            aria-pressed={!genre}
            onClick={() => updateParam({ genre: null })}
            className={`min-h-11 w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              !genre
                ? "bg-primary/20 text-primary border border-primary/40 font-bold"
                : "text-foreground hover:bg-accent/60"
            }`}
          >
            <span>كل الأنواع</span>
            {!genre && <Check className="size-3.5" />}
          </button>
          {GENRES.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={genre === g}
                  onClick={() => updateParam({ genre: genre === g ? null : g })}
              className={`min-h-11 w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                genre === g
                  ? "bg-primary/20 text-primary border border-primary/40 font-bold"
                  : "text-foreground hover:bg-accent/60"
              }`}
            >
              <span>{g}</span>
              {genre === g && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Status */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-muted-foreground ">
          حالة العمل
        </h3>
        <div className="space-y-1">
          <button
            type="button"
            aria-pressed={!status}
            onClick={() => updateParam({ status: null })}
            className={`min-h-11 w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
              !status
                ? "bg-primary/20 text-primary border border-primary/40 font-bold"
                : "text-foreground hover:bg-accent/60"
            }`}
          >
            <span>الكل</span>
            {!status && <Check className="size-3.5" />}
          </button>
          {SERIES_STATUSES.map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={status === st}
                  onClick={() => updateParam({ status: status === st ? null : st })}
              className={`min-h-11 w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                status === st
                  ? "bg-primary/20 text-primary border border-primary/40 font-bold"
                  : "text-foreground hover:bg-accent/60"
              }`}
            >
              <span>{STATUS_LABELS[st]}</span>
              {status === st && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
      </div>

      {/* Reset button at bottom of sidebar */}
      {hasAnyFilter && (
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          className="w-full gap-2 border-border/80 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          <span>مسح المرشحات</span>
        </Button>
      )}
    </aside>
  );
}

/**
 * Mobile Category Pills (quick one-tap classification switch)
 */
export function ExploreMobileCategoryTabs() {
  const { category, updateParam } = useExploreFilters();

  return (
    <div className="grid grid-cols-5 gap-2 lg:hidden" role="group" aria-label="تصنيفات الأعمال">
      <button
        type="button"
        aria-pressed={!category}
        onClick={() => updateParam({ category: null })}
        className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-xs font-bold transition ${
          !category
            ? "bg-primary text-primary-foreground shadow-sm"
            : "border border-border/70 bg-[#191C25] text-foreground hover:bg-accent/70"
        }`}
      >
        <Compass className="size-4" aria-hidden />
        الكل
      </button>
      {CATEGORIES.map((c) => {
        const active = category === c;
        const Icon = CATEGORY_ICONS[c];
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => updateParam({ category: active ? null : c })}
            className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-xs font-bold transition ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border/70 bg-[#191C25] text-foreground hover:bg-accent/70"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {CATEGORY_LABELS[c]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Mobile Filter Sheet (accessible drawer with explicit close and focus management)
 */
export function ExploreMobileFilterSheet() {
  const {
    category,
    genre,
    status,
    activeFilterCount,
    updateParam,
    clearAll,
  } = useExploreFilters();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`lg:hidden h-11 gap-2 rounded-lg border-primary/50 bg-primary/15 text-xs font-bold ${
            activeFilterCount > 0 ? "border-primary/60 text-primary" : "text-foreground"
          }`}
          aria-label={`فتح المرشحات (${activeFilterCount} نشط)`}
        >
          <SlidersHorizontal className="size-3.5 text-primary" aria-hidden />
          <span>المرشحات</span>
          {activeFilterCount > 0 && (
            <span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[300px] sm:w-[360px] bg-[#191C25] border-border/70 p-6 overflow-y-auto">
        <SheetHeader className="p-0 pb-4 border-b border-border/60">
          <SheetTitle className="text-base font-bold text-foreground flex items-center justify-between">
            <span>مرشحات البحث</span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Category */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-muted-foreground ">تصنيف العمل</h4>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                aria-pressed={!category}
                onClick={() => updateParam({ category: null })}
                className={`min-h-11 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  !category ? "bg-primary text-primary-foreground font-bold" : "bg-card text-foreground border border-border/60"
                }`}
              >
                الكل
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
              onClick={() => updateParam({ category: category === c ? null : c })}
                  className={`min-h-11 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    category === c
                      ? "bg-primary text-primary-foreground font-bold"
                      : "bg-card text-foreground border border-border/60"
                  }`}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Genre */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-muted-foreground ">النوع القصصي</h4>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={!genre}
            onClick={() => updateParam({ genre: null })}
                className={`min-h-11 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  !genre ? "bg-primary text-primary-foreground font-bold" : "bg-card text-foreground border border-border/60"
                }`}
              >
                الكل
              </button>
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={genre === g}
                  onClick={() => updateParam({ genre: genre === g ? null : g })}
                  className={`min-h-11 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    genre === g
                      ? "bg-primary text-primary-foreground font-bold"
                      : "bg-card text-foreground border border-border/60"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-muted-foreground ">حالة العمل</h4>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                aria-pressed={!status}
            onClick={() => updateParam({ status: null })}
                className={`min-h-11 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  !status ? "bg-primary text-primary-foreground font-bold" : "bg-card text-foreground border border-border/60"
                }`}
              >
                الكل
              </button>
              {SERIES_STATUSES.map((st) => (
                <button
                  key={st}
                  type="button"
                  aria-pressed={status === st}
                  onClick={() => updateParam({ status: status === st ? null : st })}
                  className={`min-h-11 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    status === st
                      ? "bg-primary text-primary-foreground font-bold"
                      : "bg-card text-foreground border border-border/60"
                  }`}
                >
                  {STATUS_LABELS[st]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 pt-4 border-t border-border/60">
          <SheetClose asChild>
            <Button className="h-11 flex-1 bg-primary text-primary-foreground font-bold text-xs">
              عرض النتائج
            </Button>
          </SheetClose>
          <Button
            variant="outline"
            size="sm"
            onClick={clearAll}
            className="h-11 text-xs border-border/70 text-muted-foreground"
          >
            مسح المرشحات
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Sort Dropdown Selector
 */
export function ExploreSortSelector() {
  const { sort, updateParam } = useExploreFilters();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-11 gap-2 rounded-lg border-border/70 bg-card text-xs font-semibold text-foreground hover:border-primary/50"
          aria-label="خيارات الترتيب"
        >
          <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden />
          <span>{SORT_LABELS[sort] || "الترتيب"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 bg-[#191C25] border-border/70">
        <DropdownMenuItem
          onClick={() => updateParam({ sort: "popular" })}
          className={`min-h-11 cursor-pointer text-xs ${sort === "popular" ? "text-primary font-bold" : ""}`}
        >
          {SORT_LABELS.popular}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => updateParam({ sort: "newest" })}
          className={`min-h-11 cursor-pointer text-xs ${sort === "newest" ? "text-primary font-bold" : ""}`}
        >
          {SORT_LABELS.newest}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => updateParam({ sort: "rating" })}
          className={`min-h-11 cursor-pointer text-xs ${sort === "rating" ? "text-primary font-bold" : ""}`}
        >
          {SORT_LABELS.rating}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Removable Active Filter Chips & Clear All
 */
export function ExploreActiveChips({ resultCount }: { resultCount: number }) {
  const { q, category, format, genre, status, updateParam, clearAll, hasAnyFilter } = useExploreFilters();

  if (!hasAnyFilter) {
    return (
      <div className="hidden lg:flex items-center justify-between text-xs text-muted-foreground py-1">
        <span>{resultCount} عملاً</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-1 text-xs">
      <span className="hidden lg:inline font-semibold text-muted-foreground">{resultCount} عملاً</span>
      {format && isFormat(format) && <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-accent px-2.5 py-1">
        {FORMAT_LABELS[format]}
        <button type="button" onClick={() => updateParam({ format: null })} className="flex size-11 items-center justify-center" aria-label="إزالة مرشح طريقة القراءة"><X className="size-3" /></button>
      </span>}

      {q && (
        <span className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border/80 bg-accent/60 px-2.5 py-1 text-foreground">
          <span className="min-w-0 break-all">«{q}»</span>
          <button
            type="button"
            onClick={() => updateParam({ q: null })}
            className="flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="إزالة نص البحث"
          >
            <X className="size-3" />
          </button>
        </span>
      )}

      {category && (
        <span className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-2.5 py-1 text-primary font-medium">
          <span>{CATEGORY_LABELS[category as Category] || category}</span>
          <button
            type="button"
            onClick={() => updateParam({ category: null })}
            className="flex size-11 shrink-0 items-center justify-center hover:text-foreground"
            aria-label="إزالة مرشح التصنيف"
          >
            <X className="size-3" />
          </button>
        </span>
      )}

      {genre && (
        <span className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/15 px-2.5 py-1 text-primary font-medium">
          <span>{genre}</span>
          <button
            type="button"
            onClick={() => updateParam({ genre: null })}
            className="flex size-11 shrink-0 items-center justify-center hover:text-foreground"
            aria-label="إزالة مرشح النوع"
          >
            <X className="size-3" />
          </button>
        </span>
      )}

      {status && (
        <span className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-accent/60 px-2.5 py-1 text-foreground font-medium">
          <span>{STATUS_LABELS[status as SeriesStatus] || status}</span>
          <button
            type="button"
            onClick={() => updateParam({ status: null })}
            className="flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="إزالة مرشح الحالة"
          >
            <X className="size-3" />
          </button>
        </span>
      )}

      <button
        type="button"
        onClick={clearAll}
        className="min-h-11 text-[11px] font-semibold text-primary/90 underline-offset-4 hover:underline ms-1"
      >
        مسح المرشحات
      </button>
    </div>
  );
}
