"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const AUTOPLAY_MS = 4500;
/** After the reader touches the rail, leave it alone for a while. */
const RESUME_AFTER_MS = 12000;

/**
 * Horizontal rail with desktop arrows and a gentle auto-advance.
 * RTL-aware: "next" moves toward the end of the list (to the left in Arabic).
 * Auto-advance pauses on hover, focus, touch and while off screen, and never
 * runs when the reader asked the system for reduced motion.
 */
export function RailScroller({ label, autoplay = true, children }: { label: string; autoplay?: boolean; children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const paused = useRef(false);
  const visible = useRef(false);
  const resumeAt = useRef(0);

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    // In RTL, scrollLeft is 0 at the start and negative toward the end (all modern engines).
    const offset = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: offset <= 2, end: offset >= max - 2 });
  }, []);

  const step = useCallback(() => {
    const el = track.current;
    if (!el) return 0;
    const first = el.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const card = first ? first.getBoundingClientRect().width + gap : 180;
    // Move by whole cards, about one view at a time.
    return Math.max(card, Math.floor(el.clientWidth / card) * card - card);
  }, []);

  const move = useCallback((direction: 1 | -1, amount?: number) => {
    const el = track.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const distance = (amount ?? step()) * direction;
    el.scrollBy({ left: rtl ? -distance : distance, behavior: "smooth" });
  }, [step]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    const seen = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting; }, { threshold: 0.5 });
    seen.observe(el);
    return () => { el.removeEventListener("scroll", measure); resize.disconnect(); seen.disconnect(); };
  }, [measure]);

  useEffect(() => {
    if (!autoplay || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      const el = track.current;
      if (!el || paused.current || !visible.current || document.hidden || Date.now() < resumeAt.current) return;
      if (el.scrollWidth - el.clientWidth < 8) return;
      const offset = Math.abs(el.scrollLeft);
      if (offset >= el.scrollWidth - el.clientWidth - 2) el.scrollTo({ left: 0, behavior: "smooth" });
      else {
        const first = el.firstElementChild as HTMLElement | null;
        const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
        move(1, first ? first.getBoundingClientRect().width + gap : 180);
      }
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [autoplay, move]);

  const hold = () => { resumeAt.current = Date.now() + RESUME_AFTER_MS; };
  const arrow = "absolute top-[calc(50%-2.75rem)] z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-lg backdrop-blur transition hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex";

  return (
    <div className="group/rail relative"
      onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }}
      onFocusCapture={() => { paused.current = true; }} onBlurCapture={() => { paused.current = false; }}
      onPointerDown={hold} onWheel={hold}>
      <div ref={track} className="scrollbar-none -mx-4 flex snap-x snap-proximity scroll-px-4 gap-3.5 overflow-x-auto scroll-smooth px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 [&>*]:snap-start" role="list" aria-label={label}>
        {children}
      </div>
      {!edges.start && <button type="button" onClick={() => { hold(); move(-1); }} aria-label="السابق" className={arrow + " start-0 sm:-start-3"}>
        <ChevronRight className="size-5 rtl:rotate-0 ltr:rotate-180" aria-hidden />
      </button>}
      {!edges.end && <button type="button" onClick={() => { hold(); move(1); }} aria-label="التالي" className={arrow + " end-0 sm:-end-3"}>
        <ChevronLeft className="size-5 rtl:rotate-0 ltr:rotate-180" aria-hidden />
      </button>}
    </div>
  );
}
