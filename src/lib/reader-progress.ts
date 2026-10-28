export type ReaderProgress = { pageIndex: number; percent: number; updatedAt: number; pageOffset?: number | null; completed?: boolean };

export function isReaderProgress(value: unknown): value is ReaderProgress {
  if (!value || typeof value !== "object") return false;
  const p = value as ReaderProgress;
  return Number.isSafeInteger(p.pageIndex) && p.pageIndex >= 0 &&
    typeof p.percent === "number" && Number.isFinite(p.percent) && p.percent >= 0 && p.percent <= 100 &&
    typeof p.updatedAt === "number" && Number.isFinite(p.updatedAt) && p.updatedAt > 0 &&
    (p.pageOffset == null || (typeof p.pageOffset === 'number' && Number.isFinite(p.pageOffset) && p.pageOffset >= 0 && p.pageOffset <= 1)) &&
    (p.completed === undefined || typeof p.completed === 'boolean');
}

export function selectReaderProgress(local: unknown, server: unknown): ReaderProgress | null {
  const guest = isReaderProgress(local) ? local : null;
  const signedIn = isReaderProgress(server) ? server : null;
  if (!guest) return signedIn;
  if (!signedIn) return guest;
  return signedIn.updatedAt >= guest.updatedAt ? signedIn : guest;
}

/** Wait for fonts and a stable document range, then restore once. Images have
 * reserved aspect ratios. Work is bounded and fully cancelled on unmount. */
export function restoreReaderScroll(percent: number, onReady: (actualPercent: number) => void): () => void {
  let cancelled = false;
  let frame = 0;
  let fontTimer: ReturnType<typeof setTimeout>;
  const fontReady = new Promise<void>(resolve => {
    fontTimer = setTimeout(resolve, 1000);
    document.fonts.ready.then(() => { clearTimeout(fontTimer); resolve(); });
  });
  void fontReady.then(() => {
    if (cancelled) return;
    const deadline = performance.now() + 1500;
    let previousRange = -1;
    let stableFrames = 0;
    const settle = () => {
      if (cancelled) return;
      const el = document.documentElement;
      const range = Math.max(0, el.scrollHeight - el.clientHeight);
      stableFrames = range === previousRange ? stableFrames + 1 : 0;
      previousRange = range;
      if (stableFrames < 3 && performance.now() < deadline) { frame = requestAnimationFrame(settle); return; }
      window.scrollTo({ top: range * percent / 100, behavior: "instant" });
      // Drain the restoration scroll event before allowing persistence.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (!cancelled) onReady(range > 0 ? el.scrollTop / range * 100 : 0);
        });
      });
    };
    frame = requestAnimationFrame(settle);
  });
  return () => { cancelled = true; clearTimeout(fontTimer); cancelAnimationFrame(frame); };
}
