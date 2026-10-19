"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ReaderChapterSelect, EmptyReaderContent, type ReaderChapter, ReaderWidthControl, useReaderWidth } from "@/components/readers/reader-tools";
import { ReaderImage } from "@/components/readers/reader-image";
import { ReaderChrome, ChapterEndCard, LockedChapterPanel, ReaderFloatingBar } from "@/components/readers/reader-chrome";
import { CommentsSection } from "@/components/community/comments-section";
import { saveReadingProgress } from "@/lib/actions";
import { readChapterLocal, writeLocal } from "@/lib/progress-local";
import { restoreReaderScroll, selectReaderProgress, type ReaderProgress } from "@/lib/reader-progress";
import type { CommentView } from "@/lib/queries";

type Panel = { id: string; pageIndex: number; imagePath: string; fallbackImagePath?: string; width: number; height: number };

export function WebtoonReader({
  seriesSlug,
  seriesTitle,
  chapterNumber,
  chapterTitle,
  chapters,
  panels,
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
  panels: Panel[];
  isPremiumDemo: boolean;
  comments?: CommentView[];
  initialProgress?: ReaderProgress | null;
  next: { number: number; isPremiumDemo: boolean } | null;
  prev: { number: number; isPremiumDemo: boolean } | null;
}) {
  const { status } = useSession();
  const { width, ready: preferencesReady, applyWidth } = useReaderWidth();
  const [immersive, setImmersive] = useState(false);
  const [percent, setPercent] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSaved = useRef(0);
  const [restored, setRestored] = useState(false);
  const actualPercent = useRef(0);
  const mirrorInitialized = useRef(false);

  useEffect(() => {
    if (!restored || isPremiumDemo || !panels.length) return;
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const p = max > 0 ? Math.min(100, Math.max(0, (el.scrollTop / max) * 100)) : 100;
      setPercent(p);
      actualPercent.current = p;
      if (status === "loading" || !mirrorInitialized.current) return;

      const now = Date.now();
      if (now - lastSaved.current > 2500 && p - 0 > 0) {
        lastSaved.current = now;
        writeLocal({
          seriesSlug,
          seriesTitle,
          chapterNumber,
          chapterTitle,
          pageIndex: 0,
          percent: p,
          total: panels.length,
          format: "webtoon",
          coverPath: "",
          accent: "",
        });
        if (status === "authenticated") {
          saveReadingProgress({
            seriesSlug,
            chapterNumber,
            pageIndex: 0,
            percent: p,
            completed: p >= 99,
          }).catch(() => {});
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [chapterNumber, panels.length, seriesSlug, seriesTitle, status, chapterTitle, isPremiumDemo, restored]);

  useEffect(() => {
    if (restored || isPremiumDemo || !panels.length || !preferencesReady) return;
    const progress = selectReaderProgress(readChapterLocal(seriesSlug, chapterNumber, "webtoon"), initialProgress);
    return restoreReaderScroll(progress?.percent ?? 0, (actual) => {
      setPercent(actual);
      actualPercent.current = actual;
      setRestored(true);
    });
  }, [chapterNumber, initialProgress, isPremiumDemo, panels.length, seriesSlug, restored, preferencesReady]);

  useEffect(() => {
    if (!restored || status === "loading" || mirrorInitialized.current || isPremiumDemo || !panels.length) return;
    mirrorInitialized.current = true;
    lastSaved.current = Date.now();
    writeLocal({
      seriesSlug,
      seriesTitle,
      chapterNumber,
      chapterTitle,
      pageIndex: 0,
      percent: actualPercent.current || 1,
      total: panels.length,
      format: "webtoon",
      coverPath: "",
      accent: "",
    });
  }, [chapterNumber, chapterTitle, isPremiumDemo, panels.length, restored, seriesSlug, seriesTitle, status]);

  if (isPremiumDemo) {
    return <LockedChapterPanel seriesSlug={seriesSlug} seriesTitle={seriesTitle} format="webtoon" />;
  }

  return (
    <div className="min-h-screen bg-background" ref={containerRef}>
      <ReaderChrome
        seriesSlug={seriesSlug}
        seriesTitle={seriesTitle}
        chapterNumber={chapterNumber}
        chapterTitle={chapterTitle}
        format="webtoon"
        chapterControl={<ReaderChapterSelect seriesSlug={seriesSlug} format="webtoon" chapterNumber={chapterNumber} chapters={chapters} />}
        percent={percent}
        immersive={immersive}
        onToggleImmersive={() => setImmersive((v) => !v)}
      >
        <ReaderWidthControl width={width} onChange={applyWidth} />
      </ReaderChrome>

      {/* Reserve space for the fixed tools while keeping chapter content near the header. */}
      <main className="pt-20 pb-36" aria-label="لوحات الفصل">
        <div className="mx-auto" style={{ maxWidth: width }}>
          {!panels.length && <EmptyReaderContent format="webtoon" />}
          {panels.map((p) => (
            <ReaderImage key={p.id} src={p.imagePath} fallbackImagePath={p.fallbackImagePath} alt={`لوحة ${p.pageIndex + 1} من ${panels.length}`} width={p.width} height={p.height} sizes={`(max-width: ${width}px) 100vw, ${width}px`} eager={p.pageIndex < 2} />
          ))}
        </div>

        {panels.length > 0 && <ChapterEndCard
          seriesSlug={seriesSlug}
          format="webtoon"
          seriesTitle={seriesTitle}
          next={next}
          prev={prev}
          chapterNumber={chapterNumber}
        />}

        {/* Chapter comments — inline at the end of the vertical scroll */}
        <section className="mx-auto max-w-2xl px-4 pb-12">
          <CommentsSection
            seriesSlug={seriesSlug}
            seriesTitle={seriesTitle}
            chapterNumber={chapterNumber}
            comments={comments}
          />
        </section>
      </main>

      {/* Floating navigation bar */}
      <ReaderFloatingBar
        seriesSlug={seriesSlug}
        chapterNumber={chapterNumber}
        format="webtoon"
        chapterControl={<ReaderChapterSelect seriesSlug={seriesSlug} format="webtoon" chapterNumber={chapterNumber} chapters={chapters} />}
        percent={percent}
        prev={prev}
        next={next}
        immersive={immersive}
      />
    </div>
  );
}
