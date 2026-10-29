"use client";

import Image from "next/image";
import { ChapterDownloadButton } from "@/components/downloads/chapter-download-button";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Lock,
  Search,
  ArrowUpDown,
  BookOpen,
  UserRound,
  Tag,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { readLocal } from "@/lib/progress-local";
import { useHydrated } from "@/lib/use-hydrated";
import { readerHref } from "@/lib/reader-route";
import type { Format } from "@/lib/constants";

export type ChapterItemView = {
  id: string;
  number: number;
  titleAr: string;
  isPremiumDemo: boolean;
  publishedAt: Date | string | null;
  scheduledFor?: Date | string | null;
  pageCount: number;
  novelWords: number;
};

type ProgressRecord = {
  pageIndex: number;
  percent: number;
  completed: boolean;
};

function formatTimeAgo(dateInput: Date | string | null): string {
  if (!dateInput) return "";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "اليوم";
  if (days < 30) return `قبل ${days} يوم`;
  const months = Math.floor(days / 30);
  if (days < 365) return `قبل ${months} شهر`;
  return `قبل ${Math.floor(months / 12)} سنة`;
}

function formatScheduledDate(dateInput: Date | string | null): string {
  if (!dateInput) return "قريبًا";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return date.toLocaleDateString("ar-EG", { day: "numeric", month: "long" });
}

