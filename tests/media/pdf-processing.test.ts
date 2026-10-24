import { expect, test } from "bun:test";
import { getProcessingProfile, getRenderDimensions, simpleRasterScale } from "../../src/lib/media/pdf-processing";

const ops = { dependency: 1, save: 10, restore: 11, transform: 12, paintImageXObject: 85, paintInlineImageXObject: 86 };
const viewport = { width: 528, height: 792, transform: [1, 0, 0, -1, 0, 792] };
function image(width = 1067, height = 1600, matrix = [528, 0, 0, 792, 0, 0]) {
  return { fnArray: [10, 12, 1, 85, 11], argsArray: [[], matrix, ["img"], ["img", width, height], []] };
}

test("balanced and high profiles have versioned export qualities", () => {
  expect(getProcessingProfile("balanced-v1").webpQuality).toBe(0.8);
  expect(getProcessingProfile("high-v1").webpQuality).toBe(0.85);
  expect(getProcessingProfile("balanced-v1").jpegQuality).toBe(0.9);
});
test("single full-page PDF.js images stop at native resolution", () => {
  const low = simpleRasterScale(image(), ops, viewport);
  expect(low).toBeCloseTo(1600 / 792);
  expect(getRenderDimensions(viewport, low).width).toBe(1066);
  expect(getRenderDimensions(viewport, simpleRasterScale(image(1400, 2100), ops, viewport))).toMatchObject({ width: 1400, height: 2100 });
});
test("composes nested matrices and handles rotated full-page images", () => {
  const list = image(1067, 1600, [264, 0, 0, 396, 0, 0]);
  list.fnArray.unshift(12); list.argsArray.unshift([2, 0, 0, 2, 0, 0]);
  expect(simpleRasterScale(list, ops, viewport)).toBeCloseTo(1600 / 792);
  const rotated = { width: 792, height: 528, transform: [0, 1, 1, 0, 0, 0] };
  expect(getRenderDimensions(rotated, simpleRasterScale(image(), ops, rotated))).toMatchObject({ width: 1440, height: 960 });
});
test("accepts PDF.js argumentless save/restore operators and inline image metadata", () => {
  const list = { fnArray: [10, 12, 86, 11], argsArray: [null, [528, 0, 0, 792, 0, 0], [{ width: 1067, height: 1600 }], null] };
  expect(simpleRasterScale(list, ops, viewport)).toBeCloseTo(1600 / 792);
});
test("real supplied first-page fractional matrix keeps its native 1067 by 1600 pixels", () => {
  // Captured from PDF.js 6.4.299, not reconstructed from image aspect ratio.
  const actualViewport = { width: 528.165, height: 792, transform: [1, 0, 0, -1, 0, 792] };
  const list = { fnArray: [10, 12, 1, 85, 11], argsArray: [null, [528.16498, 0, 0, 791.99994, 0, 0.00003], ["img_p0_1"], ["img_p0_1", 1067, 1600], null] };
  expect(getRenderDimensions(actualViewport, simpleRasterScale(list, ops, actualViewport))).toMatchObject({ width: 1067, height: 1600 });
});
test("mixed, partial, skewed, malformed and uncertain pages keep default rendering", () => {
  const text = image(); text.fnArray.push(44); text.argsArray.push([]);
  const duplicate = image(); duplicate.fnArray.push(85); duplicate.argsArray.push(["img", 1067, 1600]);
  const invalid = image(); invalid.fnArray.unshift(11); invalid.argsArray.unshift([]);
  for (const list of [text, duplicate, invalid, image(100, 100, [200, 0, 0, 200, 0, 0]), image(100, 100, [528, 2, 0, 792, 0, 0]), image(0, 1600)]) {
    expect(simpleRasterScale(list, ops, viewport)).toBeNull();
    expect(getRenderDimensions(viewport, simpleRasterScale(list, ops, viewport))).toMatchObject({ width: 1440, height: 2160 });
  }
});
test("dimensions preserve aspect and enforce pixel and edge limits", () => {
  expect(getRenderDimensions({ width: 600, height: 900 })).toMatchObject({ width: 1440, height: 2160 });
  for (const height of [1, 100000, 10000000]) {
    const result = getRenderDimensions({ width: 1, height });
    expect(result.width * result.height).toBeLessThanOrEqual(16_777_216);
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(16000);
  }
  for (const width of [0, NaN, Infinity, -1]) expect(() => getRenderDimensions({ width, height: 10 })).toThrow();
});
