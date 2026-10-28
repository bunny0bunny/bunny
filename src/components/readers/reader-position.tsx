"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useSession } from 'next-auth/react';
import { ReaderImage } from './reader-image';
import { createProgressWriter, imagePosition, legacyImageTop, readerPositionForSave, readingViewport, restoreReaderAnchor, shouldInitializeReader, shouldReanchorWidth, shouldFlushReaderPosition, type CapturedPosition } from '@/lib/reader-presentation';
import { selectReaderProgress, type ReaderProgress } from '@/lib/reader-progress';
import { readChapterLocal, writeLocal } from '@/lib/progress-local';
import { saveReadingProgress } from '@/lib/actions';

export type ReaderPanel = { id: string; pageIndex: number; imagePath: string; fallbackImagePath?: string; width: number; height: number };

// Keep writes ordered even when the route remounts a reader while a request is in flight.
const progressWriter = createProgressWriter();
function chromeElements() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-reader-header], [data-reader-bottom]'));
}
function visibleViewport() {
  const headers: DOMRect[] = []; const footers: DOMRect[] = [];
  for (const element of chromeElements()) {
    const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= .01) continue;
    (element.hasAttribute('data-reader-header') ? headers : footers).push(rect);
  }
  return readingViewport(window.innerHeight, headers, footers);
}
function measureImages(container: RefObject<HTMLElement | null>) {
  return Array.from(container.current?.querySelectorAll<HTMLElement>('[data-reader-image]') ?? []).map(element => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top + window.scrollY, height: rect.height };
  });
}

