"use client";
import { getChapterLabel } from '@/lib/chapter-title';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readerHref } from "@/lib/reader-route";
import type { Format } from "@/lib/constants";

export type ReaderChapter = { number: number; titleAr: string; isPremiumDemo: boolean };

export function ReaderChapterSelect({ seriesSlug, format, chapterNumber, chapters }: {
  seriesSlug: string; format: Format; chapterNumber: number; chapters: ReaderChapter[];
}) {
  const router = useRouter();
  return <select aria-label="اختيار الفصل" value={chapterNumber}
    className="h-11 w-full max-w-40 min-w-0 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    onChange={event => {
      const number = Number(event.target.value);
      if (chapters.some(chapter => chapter.number === number)) router.push(readerHref(format, seriesSlug, number));
    }}>
    {chapters.map(chapter => <option key={chapter.number} value={chapter.number}>
      {getChapterLabel(chapter)}{chapter.isPremiumDemo ? " — مقفل" : ""}
    </option>)}
  </select>;
}

const WIDTH_KEY = "bunny.reader.width.v1";
export type ReaderWidth = 640 | 840 | 1120;
export function useReaderWidth() {
  const [width, setWidth] = useState<ReaderWidth>(840);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored = Number(localStorage.getItem(WIDTH_KEY));
        if (stored === 640 || stored === 840 || stored === 1120) setWidth(stored);
      } catch { /* Preferences are optional when storage is unavailable. */ }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const applyWidth = (value: ReaderWidth) => {
    setWidth(value);
    try { localStorage.setItem(WIDTH_KEY, String(value)); } catch { /* Keep this session's setting. */ }
  };
  return { width, ready, applyWidth };
}

export function ReaderWidthControl({ width, onChange }: { width: ReaderWidth; onChange: (value: ReaderWidth) => void }) {
  return <fieldset className="space-y-3">
    <legend className="text-sm font-semibold">عرض اللوحات</legend>
    <div className="flex flex-wrap gap-2">{([
      [640, "مضغوط"], [840, "مريح"], [1120, "عريض"],
    ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={width === value}
      onClick={() => onChange(value)}
      className={"min-h-11 rounded-lg border px-4 text-sm focus-visible:outline-2 focus-visible:outline-ring " + (width === value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}>{label}</button>)}</div>
    <p className="text-xs leading-6 text-muted-foreground">يُحفظ اختيارك على هذا الجهاز. على الموبايل تتناسب اللوحات مع عرض الشاشة.</p>
  </fieldset>;
}

export function EmptyReaderContent({ format }: { format: Format }) {
  return <div role="status" className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center px-6 text-center">
    <h1 className="text-lg font-bold">محتوى الفصل غير متاح بعد</h1>
    <p className="mt-3 text-sm leading-7 text-muted-foreground">{format === "novel" ? "نص هذا الفصل لم يُضف بعد." : "صفحات هذا الفصل لم تُضف بعد."} يمكنك اختيار فصل آخر أو العودة إلى صفحة العمل.</p>
  </div>;
}
