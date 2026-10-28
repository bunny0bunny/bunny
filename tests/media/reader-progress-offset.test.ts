import { expect, test } from 'bun:test';
import { isReaderProgress, selectReaderProgress } from '../../src/lib/reader-progress';

const base = { pageIndex: 2, percent: 50, updatedAt: 100 };
test('legacy progress remains valid while image offsets are optional and bounded', () => {
  expect(isReaderProgress(base)).toBe(true);
  expect(isReaderProgress({ ...base, completed: 'yes' })).toBe(false);
  for (const pageOffset of [null, 0, 0.35, 1]) expect(isReaderProgress({ ...base, pageOffset })).toBe(true);
  for (const pageOffset of [-0.1, 1.01, NaN, Infinity, '0.5']) expect(isReaderProgress({ ...base, pageOffset })).toBe(false);
});
test('malformed newer progress cannot replace a valid earlier image anchor', () => {
  const valid = { ...base, pageOffset: 0.4 };
  expect(selectReaderProgress({ ...base, pageOffset: 4, updatedAt: 200 }, valid)).toEqual(valid);
});
