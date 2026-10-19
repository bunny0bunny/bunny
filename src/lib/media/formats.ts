export const MAX_PAGE_BYTES = 6 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
export const MAX_PAGE_PIXELS = 16_777_216;
export const MAX_PAGE_EDGE = 16_000;
export type PageMime = "image/webp" | "image/jpeg";
function invalid(): never { throw new Error("Invalid or unsupported page image"); }
function dimensions(mime: PageMime, width: number, height: number) {
  if (!width || !height || width > MAX_PAGE_EDGE || height > MAX_PAGE_EDGE || width * height > MAX_PAGE_PIXELS) invalid();
  return { mime, width, height };
}
function word(bytes: Uint8Array, offset: number) { return String.fromCharCode(...bytes.subarray(offset, offset + 4)); }

function webp(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(4, true) + 8 !== bytes.length) invalid();
  let image: { mime: PageMime; width: number; height: number } | undefined;
  let canvas: { width: number; height: number } | undefined;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) invalid();
    const kind = word(bytes, offset);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (end + (length % 2) > bytes.length) invalid();
    if (kind === "VP8X") {
      if (offset !== 12 || length !== 10 || bytes[start] & 0xc3 || bytes[start + 1] || bytes[start + 2] || bytes[start + 3]) invalid();
      const uint24 = (at: number) => bytes[at] | (bytes[at+1] << 8) | (bytes[at+2] << 16);
      canvas = dimensions("image/webp", uint24(start+4)+1, uint24(start+7)+1);
    } else if (kind === "VP8L") {
      if (image || length < 6 || bytes[start] !== 0x2f) invalid();
      const bits = view.getUint32(start + 1, true);
      if (bits >>> 29) invalid();
      image = dimensions("image/webp", (bits & 0x3fff)+1, ((bits >>> 14) & 0x3fff)+1);
    } else if (kind === "VP8 ") {
      if (image || length < 11 || bytes[start] & 1 || bytes[start+3] !== 0x9d || bytes[start+4] !== 1 || bytes[start+5] !== 0x2a) invalid();
      const tag = bytes[start] | (bytes[start+1] << 8) | (bytes[start+2] << 16);
      if ((tag >>> 5) > length - 10 || ((tag >>> 1) & 7) > 3 || !(tag & 16)) invalid();
      image = dimensions("image/webp", view.getUint16(start+6, true) & 0x3fff, view.getUint16(start+8, true) & 0x3fff);
    } else if (kind === "ANIM" || kind === "ANMF") invalid();
    offset = end + (length % 2);
  }
  if (!image || (canvas && (canvas.width !== image.width || canvas.height !== image.height))) invalid();
  return image;
}

function jpeg(bytes: Uint8Array) {
  let offset = 2;
  let image: { mime: PageMime; width: number; height: number } | undefined;
  let scanned = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 255) invalid();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!image || !scanned || offset !== bytes.length) invalid();
      return image;
    }
    if (marker === undefined || marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) invalid();
    if (offset + 2 > bytes.length) invalid();
    const length = (bytes[offset] << 8) | bytes[offset+1];
    if (length < 2 || offset + length > bytes.length) invalid();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (image || length < 8 || bytes[offset+2] !== 8) invalid();
      const components = bytes[offset+7];
      if (![1,3,4].includes(components) || length !== 8 + components*3) invalid();
      image = dimensions("image/jpeg", (bytes[offset+5] << 8) | bytes[offset+6], (bytes[offset+3] << 8) | bytes[offset+4]);
    } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4,0xc8,0xcc].includes(marker)) invalid();
    if (marker === 0xda) {
      if (!image || length < 6 || !bytes[offset+2] || length !== 6 + 2*bytes[offset+2]) invalid();
      scanned = true;
      offset += length;
      const start = offset;
      while (offset < bytes.length) {
        if (bytes[offset] !== 255) { offset++; continue; }
        const next = bytes[offset+1];
        if (next === 0 || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
        break;
      }
      if (offset === start) invalid();
    } else offset += length;
  }
  return invalid();
}

/** Structural container/header validation, not a trusted pixel decode or malware scan. */
export function sniffPage(bytes: Uint8Array): { mime: PageMime; width: number; height: number } {
  if (!bytes.length || bytes.length > MAX_PAGE_BYTES) invalid();
  if (word(bytes,0) === "RIFF" && word(bytes,8) === "WEBP") return webp(bytes);
  if (bytes[0] === 255 && bytes[1] === 216) return jpeg(bytes);
  return invalid();
}
export function validateSourceLength(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 5 || bytes > MAX_SOURCE_BYTES) throw new Error("PDF source size is outside the allowed limit");
}
/** Only a prefix check; the source PDF remains untrusted and attachment-only. */
export function validatePdfPrefix(bytes: Uint8Array): void {
  if (bytes.length < 5 || ![37,80,68,70,45].every((value,index) => bytes[index] === value)) throw new Error("Invalid PDF header");
}