export function WorkTabs({
  slug,
  downloadsEnabled = false,
  format,
  coverPath,
  publishedChapters,
  scheduledChapters,
  serverProgress,
  progressMapEntries,
  aboutData,
  children,
}: {
  slug: string;
  downloadsEnabled?: boolean;
  format: Format;
  coverPath: string;
  publishedChapters: ChapterItemView[];
  scheduledChapters: ChapterItemView[];
  serverProgress: { chapterNumber: number; pageIndex: number; percent: number } | null;
  progressMapEntries: [string, ProgressRecord][];
  aboutData: {
    titleAr: string;
    synopsisAr: string;
    author: string;
    translator: string | null;
    categoryLabel: string | null;
    formatLabel: string;
    statusLabel: string;
    genres: string[];
    tags: string[];
  };
  children?: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<"chapters" | "about" | "reviews">("chapters");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const mounted = useHydrated();

  // Determine current active resume chapter and map of chapter progress
  const progressMap = useMemo(() => {
    const map = new Map(progressMapEntries);
    if (mounted) {
      const local = readLocal(slug);
      const chapter = local && local.format === format
        ? publishedChapters.find(c => c.number === local.chapterNumber && !c.isPremiumDemo) : null;
      if (local && chapter && !map.has(chapter.id)) {
        map.set(chapter.id, { pageIndex: local.pageIndex, percent: local.percent, completed: local.percent >= 99 });
      }
    }
    return map;
  }, [progressMapEntries, mounted, slug, format, publishedChapters]);

  const activeProgress = useMemo(() => {
    let p = serverProgress;
    if (!p && mounted && typeof window !== "undefined") {
      const local = readLocal(slug);
      if (local && local.format === format && local.percent > 0 && local.percent < 100) {
        p = { chapterNumber: local.chapterNumber, pageIndex: local.pageIndex, percent: local.percent };
      }
    }
    return p && p.percent > 0 && p.percent < 100 &&
      publishedChapters.some(c => c.number === p.chapterNumber && !c.isPremiumDemo) ? p : null;
  }, [mounted, serverProgress, slug, publishedChapters, format]);

  // Filter and sort chapters
  const filteredChapters = useMemo(() => {
    let list = [...publishedChapters];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.number.toString().includes(q) ||
          c.titleAr.toLowerCase().includes(q) ||
          `فصل ${c.number}`.includes(q)
      );
    }

    list.sort((a, b) => (sortOrder === "desc" ? b.number - a.number : a.number - b.number));
    return list;
  }, [publishedChapters, searchQuery, sortOrder]);

  return (
    <div className="w-full">
      {/* Tabs Header */}
      <div className="border-b border-border/60" role="tablist" aria-label="أقسام صفحة العمل"
        onKeyDown={(event) => {
          const tabs = ["chapters", "about", "reviews"] as const;
          const index = tabs.indexOf(activeTab);
          const nextIndex = event.key === "ArrowLeft" ? (index + 1) % tabs.length
            : event.key === "ArrowRight" ? (index + tabs.length - 1) % tabs.length
            : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (nextIndex === null) return;
          event.preventDefault();
          setActiveTab(tabs[nextIndex]);
          document.getElementById(`tab-${tabs[nextIndex]}`)?.focus();
        }}>
        <div className="flex gap-4 sm:gap-6">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chapters"}
            aria-controls="panel-chapters"
            id="tab-chapters"
            tabIndex={activeTab === "chapters" ? 0 : -1}
            onClick={() => setActiveTab("chapters")}
            className={`relative flex min-h-11 items-center gap-2 rounded-t-md pb-3 pt-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-ring ${
              activeTab === "chapters"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>الفصول</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeTab === "chapters"
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {publishedChapters.length}
            </span>
            {activeTab === "chapters" && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "about"}
            aria-controls="panel-about"
            id="tab-about"
            tabIndex={activeTab === "about" ? 0 : -1}
            onClick={() => setActiveTab("about")}
            className={`relative flex min-h-11 items-center gap-2 rounded-t-md pb-3 pt-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-ring ${
              activeTab === "about"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>عن العمل</span>
            {activeTab === "about" && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "reviews"}
            aria-controls="panel-reviews"
            id="tab-reviews"
            tabIndex={activeTab === "reviews" ? 0 : -1}
            onClick={() => setActiveTab("reviews")}
            className={`relative flex min-h-11 items-center gap-2 rounded-t-md pb-3 pt-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-ring ${
              activeTab === "reviews"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>التقييمات والمجتمع</span>
            {activeTab === "reviews" && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
            )}
          </button>
        </div>
      </div>

      {/* Chapters Panel */}
      {activeTab === "chapters" && (
        <div id="panel-chapters" role="tabpanel" aria-labelledby="tab-chapters" className="pt-6">
          {/* Quick Resume Highlight Bar */}
          {activeProgress && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-bold text-primary">
                  <BookOpen className="size-4" aria-hidden />
                  <span>آخر قراءة: الفصل {activeProgress.chapterNumber}</span>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {Math.round(activeProgress.percent)}٪
                  </span>
                </div>
                <div className="mt-2.5 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-border/60">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(2, activeProgress.percent))}%` }}
                  />
                </div>
              </div>
              <Button
                asChild
                size="sm"
                className="h-11 shrink-0 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"
              >
                <Link href={readerHref(format, slug, activeProgress.chapterNumber)}>
                  متابعة القراءة
                </Link>
              </Button>
            </div>
          )}

          {/* Search & Sort Controls */}
          <div className="mb-4 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                aria-label="البحث في الفصول"
                placeholder="ابحث عن فصل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 rounded-xl border-border/60 bg-secondary/30 ps-9 text-xs focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSortOrder((v) => (v === "desc" ? "asc" : "desc"))}
              className="h-11 shrink-0 gap-1.5 rounded-xl border-border/60 bg-card px-3 text-xs font-medium hover:bg-accent/40"
              title="تغيير اتجاه ترتيب الفصول"
              aria-label={`الترتيب الحالي: ${sortOrder === "desc" ? "الأحدث أولاً" : "الأقدم أولاً"}`}
            >
              <ArrowUpDown className="size-3.5 text-muted-foreground" />
              <span>{sortOrder === "desc" ? "الأحدث أولاً" : "الأقدم أولاً"}</span>
            </Button>
          </div>

          {/* Chapter List */}
          <ol className="space-y-2" aria-label="قائمة الفصول">
            {filteredChapters.map((c) => {
              const locked = c.isPremiumDemo;
              const p = progressMap.get(c.id);
              const isCurrentResume = activeProgress?.chapterNumber === c.number;
              const isRead = p?.completed || (p?.percent ?? 0) >= 99;
              const inProg = !isRead && p && p.percent > 0;
              const age = c.publishedAt ? Date.now() - new Date(c.publishedAt).getTime() : null;
              const isNew = !isRead && !inProg && age !== null && age >= 0 && age < 14 * 86400000;

              return (
                <li key={c.id} className="flex items-center gap-2">
                  <Link
                    href={readerHref(format, slug, c.number)}
                    className={"group flex min-w-0 flex-1 items-center gap-3 rounded-xl border p-3 transition hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring sm:gap-4 " + (isCurrentResume ? "border-primary/40 bg-primary/10" : "border-border/70 bg-card/50 hover:bg-card")}
                  >
                    {/* Chapter thumbnail / badge */}
                    <div className="relative h-16 w-[72px] shrink-0 overflow-hidden rounded-lg border border-border/70 bg-secondary/40 sm:h-[72px] sm:w-[88px]">
                      {coverPath.trim() ? <Image
                        src={coverPath}
                        alt=""
                        fill
                        sizes="88px"
                        className="object-cover opacity-80 transition duration-300 group-hover:scale-105"
                      /> : <BookOpen className="absolute start-2 top-2 size-4 text-muted-foreground/50" aria-hidden />}
                      <div className="absolute inset-0 bg-background/30" />
                      <span className="absolute inset-0 grid place-items-center text-xs font-bold text-foreground drop-shadow">
                        {locked ? <Lock className="size-4 text-gold" /> : c.number}
                      </span>
                    </div>

                    {/* Chapter details */}
                    <div className="grid min-w-0 flex-1 items-center gap-x-5 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">
                          الفصل {c.number}
                        </span>

                        {/* Explicit distinct status labels */}
                        {locked && (
                          <span className="shrink-0 rounded-md border border-gold/30 bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold">
                            فصل غير متاح حاليًا
                          </span>
                        )}
                        {isCurrentResume && (
                          <span className="flex shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            <span className="size-1.5 rounded-full bg-primary" />
                            آخر موضع
                          </span>
                        )}
                        {isRead && !isCurrentResume && (
                          <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-400">
                            <CheckCircle2 className="size-3.5" aria-hidden />
                            تمت القراءة
                          </span>
                        )}
                        {inProg && !isCurrentResume && (
                          <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-primary">
                            <CircleDashed className="size-3.5" aria-hidden />
                            قرأت {Math.round(p!.percent)}٪
                          </span>
                        )}
                        {!locked && !isRead && !inProg && !isCurrentResume && isNew && (
                          <span className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            <span className="size-1.5 rounded-full bg-primary" />
                            جديد
                          </span>
                        )}
                        {!locked && !isRead && !inProg && !isCurrentResume && !isNew && (
                          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/80">
                            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                            غير مقروء
                          </span>
                        )}
                      </div>

                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{c.titleAr}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                        <span>
                          {format === "novel"
                            ? `${c.novelWords} كلمة تقريبًا`
                            : `${c.pageCount} ${format === "manga" ? "صفحة" : "لوحة"}`}
                        </span>
                        {c.publishedAt && <span>· {formatTimeAgo(c.publishedAt)}</span>}
                      </div>
                      {isCurrentResume && activeProgress && <div className="mt-2 h-1 overflow-hidden rounded-full bg-border sm:col-span-2" role="progressbar" aria-label="تقدم قراءة الفصل" aria-valuenow={Math.round(activeProgress.percent)} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-primary" style={{ width: activeProgress.percent + "%" }} />
                      </div>}
                    </div>
                  </Link>
                  {downloadsEnabled && format !== "novel" && !locked && <ChapterDownloadButton chapterId={c.id} />}
                </li>
              );
            })}
          </ol>

          {publishedChapters.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
              لا فصول منشورة بعد — العمل قيد التحضير.
            </p>
          )}

          {publishedChapters.length > 0 && filteredChapters.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
              لا توجد فصول تطابق استعلام البحث «{searchQuery}».
            </p>
          )}

          {/* Scheduled chapters section */}
          {scheduledChapters.length > 0 && (
            <section aria-label="فصول مجدولة" className="mt-6">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
                <CalendarClock className="size-4" aria-hidden />
                <span>فصول مجدولة</span>
              </h3>
              <ol className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-dashed border-border/60 bg-card/40">
                {scheduledChapters.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 px-4 py-3.5 opacity-80 sm:px-5"
                    aria-label="ينشر قريبًا"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-gold/40 bg-gold/10 text-sm font-bold text-gold" aria-hidden>
                      <Lock className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground/80">
                        الفصل {c.number}: {c.titleAr}
                      </span>
                      <span className="text-[11px] text-gold">
                        ينشر {formatScheduledDate(c.scheduledFor ?? null)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}

      {/* About Panel */}
      {activeTab === "about" && (
        <div id="panel-about" role="tabpanel" aria-labelledby="tab-about" className="space-y-6 pt-6">
          <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
            <h3 className="text-base font-bold text-foreground">قصة العمل</h3>
            <p className="mt-3 text-sm leading-8 text-foreground/90 text-balance-ar">
              {aboutData.synopsisAr}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <UserRound className="size-4 text-primary" aria-hidden />
                <span>طاقم العمل</span>
              </h4>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <dt className="text-muted-foreground">المؤلف</dt>
                  <dd className="font-semibold text-foreground">{aboutData.author}</dd>
                </div>
                {aboutData.translator && (
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <dt className="text-muted-foreground">الترجمة</dt>
                    <dd className="font-semibold text-foreground">{aboutData.translator}</dd>
                  </div>
                )}
                <div className="flex justify-between pb-1">
                  <dt className="text-muted-foreground">حالة العمل</dt>
                  <dd className="font-semibold text-foreground">{aboutData.statusLabel}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Tag className="size-4 text-primary" aria-hidden />
                <span>التصنيفات والنوع</span>
              </h4>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {aboutData.categoryLabel && (
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {aboutData.categoryLabel}
                  </span>
                )}
                {aboutData.genres.map((g) => (
                  <Link
                    key={g}
                    href={`/explore?genre=${encodeURIComponent(g)}`}
                    className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                  >
                    {g}
                  </Link>
                ))}
              </div>
              {aboutData.tags.length > 0 && (
                <div className="mt-4 border-t border-border/40 pt-3 text-xs text-muted-foreground">
                  <span className="font-medium">الوسوم: </span>
                  <span>{aboutData.tags.join(" · ")}</span>
                </div>
              )}
            </div>
          </div>


        </div>
      )}

      {/* Reviews Panel */}
      {activeTab === "reviews" && (
        <div id="panel-reviews" role="tabpanel" aria-labelledby="tab-reviews" className="space-y-6 pt-6">
          {children}
        </div>
      )}
    </div>
  );
}