/** Keep geometry for every image, but retain decoded images only near the viewport. */
function BoundedImage({ page, index, total, width }: { page: ReaderPanel; index: number; total: number; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '1200px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} data-reader-image={index} style={{ aspectRatio: `${page.width}/${page.height}` }}>
    {near && <ReaderImage src={page.imagePath} fallbackImagePath={page.fallbackImagePath} alt={`صفحة ${index + 1} من ${total}`} width={page.width} height={page.height} sizes={`(max-width: ${width}px) 100vw, ${width}px`} eager />}
  </div>;
}

export function ContinuousImages({ pages, width, gap = 0 }: { pages: ReaderPanel[]; width: number; gap?: number }) {
  return <div className="mx-auto flex w-full flex-col" style={{ maxWidth: width, gap }}>
    {pages.map((page, index) => <BoundedImage key={page.id} page={page} index={index} total={pages.length} width={width} />)}
  </div>;
}

type Options = {
  seriesSlug: string; seriesTitle: string; chapterNumber: number; chapterTitle: string;
  format: 'manga' | 'webtoon'; total: number; locked: boolean; initialProgress?: ReaderProgress | null;
  container: RefObject<HTMLElement | null>; continuous: boolean; index: number;
  setIndex: (index: number) => void; layoutKey: string; ready: boolean;
};

export function useImageReaderPosition(options: Options) {
  const { seriesSlug, seriesTitle, chapterNumber, chapterTitle, format, total, locked, initialProgress, container, continuous, index, setIndex, layoutKey, ready } = options;
  const { status } = useSession();
  const chapterKey = `${format}:${seriesSlug}:${chapterNumber}`;
  const [initializedKey, setInitializedKey] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [percent, setPercent] = useState(0);
  const [positionVersion, setPositionVersion] = useState(0);
  const [geometryVersion, setGeometryVersion] = useState(0);
  const pagedIndex = continuous ? 0 : index;
  const anchor = useRef<{ pageIndex: number; pageOffset: number | null; percent: number } | null>(null);
  const lastValid = useRef<{ key: string; position: CapturedPosition } | null>(null);
  const dirty = useRef(false);
  const completedSeen = useRef(false);
  const restoring = useRef(true);
  const lastSaved = useRef(0);
  const flush = useRef<((cachedOnly?: boolean) => void) | null>(null);
  const identity = useRef<string | null>(null);
  const serverProgress = useRef(initialProgress);
  const pendingServer = useRef<Parameters<typeof saveReadingProgress>[0] | null>(null);
  const geometry = useCallback(() => measureImages(container), [container]);
  const read = useCallback((): CapturedPosition | null => {
    const images = geometry();
    if (!images.length) return null;
    const viewport = visibleViewport();
    if (!viewport.height) return null;
    const p = imagePosition(images, window.scrollY + viewport.top, viewport.height);
    if (continuous ? p.completed : pagedIndex === total - 1 && p.completed) completedSeen.current = true;
    const position = { ...p, pageIndex: continuous ? p.pageIndex : pagedIndex, completed: completedSeen.current,
      percent: continuous ? p.percent : pagedIndex === total - 1 && p.completed ? 100 : Math.min(98.9, (pagedIndex + p.percent / 100) / Math.max(1, total) * 100) };
    lastValid.current = { key: chapterKey, position };
    return position;
  }, [geometry, continuous, pagedIndex, total, chapterKey]);
  const capture = useCallback(() => {
    if (restoring.current) return;
    const p = read();
    if (p) { anchor.current = p; setIndex(p.pageIndex); }
  }, [read, setIndex]);
  const navigate = useCallback((nextIndex: number) => {
    anchor.current = { pageIndex: nextIndex, pageOffset: 0, percent: 0 };
    dirty.current = true;
    setIndex(nextIndex);
  }, [setIndex]);

  // Refreshing comments can replace this prop; it must never reinitialize a live chapter.
  useEffect(() => { serverProgress.current = initialProgress; }, [initialProgress]);
  useEffect(() => {
    if (!shouldInitializeReader(identity.current, chapterKey, locked)) return;
    const frame = requestAnimationFrame(() => {
      const progress = selectReaderProgress(readChapterLocal(seriesSlug, chapterNumber, format), serverProgress.current);
      identity.current = chapterKey; dirty.current = false; lastValid.current = null; pendingServer.current = null;
      completedSeen.current = progress?.completed === true || (progress?.completed === undefined && (progress?.percent ?? 0) >= 99);
      anchor.current = progress ? { ...progress, pageIndex: Math.max(0, Math.min(total - 1, progress.pageIndex)), pageOffset: progress.pageOffset ?? (format === 'manga' ? 0 : null) } : { pageIndex: 0, pageOffset: 0, percent: 0 };
      setIndex(anchor.current.pageIndex);
      setInitializedKey(chapterKey);
    });
    return () => cancelAnimationFrame(frame);
  }, [chapterKey, seriesSlug, chapterNumber, format, locked, total, setIndex]);
  useEffect(() => {
    return () => {
      // React may already have detached the DOM. Flush the last valid captured position.
      flush.current?.(true);
      restoring.current = true;
    };
  }, [chapterKey]);

  useEffect(() => {
    if (initializedKey !== chapterKey || !ready || locked || !total) return;
    restoring.current = true;
    let frame = 0; let cancelled = false; let previous = ''; let stable = 0; let attempts = 0;
    const settle = () => {
      if (cancelled) return;
      const viewport = visibleViewport();
      container.current?.style.setProperty('--reader-visible-height', `${viewport.height}px`);
      const images = geometry();
      const signature = `${viewport.top}:${viewport.bottom}:` + images.map(image => `${image.top}:${image.height}`).join(',');
      stable = signature === previous ? stable + 1 : 0; previous = signature;
      if (stable < 3 && attempts++ < 45) { frame = requestAnimationFrame(settle); return; }
      const target = anchor.current;
      if (target && images.length) window.scrollTo({ top: target.pageOffset == null
        ? Math.max(0, legacyImageTop(images, target.percent, viewport.height) - viewport.top)
        : restoreReaderAnchor(images, continuous ? target.pageIndex : 0, target.pageOffset, viewport.top), behavior: 'instant' });
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
        if (cancelled) return;
        restoring.current = false; setRestored(true);
        const actual = read(); if (actual) { anchor.current = actual; setPercent(actual.percent); }
        setPositionVersion(value => value + 1);
      }); });
    };
    frame = requestAnimationFrame(settle);
    return () => { cancelled = true; restoring.current = true; cancelAnimationFrame(frame); };
  }, [initializedKey, chapterKey, ready, locked, total, layoutKey, pagedIndex, continuous, geometry, read, geometryVersion, container]);

  useEffect(() => {
    if (!restored || initializedKey !== chapterKey || locked || !total) return;
    let frame = 0; let timer: ReturnType<typeof setTimeout> | undefined;
    const persist = (cachedOnly = false) => {
      if (timer) clearTimeout(timer); timer = undefined;
      if (!shouldFlushReaderPosition(dirty.current, completedSeen.current, restoring.current, cachedOnly)) return;
      const p = readerPositionForSave(cachedOnly ? null : read(), lastValid.current, chapterKey);
      if (!p) return;
      dirty.current = false; lastSaved.current = Date.now();
      writeLocal({ seriesSlug, seriesTitle, chapterNumber, chapterTitle, ...p, total, format, coverPath: '', accent: '' });
      const payload = { seriesSlug, chapterNumber, ...p };
      if (status === 'authenticated') {
        pendingServer.current = null;
        progressWriter.enqueue(() => saveReadingProgress(payload), chapterKey);
      } else if (status === 'loading') pendingServer.current = payload;
    };
    flush.current = persist;
    const update = () => {
      if (restoring.current) return;
      const p = read(); if (!p) return;
      anchor.current = p; setPercent(p.percent);
      if (continuous) setIndex(p.pageIndex);
      if (dirty.current && !timer) timer = setTimeout(persist, Math.max(0, 1500 - (Date.now() - lastSaved.current)));
    };
    const scroll = () => {
      if (restoring.current) return;
      dirty.current = true; cancelAnimationFrame(frame); frame = requestAnimationFrame(update);
    };
    const onHidden = () => { if (document.visibilityState === 'hidden') persist(); };
    const onPageHide = () => persist();
    const onLink = (event: Event) => { if (event.target instanceof Element && event.target.closest('a[href], select')) persist(); };
    let previousWidth = window.innerWidth;
    const reanchor = () => { if (!restoring.current) setGeometryVersion(value => value + 1); };
    const onChromeTransition = (event: TransitionEvent) => {
      if (event.target === event.currentTarget && ['transform', 'translate', 'opacity'].includes(event.propertyName)) reanchor();
    };
    const resize = () => {
      const width = window.innerWidth;
      if (shouldReanchorWidth(previousWidth, width)) { previousWidth = width; reanchor(); }
      else update(); // Mobile address-bar height changes must not interrupt native momentum.
    };
    const elements = chromeElements();
    const dimensions = new Map<Element, string>();
    const observer = new ResizeObserver(entries => {
      let changed = false;
      for (const entry of entries) {
        const size = `${entry.contentRect.width}:${entry.contentRect.height}`;
        if (dimensions.has(entry.target) && dimensions.get(entry.target) !== size) changed = true;
        dimensions.set(entry.target, size);
      }
      if (changed) reanchor();
    });
    for (const element of elements) { observer.observe(element); element.addEventListener('transitionend', onChromeTransition); }
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onHidden);
    document.addEventListener('click', onLink, true); document.addEventListener('change', onLink, true);
    window.addEventListener('scroll', scroll, { passive: true }); window.addEventListener('resize', resize);
    update();
    return () => {
      flush.current = null; observer.disconnect();
      for (const element of elements) element.removeEventListener('transitionend', onChromeTransition);
      window.removeEventListener('pagehide', onPageHide); document.removeEventListener('visibilitychange', onHidden);
      document.removeEventListener('click', onLink, true); document.removeEventListener('change', onLink, true);
      window.removeEventListener('scroll', scroll); window.removeEventListener('resize', resize);
      cancelAnimationFrame(frame); if (timer) clearTimeout(timer);
    };
  }, [positionVersion, restored, initializedKey, chapterKey, locked, total, status, read, continuous, setIndex, seriesSlug, seriesTitle, chapterNumber, chapterTitle, format]);

  useEffect(() => {
    const payload = pendingServer.current;
    if (status === 'authenticated' && payload && initializedKey === chapterKey) {
      pendingServer.current = null;
      progressWriter.enqueue(() => saveReadingProgress(payload), chapterKey);
    } else if (status === 'unauthenticated') pendingServer.current = null;
  }, [status, chapterKey, initializedKey]);
  return { percent, restored, capture, navigate };
}
