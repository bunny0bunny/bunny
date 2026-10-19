import { expect, test } from "bun:test";
import { MAX_PAGE_BYTES, MAX_SOURCE_BYTES, sniffPage, validatePdfPrefix, validateSourceLength } from "../../src/lib/media/formats";

// A complete minimal VP8L container; dimension bits can be changed independently.
function webp(width = 2, height = 3) {
  const bytes = new Uint8Array(26);
  bytes.set(new TextEncoder().encode("RIFF"));
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 18, true);
  bytes.set(new TextEncoder().encode("WEBPVP8L"), 8);
  view.setUint32(16, 6, true);
  bytes[20] = 0x2f;
  view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  return bytes;
}
function jpeg(width = 2, height = 3) {
  return Uint8Array.from([255,216,255,192,0,11,8,height >> 8,height & 255,width >> 8,width & 255,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,255,217]);
}

test("sniffs actual WebP/JPEG headers and dimensions without trusting submitted MIME", () => {
  expect(sniffPage(webp())).toEqual({ mime: "image/webp", width: 2, height: 3 });
  expect(sniffPage(jpeg())).toEqual({ mime: "image/jpeg", width: 2, height: 3 });
});
test("accepts complete browser-compatible lossy WebP and JPEG fixtures", () => {
  const actualWebp = Buffer.from("UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAMAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=", "base64");
  const actualJpeg = Buffer.from("/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAADAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABykX//Z", "base64");
  expect(sniffPage(actualWebp)).toEqual({ mime: "image/webp", width: 2, height: 3 });
  expect(sniffPage(actualJpeg)).toEqual({ mime: "image/jpeg", width: 2, height: 3 });
});
test("rejects HTML, SVG, truncated containers and invalid JPEG dimensions", () => {
  for (const input of [new TextEncoder().encode("<svg></svg>"), new TextEncoder().encode("<!doctype html>"), webp().slice(0,-1), jpeg().slice(0,-1), jpeg(0,3), jpeg(16001,1)]) {
    expect(() => sniffPage(input)).toThrow();
  }
});
test("enforces encoded byte, pixel and edge limits", () => {
  expect(() => sniffPage(new Uint8Array(MAX_PAGE_BYTES + 1))).toThrow();
  expect(() => sniffPage(webp(5000,5000))).toThrow();
  expect(() => sniffPage(webp(16001,1))).toThrow();
  expect(sniffPage(webp(4096,4096)).width).toBe(4096);
});
test("rejects malformed RIFF chunk lengths and JPEG marker lengths", () => {
  const brokenWebp = webp(); brokenWebp[16] = 100;
  const brokenJpeg = jpeg(); brokenJpeg[5] = 255;
  expect(() => sniffPage(brokenWebp)).toThrow();
  expect(() => sniffPage(brokenJpeg)).toThrow();
});
test("PDF checks are bounded length and exact header checks, not full parsing", () => {
  expect(() => validateSourceLength(MAX_SOURCE_BYTES)).not.toThrow();
  for (const length of [0,4,MAX_SOURCE_BYTES+1,NaN,1.5]) expect(() => validateSourceLength(length)).toThrow();
  expect(() => validatePdfPrefix(new TextEncoder().encode("%PDF-1.7"))).not.toThrow();
  expect(() => validatePdfPrefix(new TextEncoder().encode("<html>"))).toThrow();
});
