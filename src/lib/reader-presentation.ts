export type Presentation = 'paged' | 'continuous';
export function shouldFlushReaderPosition(dirty: boolean, observedCompletion: boolean, restoring: boolean, cachedOnly: boolean) {
  return (dirty || observedCompletion) && (cachedOnly || !restoring);
}
export type ImageGeometry = { top: number; height: number };
export type ViewportRect = { top: number; bottom: number };
export function readingViewport(height: number, headers: ViewportRect[] = [], footers: ViewportRect[] = []) {
  const limit = Math.max(0, height);
  const visible = (rect: ViewportRect) => rect.bottom > 0 && rect.top < limit && rect.bottom > rect.top;
  const top = Math.min(limit, Math.max(0, ...headers.filter(visible).map(rect => rect.bottom)));
  const bottom = Math.max(top, Math.min(limit, ...footers.filter(visible).map(rect => rect.top)));
  return { top, bottom, height: bottom - top };
}
export function restoreReaderAnchor(images: ImageGeometry[], index: number, offset: number, viewportTop: number) {
  return Math.max(0, restoreImageTop(images, index, offset) - viewportTop);
}
export type CapturedPosition = { pageIndex: number; pageOffset: number; percent: number; completed: boolean };
export function readerPositionForSave(current: CapturedPosition | null, cached: { key: string; position: CapturedPosition } | null, key: string) {
  return current ?? (cached?.key === key ? cached.position : null);
}
export function shouldReanchorWidth(previous: number, next: number) { return Math.abs(previous - next) >= 1; }
export function shouldInitializeReader(initializedKey: string | null, chapterKey: string, locked: boolean) {
  return !locked && initializedKey !== chapterKey;
}
export function resolvePresentation(local: unknown, publisher: unknown): Presentation {
  return local === 'paged' || local === 'continuous' ? local : publisher === 'continuous' ? 'continuous' : 'paged';
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
export function restoreImageTop(images: ImageGeometry[], index: number, offset: number) {
  const image = images[clamp(Math.floor(index), 0, images.length - 1)];
  return image ? image.top + image.height * clamp(offset, 0, 1) : 0;
}
export function imagePosition(images: ImageGeometry[], scrollTop: number, viewport: number) {
  if (!images.length || viewport <= 0) return { pageIndex: 0, pageOffset: 0, percent: 0, completed: false };
  let pageIndex = images.findIndex(image => image.top + image.height > scrollTop);
  if (pageIndex < 0) pageIndex = images.length - 1;
  const image = images[pageIndex];
  const pageOffset = clamp((scrollTop - image.top) / Math.max(1, image.height), 0, 1);
  const last = images[images.length - 1];
  // A viewport below the chapter (comments/end cards) is not evidence that its bottom was seen.
  const completed = scrollTop <= last.top + last.height && scrollTop + viewport >= last.top + last.height - 1;
  const total = images.reduce((sum, item) => sum + item.height, 0);
  const seen = images.reduce((sum, item) => sum + clamp(scrollTop + viewport - item.top, 0, item.height), 0);
  return { pageIndex, pageOffset, percent: completed ? 100 : Math.min(98.9, total ? seen / total * 100 : 0), completed };
}
export function legacyImageTop(images: ImageGeometry[], percent: number, viewport: number) {
  if (!images.length) return 0;
  // Historical document percentages cannot identify an exact image. Stay conservative.
  const first = images[0]; const last = images[images.length - 1];
  return first.top + Math.max(0, last.top + last.height - first.top - viewport) * clamp(percent, 0, 98) / 100;
}

/** One request at a time, with the latest pending position retained for each chapter. */
export function createProgressWriter() {
  let running = false;
  const pending = new Map<string, () => Promise<unknown>>();
  const drain = async () => {
    if (running) return;
    running = true;
    while (pending.size) {
      const [key, write] = pending.entries().next().value!;
      pending.delete(key);
      try { await write(); } catch { /* Local progress remains available. */ }
    }
    running = false;
  };
  return {
    enqueue(write: () => Promise<unknown>, key = 'default') { pending.set(key, write); void drain(); },
    cancel() { pending.clear(); },
  };
}
