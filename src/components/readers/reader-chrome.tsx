"use client";
import { AdultBadge } from "@/components/library/adult-badge";

import Link from "next/link";
import { ChevronRight, ChevronLeft, Maximize, Minimize, X, Lock, BookOpen, List, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function LockedChapterPanel({
  seriesSlug,
  seriesTitle,
  format: _format,
}: {
  seriesSlug: string;
  seriesTitle: string;
  format: string;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl border border-gold/40 bg-gold/10 text-gold">
        <Lock className="size-7" aria-hidden />
      </span>
      <h2 className="mt-5 text-xl font-bold text-foreground">الفصل غير متاح حاليًا</h2>
      <p className="mt-2 max-w-md text-sm leading-8 text-muted-foreground">
        قراءة هذا الفصل غير متاحة حاليًا. يمكنك العودة إلى قائمة الفصول أو اكتشاف عمل آخر.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <Button asChild variant="outline" className="h-11 min-h-[44px] gap-2 rounded-xl border-border/80 px-4">
          <Link href={`/series/${seriesSlug}`}>
            <X className="size-4" aria-hidden />
            العودة إلى العمل
          </Link>
        </Button>
        <Button asChild className="h-11 min-h-[44px] gap-2 rounded-xl bg-primary px-4 text-primary-foreground hover:bg-primary/90">
          <Link href="/explore">
            <BookOpen className="size-4" aria-hidden />
            تصفّح أعمالًا أخرى
          </Link>
        </Button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground/70">{seriesTitle}</p>
    </div>
  );
}

export function ReaderChrome({
  isAdult = false,
  seriesSlug,
  seriesTitle,
  chapterNumber,
  chapterTitle,
  format: _format,
  percent,
  immersive,
  onToggleImmersive,
  headerExtra,
  chapterControl,
  children,
}: {
  seriesSlug: string;
  seriesTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  format: string;
  isAdult?: boolean;
  percent: number;
  immersive: boolean;
  onToggleImmersive: () => void;
  headerExtra?: React.ReactNode;
  chapterControl?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <>
      {/* Top Header Chrome */}
      <header
        inert={immersive}
        className={`fixed inset-x-0 top-0 z-40 border-b border-border bg-background transition-transform duration-300 motion-reduce:transition-none ${
          immersive ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="mx-auto flex h-18 max-w-5xl items-center gap-2 px-3 sm:px-4">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="عودة إلى العمل"
          >
            <Link href={`/series/${seriesSlug}`}>
              <ChevronRight className="size-5" />
            </Link>
          </Button>

          <div className="min-w-0 flex-1 text-center">
            <div className="flex items-center justify-center gap-2"><p className="truncate text-xs font-bold text-foreground sm:text-sm">{seriesTitle}</p>{isAdult && <AdultBadge className="py-0.5 text-[10px]" />}</div>
            {chapterControl ? (
              <div className="flex items-center justify-center">
                {chapterControl}
              </div>
            ) : (
              <p className="truncate text-[11px] text-muted-foreground">
                الفصل {chapterNumber} · {chapterTitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {headerExtra}

            {children && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="إعدادات القراءة"
                    title="إعدادات القراءة"
                  >
                    <Settings className="size-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>إعدادات القراءة</DialogTitle>
                    <DialogDescription>
                      خيارات وتفضيلات تجربة القراءة وعرض النص.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="mt-2 space-y-4">
                    {children}
                  </div>
                </DialogContent>
              </Dialog>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onToggleImmersive}
              aria-label={immersive ? "إظهار أدوات القراءة" : "وضع القراءة العميقة"}
              title={immersive ? "إظهار الأدوات" : "وضع القراءة العميقة"}
            >
              {immersive ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
            </Button>
          </div>
        </div>

        {/* Header Progress Track */}
        <div className="h-0.5 w-full bg-border/40">
          <div
            className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      </header>

      {/* Floating Pill when Immersive (Focus) Mode is Active */}
      {immersive && (
        <button
          onClick={onToggleImmersive}
          className="fixed end-3 top-3 z-40 flex h-11 items-center justify-center rounded-full border border-border/60 bg-[#191C25] px-4 text-xs font-semibold text-muted-foreground shadow-sm transition hover:text-foreground motion-reduce:transition-none"
          aria-label="إظهار أدوات القراءة"
        >
          إظهار أدوات القراءة
        </button>
      )}
    </>
  );
}

/**
 * Floating compact chapter navigation pill (approved concept)
 * Fixed at the bottom center of the reader, hidden during focus/immersive mode.
 * Styled with charcoal/violet tokens and never obstructs page content.
 */
export function ReaderFloatingBar({
  seriesSlug,
  chapterNumber,
  format,
  percent,
  prev,
  next,
  immersive,
  chapterControl,
}: {
  seriesSlug: string;
  chapterNumber: number;
  format: string;
  percent: number;
  prev: { number: number; isPremiumDemo: boolean } | null;
  next: { number: number; isPremiumDemo: boolean } | null;
  immersive: boolean;
  chapterControl?: React.ReactNode;
}) {
  const clampedPercent = Math.min(100, Math.max(0, Math.round(percent)));

  return (
    <footer
      role="region"
      aria-label="شريط أدوات القارئ السريع"
      inert={immersive}
      className={`fixed inset-x-0 bottom-0 z-30 flex justify-center transition-transform duration-300 motion-reduce:transition-none sm:bottom-4 sm:px-4 ${
        immersive ? "translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
      }`}
    >
      <div className="w-full border-t border-border/70 bg-[#191C25] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:w-auto sm:min-w-[360px] sm:max-w-[480px] sm:rounded-2xl sm:border sm:px-4 sm:py-2.5 sm:pb-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-2 sm:justify-center sm:gap-3">
          {prev ? (
            <Link
              href={`/read/${format}/${seriesSlug}/${prev.number}`}
              className="flex h-11 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-foreground/80 transition hover:bg-secondary/60 hover:text-foreground motion-reduce:transition-none"
              title={`الفصل السابق (${prev.number})`}
            >
              <ChevronRight className="size-4" />
              <span>السابق</span>
            </Link>
          ) : (
            <span
              className="flex h-11 items-center gap-1 px-2.5 text-xs text-muted-foreground/35 cursor-not-allowed select-none"
              aria-disabled="true"
            >
              <ChevronRight className="size-4" />
              <span>السابق</span>
            </span>
          )}

          {chapterControl ? (
            <div className="flex h-11 items-center justify-center">
              {chapterControl}
            </div>
          ) : (
            <Link
              href={`/series/${seriesSlug}`}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-border/50 bg-secondary/50 px-3 text-xs font-bold text-foreground transition hover:bg-secondary hover:text-primary motion-reduce:transition-none"
              title="الانتقال إلى قائمة الفصول"
            >
              <List className="size-3.5 text-muted-foreground" />
              <span>الفصل {chapterNumber}</span>
            </Link>
          )}

          {next && !next.isPremiumDemo ? (
            <Link
              href={`/read/${format}/${seriesSlug}/${next.number}`}
              className="flex h-11 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-foreground/80 transition hover:bg-secondary/60 hover:text-foreground motion-reduce:transition-none"
              title={`الفصل التالي (${next.number})`}
            >
              <span>التالي</span>
              <ChevronLeft className="size-4" />
            </Link>
          ) : next?.isPremiumDemo ? (
            <Link
              href={`/read/${format}/${seriesSlug}/${next.number}`}
              className="flex h-11 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-gold/90 transition hover:bg-gold/10 motion-reduce:transition-none"
              title="الفصل التالي (مقفل)"
            >
              <span>التالي</span>
              <Lock className="size-3 text-gold" />
              <ChevronLeft className="size-4" />
            </Link>
          ) : (
            <span
              className="flex h-11 items-center gap-1 px-2.5 text-xs text-muted-foreground/35 cursor-not-allowed select-none"
              aria-disabled="true"
            >
              <span>التالي</span>
              <ChevronLeft className="size-4" />
            </span>
          )}
        </div>

        {/* Mini progress line & percentage */}
        <div className="mt-1.5 flex w-full items-center gap-2 px-1">
          <div
            role="progressbar"
            aria-label="تقدم قراءة الفصل"
            aria-valuenow={clampedPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${clampedPercent}%`}
            className="h-1 flex-1 overflow-hidden rounded-full bg-border/50"
          >
            <div
              className="h-full bg-primary transition-all duration-200 motion-reduce:transition-none"
              style={{ width: `${clampedPercent}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">{clampedPercent}%</span>
        </div>
      </div>
    </footer>
  );
}

export function ChapterEndCard({
  seriesSlug,
  format,
  seriesTitle,
  next,
  prev,
  chapterNumber,
}: {
  seriesSlug: string;
  format: string;
  seriesTitle: string;
  next: { number: number; isPremiumDemo: boolean } | null;
  prev: { number: number; isPremiumDemo: boolean } | null;
  chapterNumber: number;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-center">
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <p className="text-xs font-semibold text-gold">انتهى الفصل {chapterNumber}</p>
        <h2 className="mt-1.5 text-xl font-bold text-foreground">{seriesTitle}</h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          {next ? "الفصل التالي بانتظارك." : "هذا أحدث فصل منشور حتى الآن — عد قريبًا لمتابعة القصة."}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {prev && (
            <Button asChild variant="outline" className="h-11 min-h-[44px] gap-2 rounded-xl border-border/80 px-4">
              <Link href={`/read/${format}/${seriesSlug}/${prev.number}`}>
                الفصل السابق ({prev.number})
              </Link>
            </Button>
          )}
          {next && !next.isPremiumDemo && (
            <Button asChild className="h-11 min-h-[44px] gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground hover:bg-primary/90">
              <Link href={`/read/${format}/${seriesSlug}/${next.number}`}>
                الفصل التالي ({next.number})
              </Link>
            </Button>
          )}
          {next?.isPremiumDemo && (
            <Button asChild variant="outline" className="h-11 min-h-[44px] gap-2 rounded-xl border-gold/40 px-4 text-gold hover:bg-gold/10">
              <Link href={`/read/${format}/${seriesSlug}/${next.number}`}>
                <Lock className="size-4" aria-hidden />
                الفصل التالي — مقفل
              </Link>
            </Button>
          )}
          <Button asChild variant="ghost" className="h-11 min-h-[44px] rounded-xl px-4 text-muted-foreground hover:text-foreground">
            <Link href={`/series/${seriesSlug}`}>كل الفصول</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
