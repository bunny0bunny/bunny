"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ArrowLeftRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReaderChapterSelect, EmptyReaderContent, type ReaderChapter, useReaderWidth, ReaderWidthControl } from "@/components/readers/reader-tools";
import { ReaderImage } from "@/components/readers/reader-image";
import { MangaTouchSurface } from "@/components/readers/manga-touch-surface";
import { ReaderChrome, ChapterEndCard, LockedChapterPanel } from "@/components/readers/reader-chrome";
import { ChapterCommentsDialog } from "@/components/community/chapter-comments-dialog";
import { ChapterDownloadButton } from "@/components/downloads/chapter-download-button";
import { type ReaderProgress } from "@/lib/reader-progress";
import { readerHref } from "@/lib/reader-route";
import type { CommentView } from "@/lib/queries";

import { ContinuousImages, useImageReaderPosition } from "./reader-position";
import { resolvePresentation, type Presentation } from "@/lib/reader-presentation";

type Page = { id: string; pageIndex: number; imagePath: string; fallbackImagePath?: string; width: number; height: number };

export function MangaReader({
  seriesSlug,
  seriesTitle,
  isAdult = false,
  chapterId,
  downloadsEnabled = false,
  chapterNumber,
  chapterTitle,
  chapters,
  pages,
  defaultDirection,
  defaultPresentation = "paged",
  isPremiumDemo,
  comments = [],
  initialProgress = null,
  next,
  prev,
}: {
  seriesSlug: string;
  seriesTitle: string;
  isAdult?: boolean;
  chapterId?: string;
  downloadsEnabled?: boolean;
  chapterNumber: number;
  chapterTitle: string;
  chapters: ReaderChapter[];
  pages: Page[];
  defaultDirection: "rtl" | "ltr";
  defaultPresentation?: Presentation;
  isPremiumDemo: boolean;
  comments?: CommentView[];
  initialProgress?: ReaderProgress | null;
  next: { number: number; isPremiumDemo: boolean } | null;
  prev: { number: number; isPremiumDemo: boolean } | null;
}) {
  const [immersive, setImmersive] = useState(false);
  const [direction, setDirection] = useState<"rtl" | "ltr">(defaultDirection);
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<Presentation>(defaultPresentation);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [fit, setFit] = useState<'width' | 'page'>('width');
  const { width, ready: widthReady, applyWidth } = useReaderWidth();
  const container = useRef<HTMLElement>(null);
  const total = pages.length;
  const { percent, restored, capture, navigate } = useImageReaderPosition({ seriesSlug, seriesTitle, chapterNumber, chapterTitle, format: 'manga', total, locked: isPremiumDemo, initialProgress, container, continuous: layout === 'continuous', index, setIndex, layoutKey: `${layout}:${fit}:${width}:${immersive}`, ready: preferencesReady && widthReady });
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let stored: string | null = null;
      try { stored = localStorage.getItem(`bunny.reader.layout.v1:${seriesSlug}`); } catch { /* Optional device preference. */ }
      setLayout(resolvePresentation(stored, defaultPresentation)); setPreferencesReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [seriesSlug, defaultPresentation]);
  const chooseLayout = (value: Presentation | null) => {
    capture();
    try {
      if (value) localStorage.setItem(`bunny.reader.layout.v1:${seriesSlug}`, value);
      else localStorage.removeItem(`bunny.reader.layout.v1:${seriesSlug}`);
    } catch { /* Keep this session usable with storage disabled. */ }
    setLayout(resolvePresentation(value, defaultPresentation));
  };

  const go = useCallback(
    (delta: 1 | -1) => {
      if (!restored || isPremiumDemo || !total) return;
      const nextIndex = index + delta;
      if (nextIndex < 0) {
        if (prev) window.location.href = readerHref("manga", seriesSlug, prev.number);
        return;
      }
      if (nextIndex >= total) {
        if (next && !next.isPremiumDemo) window.location.href = readerHref("manga", seriesSlug, next.number);
        return;
      }
      navigate(nextIndex);
    },
    [next, prev, seriesSlug, total, restored, isPremiumDemo, index, navigate]
  );

  useEffect(() => {
    if (isPremiumDemo || !restored || layout !== 'paged') return;
    const nextPage = pages[index + 1];
    if (!nextPage) return;
    const preload = new window.Image();
    preload.src = nextPage.imagePath;
    return () => { preload.src = ''; };
  }, [isPremiumDemo, restored, layout, index, pages]);

  // Keyboard navigation — RTL-aware: "next" advances with Left arrow in RTL mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey ||
        (target instanceof HTMLElement && (target.closest("input, textarea, select, [role=dialog], [contenteditable]")))) return;
      if (layout === "paged" && e.key === "ArrowLeft") go(direction === "rtl" ? 1 : -1);
      if (layout === "paged" && e.key === "ArrowRight") go(direction === "rtl" ? -1 : 1);
      if (e.key === "f") { capture(); setImmersive((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [direction, go, layout, capture]);

  if (isPremiumDemo) {
    return <LockedChapterPanel seriesSlug={seriesSlug} seriesTitle={seriesTitle} format="manga" />;
  }

  const page = pages[index];

  return (
    <div className="min-h-screen bg-background">
      <ReaderChrome
        isAdult={isAdult}
        seriesSlug={seriesSlug}
        seriesTitle={seriesTitle}
        chapterNumber={chapterNumber}
        chapterTitle={chapterTitle}
        format="manga"
        chapterControl={<ReaderChapterSelect seriesSlug={seriesSlug} format="manga" chapterNumber={chapterNumber} chapters={chapters} />}
        percent={percent}
        immersive={immersive}
        onToggleImmersive={() => { capture(); setImmersive((v) => !v); }}
        headerExtra={<>
          {downloadsEnabled && chapterId && <ChapterDownloadButton chapterId={chapterId} />}
          <ChapterCommentsDialog
            seriesSlug={seriesSlug}
            seriesTitle={seriesTitle}
            chapterNumber={chapterNumber}
            comments={comments}
          />
        </>}
      >
        <fieldset className="mb-5 space-y-3"><legend className="text-sm font-semibold">طريقة العرض</legend><div className="flex flex-wrap gap-2">{(['paged', 'continuous'] as const).map(value => <button type="button" key={value} aria-pressed={layout === value} onClick={() => chooseLayout(value)} className="min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{value === 'paged' ? 'صفحات' : 'تمرير متصل'}</button>)}<button type="button" onClick={() => chooseLayout(null)} className="min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">استعادة إعداد الناشر</button></div></fieldset>
        {layout === 'continuous' ? <ReaderWidthControl width={width} onChange={value => { capture(); applyWidth(value); }} /> : <fieldset className="mb-5"><legend className="mb-3 text-sm font-semibold">ملاءمة الصفحة</legend><div className="flex flex-wrap gap-2">{(['width', 'page'] as const).map(value => <button type="button" key={value} aria-pressed={fit === value} onClick={() => { capture(); setFit(value); }} className="min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{value === 'width' ? 'ملاءمة العرض' : 'الصفحة كاملة'}</button>)}</div></fieldset>}
        <p className="text-sm leading-7 text-muted-foreground">{layout === 'continuous' ? 'مرّر رأسيًا للقراءة. التمرير والتكبير متاحان بأدوات جهازك.' : 'المس طرف الصفحة أو اسحب أفقيًا للتقليب حسب اتجاه القراءة. المس المنتصف لإظهار الأدوات أو إخفائها. التمرير الرأسي والتكبير متاحان، ويمكنك استخدام الأسهم أيضًا.'}</p>
        {layout === 'paged' && <button type="button" onClick={() => setDirection(value => value === "rtl" ? "ltr" : "rtl")}
          className="mt-4 min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="تبديل اتجاه المانجا">{direction === "rtl" ? "من اليمين لليسار" : "من اليسار لليمين"}</button>}
      </ReaderChrome>

      <main ref={container} className="flex min-h-screen flex-col items-center justify-center px-0 pb-40 pt-20 sm:px-6 sm:pb-32" aria-label="صفحات الفصل">
        {!total && <EmptyReaderContent format="manga" />}
        {layout === 'continuous' && <ContinuousImages pages={pages} width={width} gap={8} />}
        {layout === 'paged' && page && (
          <MangaTouchSurface direction={direction} onNext={() => go(1)} onPrevious={() => go(-1)} onToggle={() => { capture(); setImmersive(value => !value); }}>
          <div
            data-reader-image={index}
            data-manga-page
            className="relative mx-auto w-full cursor-pointer select-none"
            style={{ maxWidth: fit === 'page' ? `min(100vw, calc(var(--reader-visible-height, calc(100dvh - 160px)) * ${page.width / page.height}))` : 840 }}
            aria-label={`صفحة ${index + 1} من ${total}`}
          >
            <ReaderImage key={page.id} src={page.imagePath} fallbackImagePath={page.fallbackImagePath} alt={`صفحة ${index + 1} من ${total}`} width={page.width} height={page.height} sizes="(max-width: 840px) 100vw, 840px" eager />
            {/* Subtle tap zones hint */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-0 w-[30%] opacity-0 transition hover:opacity-100">
              <div className="flex h-full items-center justify-start ps-3">
                <span className="grid size-9 place-items-center rounded-full bg-background/80 text-foreground backdrop-blur">
                  {direction === "rtl" ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
                </span>
              </div>
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-0 w-[30%] opacity-0 transition hover:opacity-100">
              <div className="flex h-full items-center justify-end pe-3">
                <span className="grid size-9 place-items-center rounded-full bg-background/80 text-foreground backdrop-blur">
                  {direction === "rtl" ? <ChevronRight className="size-5" /> : <ChevronLeft className="size-5" />}
                </span>
              </div>
            </div>
          </div>
          </MangaTouchSurface>
        )}

        {/* Reader toolbar: Charcoal/violet styling, preserving required test structure & accessibility */}
        <div data-reader-bottom hidden={layout === "continuous"} inert={immersive} aria-label="أدوات صفحات المانجا" className={`fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background pb-[env(safe-area-inset-bottom)] transition-transform duration-200 motion-reduce:transition-none sm:inset-x-4 sm:bottom-4 sm:max-w-4xl sm:mx-auto sm:rounded-xl sm:border ${immersive ? "translate-y-[calc(100%+2rem)]" : ""}`}>
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
                onChange={(e) => navigate(Number(e.target.value))}
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
        {total > 0 && (layout === "continuous" || index >= total - 1) && (
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
