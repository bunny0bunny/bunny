"use client";

import { useRef, useState } from "react";
import { ReaderChapterSelect, EmptyReaderContent, type ReaderChapter, ReaderWidthControl, useReaderWidth } from "@/components/readers/reader-tools";
import { ContinuousImages, useImageReaderPosition } from "./reader-position";
import { ReaderChrome, ChapterEndCard, LockedChapterPanel, ReaderFloatingBar } from "@/components/readers/reader-chrome";
import { CommentsSection } from "@/components/community/comments-section";
import { ChapterDownloadButton } from "@/components/downloads/chapter-download-button";
import { type ReaderProgress } from "@/lib/reader-progress";
import type { CommentView } from "@/lib/queries";

type Panel = { id: string; pageIndex: number; imagePath: string; fallbackImagePath?: string; width: number; height: number };

export function WebtoonReader({
  seriesSlug,
  seriesTitle,
  isAdult = false,
  chapterId,
  downloadsEnabled = false,
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
  isAdult?: boolean;
  chapterId?: string;
  downloadsEnabled?: boolean;
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
  const { width, ready: preferencesReady, applyWidth } = useReaderWidth();
  const [immersive, setImmersive] = useState(false);
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { percent, capture } = useImageReaderPosition({ seriesSlug, seriesTitle, chapterNumber, chapterTitle, format: 'webtoon', total: panels.length, locked: isPremiumDemo, initialProgress, container: containerRef, continuous: true, index, setIndex, layoutKey: `${width}:${immersive}`, ready: preferencesReady });

  if (isPremiumDemo) {
    return <LockedChapterPanel seriesSlug={seriesSlug} seriesTitle={seriesTitle} format="webtoon" />;
  }

  return (
    <div className="min-h-screen bg-background" ref={containerRef}>
      <ReaderChrome
        isAdult={isAdult}
        seriesSlug={seriesSlug}
        seriesTitle={seriesTitle}
        chapterNumber={chapterNumber}
        chapterTitle={chapterTitle}
        format="webtoon"
        headerExtra={downloadsEnabled && chapterId ? <ChapterDownloadButton chapterId={chapterId} /> : undefined}
        chapterControl={<ReaderChapterSelect seriesSlug={seriesSlug} format="webtoon" chapterNumber={chapterNumber} chapters={chapters} />}
        percent={percent}
        immersive={immersive}
        onToggleImmersive={() => { capture(); setImmersive((v) => !v); }}
      >
        <ReaderWidthControl width={width} onChange={value => { capture(); applyWidth(value); }} />
      </ReaderChrome>

      {/* Reserve space for the fixed tools while keeping chapter content near the header. */}
      <main className="pt-20 pb-36" aria-label="لوحات الفصل">
        <div className="mx-auto" style={{ maxWidth: width }}>
          {!panels.length && <EmptyReaderContent format="webtoon" />}
          <ContinuousImages pages={panels} width={width} />
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
