import { expect, test } from 'bun:test';
import sharp from 'sharp';
import { ImagePdf, pageTiles } from '../../src/lib/downloads/pdf';

const jpeg = () => sharp({ create: { width: 20, height: 30, channels: 3, background: '#ffeeaa' } }).jpeg().toBuffer();

test('PDF has valid ordered objects and byte-accurate cross references', async () => {
  const writer = new ImagePdf();
  const bytes = await jpeg();
  writer.addJpeg(bytes, 20, 30);
  writer.addJpeg(bytes, 20, 30);
  const blob = writer.finish();
  const result = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder('latin1').decode(result);
  expect(blob.type).toBe('application/pdf');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text).toContain('/Count 2');
  expect(text).toContain('/ColorSpace /DeviceRGB');
  const xrefAt = Number(text.match(/startxref\n(\d+)\n/)?.[1]);
  expect(new TextDecoder().decode(result.slice(xrefAt, xrefAt + 4))).toBe('xref');
  const entries = text.slice(xrefAt).split('\n');
  const count = Number(entries[1].split(' ')[1]);
  for (let id = 1; id < count; id++) {
    const offset = Number(entries[id + 2].slice(0, 10));
    expect(new TextDecoder().decode(result.slice(offset, offset + `${id} 0 obj`.length))).toBe(`${id} 0 obj`);
  }
});

test('PDF rejects invalid JPEGs, dimension mismatches, empty output and size overflow', async () => {
  const bytes = await jpeg();
  expect(() => new ImagePdf().finish()).toThrow();
  expect(() => new ImagePdf().addJpeg(new Uint8Array([1, 2, 3]), 20, 30)).toThrow();
  expect(() => new ImagePdf().addJpeg(bytes, 21, 30)).toThrow();
  expect(() => new ImagePdf(100).addJpeg(bytes, 20, 30)).toThrow('too_large');
});

test('long webtoon images split into contiguous bounded PDF pages without losing rows', () => {
  const tiles = pageTiles(1024, 16000);
  expect(tiles.map(t => t.sourceHeight).reduce((a, b) => a + b, 0)).toBe(16000);
  expect(tiles.map(t => t.sourceY)).toEqual([0, 4096, 8192, 12288]);
  expect(tiles.every(t => t.height <= 4096 && t.width === 1024)).toBe(true);
  expect(pageTiles(16000, 1000)[0]).toEqual({ sourceY: 0, sourceHeight: 1000, width: 1440, height: 90 });
  for (const dims of [[0, 20], [20000, 20], [4096, 4097], [NaN, 20]]) {
    expect(() => pageTiles(dims[0], dims[1])).toThrow();
  }
});
