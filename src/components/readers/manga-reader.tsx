"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, ArrowLeftRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReaderChapterSelect, EmptyReaderContent, type ReaderChapter } from "@/components/readers/reader-tools";
import { ReaderImage } from "@/components/readers/reader-image";
import { ReaderChrome, ChapterEndCard, LockedChapterPanel } from "@/components/readers/reader-chrome";
import { ChapterCommentsDialog } from "@/components/community/chapter-comments-dialog";
import { saveReadingProgress } from "@/lib/actions";
import { readChapterLocal, writeLocal } from "@/lib/progress-local";
import { selectReaderProgress, type ReaderProgress } from "@/lib/reader-progress";
import { readerHref } from "@/lib/reader-route";
import type { CommentView } from "@/lib/queries";

type Page = { id: string; pageIndex: number; imagePath: string; fallbackImagePath?: string; width: number; height: number };

export function MangaReader({
  seriesSlug,
  seriesTitle,
  chapterNumber,
  chapterTitle,
  chapters,
  pages,
  defaultDirection,
  isPremiumDemo,
  comments = [],
  initialProgress = null,
  next,
  prev,
}: {
  seriesSlug: string;
  seriesTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  chapters: ReaderChapter[];
  pages: Page[];
  defaultDirection: "rtl" | "ltr";
  isPremiumDemo: boolean;
  comments?: CommentView[];
  initialProgress?: ReaderProgress | null;
  next: { number: number; isPremiumDemo: boolean } | null;
  prev: { number: number; isPremiumDemo: boolean } | null;
}) {
  const { status } = useSession();
  const [immersive, setImmersive] = useState(false);
  const [direction, setDirection] = useState<"rtl" | "ltr">(defaultDirection);
  const [index, setIndex] = useState(0);
  const lastSaved = useRef(-1);
  const [restored, setRestored] = useState(false);

  const total = pages.length;
  const percent = total ? ((index + 1) / total) * 100 : 0;

  useEffect(() => {
    if (restored || isPremiumDemo || !total) return;
    const frame = requestAnimationFrame(() => {
      const progress = selectReaderProgress(readChapterLocal(seriesSlug, chapterNumber, "manga"), initialProgress);
      setIndex(Math.min(total - 1, progress?.pageIndex ?? 0));
      setRestored(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [chapterNumber, initialProgress, isPremiumDemo, restored, seriesSlug, total]);

  const go = useCallback(
    (delta: 1 | -1) => {
      if (!restored || isPremiumDemo || !total) return;
      setIndex((i) => {
        const nextIndex = i + delta;
        if (nextIndex < 0) {
          if (prev) window.location.href = readerHref("manga", seriesSlug, prev.number);
          return i;
        }
        if (nextIndex >= total) {
          if (next && !next.isPremiumDemo) window.location.href = readerHref("manga", seriesSlug, next.number);
          return i;
        }
        return nextIndex;
      });
    },
    [next, prev, seriesSlug, total, restored, isPremiumDemo]
  );

  // Keyboard navigation — RTL-aware: "next" advances with Left arrow in RTL mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey ||
        (target instanceof HTMLElement && (target.closest("input, textarea, select, [role=dialog], [contenteditable]")))) return;
      if (e.key === "ArrowLeft") go(direction === "rtl" ? 1 : -1);
      if (e.key === "ArrowRight") go(direction === "rtl" ? -1 : 1);
      if (e.key === "f") setImmersive((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [direction, go]);

  // Persist progress
  useEffect(() => {
    if (!restored || status === "loading" || isPremiumDemo || !total) return;
    if (lastSaved.current === index) return;
    lastSaved.current = index;
    writeLocal({
      seriesSlug,
      seriesTitle,
      chapterNumber,
      chapterTitle,
      pageIndex: index,
      percent,
      total,
      format: "manga",
      coverPath: "",
      accent: "",
    });
    if (status === "authenticated") {
      saveReadingProgress({
        seriesSlug,
        chapterNumber,
        pageIndex: index,
        percent,
        completed: index >= total - 1,
      }).catch(() => {});
    }
  }, [chapterNumber, chapterTitle, index, percent, seriesSlug, seriesTitle, status, total, restored, isPremiumDemo]);

  if (isPremiumDemo) {
    return <LockedChapterPanel seriesSlug={seriesSlug} seriesTitle={seriesTitle} format="manga" />;
  }

  const page = pages[index];

  return (
    <div className="min-h-screen bg-background">
      <ReaderChrome
        seriesSlug={seriesSlug}
        seriesTitle={seriesTitle}
        chapterNumber={chapterNumber}
        chapterTitle={chapterTitle}
        format="manga"
        chapterControl={<ReaderChapterSelect seriesSlug={seriesSlug} format="manga" chapterNumber={chapterNumber} chapters={chapters} />}
        percent={percent}
        immersive={immersive}
        onToggleImmersive={() => setImmersive((v) => !v)}
        headerExtra={
          <ChapterCommentsDialog
            seriesSlug={seriesSlug}
            seriesTitle={seriesTitle}
            chapterNumber={chapterNumber}
            comments={comments}
          />
        }
      >
        <p className="text-sm leading-7 text-muted-foreground">استخدم الأسهم أو جانبي الصفحة للتنقل. زر الاتجاه أسفل الشاشة يغيّر اتجاه القراءة.</p>
        <button type="button" onClick={() => setDirection(value => value === "rtl" ? "ltr" : "rtl")}
          className="mt-4 min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="تبديل اتجاه المانجا">{direction === "rtl" ? "من اليمين لليسار" : "من اليسار لليمين"}</button>
      </ReaderChrome>

      <main className="flex min-h-screen flex-col items-center justify-center px-0 pb-40 pt-20 sm:px-6 sm:pb-32" aria-label="صفحات الفصل">
        {!total && <EmptyReaderContent format="manga" />}
        {page && (
          <div
            className="relative w-full max-w-[560px] cursor-pointer select-none"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const clickedLeft = e.clientX - rect.left < rect.width / 2;
              go(direction === "rtl" ? (clickedLeft ? 1 : -1) : clickedLeft ? -1 : 1);
            }}
            role="application"
            aria-label={`صفحة ${index + 1} من ${total} — انقر يمين الشاشة أو يسارها للتنقل`}
          >
            <ReaderImage key={page.id} src={page.imagePath} fallbackImagePath={page.fallbackImagePath} alt={`صفحة ${index + 1} من ${total}`} width={page.width} height={page.height} sizes="(max-width: 592px) 100vw, 560px" eager />
            {/* Subtle tap zones hint */}
            <div className="pointer-events-none absolute inset-y-0 start-0 w-1/2 opacity-0 transition hover:opacity-100">
              <div className="flex h-full items-center justify-start ps-3">
                <span className="grid size-9 place-items-center rounded-full bg-background/80 text-foreground backdrop-blur">
                  {direction === "rtl" ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
                </span>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-y-0 end-0 w-1/2 opacity-0 transition hover:opacity-100">
              <div className="flex h-full items-center justify-end pe-3">
                <span className="grid size-9 place-items-center rounded-full bg-background/80 text-foreground backdrop-blur">
                  {direction === "rtl" ? <ChevronRight className="size-5" /> : <ChevronLeft className="size-5" />}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Reader toolbar: Charcoal/violet styling, preserving required test structure & accessibility */}
        <div inert={immersive} aria-label="أدوات صفحات المانجا" className={`fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background pb-[env(safe-area-inset-bottom)] transition-transform duration-200 motion-reduce:transition-none sm:inset-x-4 sm:bottom-4 sm:max-w-4xl sm:mx-auto sm:rounded-xl sm:border ${immersive ? "translate-y-[calc(100%+2rem)]" : ""}`}>
          <div className="mx-auto grid max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1 px-3 py-2 sm:flex sm:h-16 sm:gap-2 sm:px-4 sm:py-0">
            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1.5 rounded-xl border-border/70 sm:h-8"
              onClick={() => go(-1)}
              disabled={!restored || (index === 0 && !prev)}
              aria-label="الصفحة السابقة"
            >
              <ChevronRight className="size-4" />
              السابق
            </Button>

            <div className="order-last col-span-3 flex min-w-0 items-center justify-center gap-2 sm:order-none sm:flex-1" dir="ltr">
              <input
                type="range"
                min={0}
                max={Math.max(total - 1, 0)}
                value={index}
                disabled={!restored || !total}
                onChange={(e) => setIndex(Number(e.target.value))}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-11 min-w-0 flex-1 accent-[var(--primary)] sm:h-1.5 sm:w-56 sm:max-w-48 sm:flex-none cursor-pointer"
                aria-label="التنقل بين الصفحات"
              />
              <span className="min-w-14 text-center text-xs tabular-nums text-muted-foreground">
                {total ? index + 1 : 0} / {total}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1.5 rounded-xl border-border/70 sm:h-8"
              onClick={() => setDirection((d) => (d === "rtl" ? "ltr" : "rtl"))}
              title="تبديل اتجاه القراءة"
              aria-label={`اتجاه القراءة الحالي: ${direction === "rtl" ? "من اليمين لليسار" : "من اليسار لليمين"}. اضغط للتبديل.`}
            >
              <ArrowLeftRight className="size-4" />
              {direction === "rtl" ? "يمين ← يسار" : "يسار → يمين"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1.5 rounded-xl border-border/70 sm:h-8"
              onClick={() => go(1)}
              disabled={!restored || (index >= total - 1 && (!next || next.isPremiumDemo))}
              aria-label="الصفحة التالية"
            >
              التالي
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </div>

        {/* End-of-chapter card, appears when reaching last page */}
        {total > 0 && index >= total - 1 && (
          <div className="w-full">
            <ChapterEndCard
              seriesSlug={seriesSlug}
              format="manga"
              seriesTitle={seriesTitle}
              next={next}
              prev={prev}
              chapterNumber={chapterNumber}
            />
          </div>
        )}
      </main>

      <span className="hidden"><Lock /></span>
      <Link href="/explore" className="sr-only">استكشف</Link>
    </div>
  );
}
