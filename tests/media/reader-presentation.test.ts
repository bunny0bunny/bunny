import { describe, expect, test } from 'bun:test';
import { createProgressWriter, imagePosition, legacyImageTop, readerPositionForSave, readingViewport, restoreImageTop, restoreReaderAnchor, resolvePresentation, shouldInitializeReader, shouldReanchorWidth, shouldFlushReaderPosition } from '../../src/lib/reader-presentation';
describe('image-relative reader progress', () => {
  test('visible single-page completion can flush on exit without synthetic restoration writes', () => {
    expect(shouldFlushReaderPosition(false, true, false, false)).toBe(true);
    expect(shouldFlushReaderPosition(false, false, false, false)).toBe(false);
    expect(shouldFlushReaderPosition(true, true, true, false)).toBe(false);
    expect(shouldFlushReaderPosition(true, true, true, true)).toBe(true);
  });
  const images = [{ top: 80, height: 1000 }, { top: 1088, height: 2000 }];
  test('ignores gaps, comments and chrome and requires the final image bottom', () => {
    const p = imagePosition(images, 1088, 600);
    expect(p.pageIndex).toBe(1); expect(p.pageOffset).toBe(0);
    expect(p.percent).toBeCloseTo(1600 / 3000 * 100);
    expect(p.completed).toBe(false);
    expect(imagePosition(images, 2488, 600).completed).toBe(true);
  });
  test('one tall image does not complete merely by opening it', () => {
    expect(imagePosition([{ top: 80, height: 3000 }], 0, 800).completed).toBe(false);
    expect(imagePosition([{ top: 80, height: 3000 }], 2280, 800).percent).toBe(100);
  });
  test('resize retains fractional anchor and old indexes clamp', () => {
    expect(restoreImageTop(images, 1, .5)).toBe(2088);
    expect(restoreImageTop(images, 99, .5)).toBe(2088);
    expect(restoreImageTop([], 0, 0)).toBe(0);
  });
  test('valid local layout wins; reset and invalid values use publisher then paged', () => {
    expect(resolvePresentation('continuous', 'paged')).toBe('continuous');
    expect(resolvePresentation(null, 'continuous')).toBe('continuous');
    expect(resolvePresentation('invalid', 'invalid')).toBe('paged');
  });
  test('comments alone cannot establish completion; near-bottom progress remains below 99', () => {
    expect(imagePosition(images, 4000, 600).completed).toBe(false);
    expect(imagePosition(images, 2480, 600).percent).toBeLessThan(99);
    expect(imagePosition([], 0, 800).percent).toBe(0);
    expect(restoreImageTop(images, -1, -4)).toBe(80);
    expect(restoreImageTop(images, 1, 9)).toBe(3088);
  });
  test('legacy fallback is conservative and excludes post-content document height', () => {
    expect(legacyImageTop(images, 100, 600)).toBeLessThan(2488);
    expect(legacyImageTop([], 100, 600)).toBe(0);
  });
  test('server writes serialize and coalesce to the latest position', async () => {
    const writer = createProgressWriter();
    const calls: number[] = [];
    let release!: () => void;
    writer.enqueue(async () => { calls.push(1); await new Promise<void>(resolve => { release = resolve; }); });
    writer.enqueue(async () => { calls.push(2); });
    writer.enqueue(async () => { calls.push(3); });
    expect(calls).toEqual([1]);
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(calls).toEqual([1, 3]);
  });
  test('cancel drops queued chapter work, including after a rejected request', async () => {
    const writer = createProgressWriter();
    const calls: number[] = [];
    let release!: () => void;
    writer.enqueue(async () => { await new Promise<void>(resolve => { release = resolve; }); throw Error('offline'); });
    writer.enqueue(async () => { calls.push(2); });
    writer.cancel(); release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(calls).toEqual([]);
    writer.enqueue(async () => { calls.push(3); });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(calls).toEqual([3]);
  });
  test('coalescing retains flushed positions from different chapters', async () => {
    const writer = createProgressWriter();
    const calls: string[] = [];
    let release!: () => void;
    writer.enqueue(async () => { await new Promise<void>(resolve => { release = resolve; }); }, 'manga:series:1');
    writer.enqueue(async () => { calls.push('old chapter'); }, 'manga:series:1');
    writer.enqueue(async () => { calls.push('superseded'); }, 'manga:series:2');
    writer.enqueue(async () => { calls.push('new chapter'); }, 'manga:series:2');
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(calls).toEqual(['old chapter', 'new chapter']);
  });
  test('completion waits until the last image bottom clears the fixed footer', () => {
    const viewport = readingViewport(800, [{ top: 0, bottom: 74 }], [{ top: 700, bottom: 800 }]);
    expect(viewport).toEqual({ top: 74, bottom: 700, height: 626 });
    const content = [{ top: 80, height: 1000 }];
    expect(imagePosition(content, 280, 800).completed).toBe(true);
    expect(imagePosition(content, 280 + viewport.top, viewport.height).completed).toBe(false);
    expect(imagePosition(content, 380 + viewport.top, viewport.height).completed).toBe(true);
  });
  test('first lines and fractional anchors restore below the header, including after width changes', () => {
    const content = [{ top: 80, height: 1000 }];
    expect(restoreReaderAnchor(content, 0, 0, 74)).toBe(6);
    const top = restoreReaderAnchor(content, 0, .5, 74);
    expect(top).toBe(506);
    expect(imagePosition(content, top + 74, 626).pageOffset).toBe(.5);
    const resized = [{ top: 80, height: 2000 }];
    const resizedTop = restoreReaderAnchor(resized, 0, .5, 100);
    expect(resizedTop).toBe(980);
    expect(imagePosition(resized, resizedTop + 100, 600).pageOffset).toBe(.5);
  });
  test('translated chrome leaves the full viewport; overlapping chrome yields no visible progress', () => {
    expect(readingViewport(800, [{ top: -74, bottom: 0 }], [{ top: 800, bottom: 900 }])).toEqual({ top: 0, bottom: 800, height: 800 });
    const covered = readingViewport(500, [{ top: 0, bottom: 300 }], [{ top: 200, bottom: 500 }]);
    expect(covered.height).toBe(0);
    expect(imagePosition([{ top: 0, height: 300 }], 300, covered.height)).toEqual({ pageIndex: 0, pageOffset: 0, percent: 0, completed: false });
  });
  test('unmount saves the last valid captured position, never an empty-DOM position or another chapter', () => {
    const position = { pageIndex: 7, pageOffset: .65, percent: 83, completed: false };
    const cached = { key: 'manga:series:1', position };
    expect(readerPositionForSave(null, cached, cached.key)).toEqual(position);
    expect(readerPositionForSave(null, cached, 'manga:series:2')).toBeNull();
    expect(readerPositionForSave(null, null, cached.key)).toBeNull();
    const current = { ...position, percent: 85 };
    expect(readerPositionForSave(current, cached, cached.key)).toEqual(current);
  });
  test('a live chapter does not reinitialize on refreshed props; a different canonical chapter does', () => {
    expect(shouldInitializeReader(null, 'manga:series:1', false)).toBe(true);
    expect(shouldInitializeReader('manga:series:1', 'manga:series:1', false)).toBe(false);
    expect(shouldInitializeReader('manga:series:1', 'manga:series:2', false)).toBe(true);
    expect(shouldInitializeReader(null, 'manga:series:1', true)).toBe(false);
  });
  test('height-only browser changes do not request a scroll reanchor', () => {
    expect(shouldReanchorWidth(390, 390)).toBe(false);
    expect(shouldReanchorWidth(390, 844)).toBe(true);
  });
});
