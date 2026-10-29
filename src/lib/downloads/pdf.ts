/** Image-only PDF output. Inputs must be the browser's RGB JPEG encoder output. */
const encoder = new TextEncoder();
const encode = (value: string) => encoder.encode(value);
export const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;

export function pageTiles(width: number, height: number) {
  if (![width, height].every(v => Number.isSafeInteger(v) && v > 0 && v <= 16000) || width * height > 16_777_216) throw new Error('invalid_image');
  const scale = Math.min(1, 1440 / width);
  const sourceTileHeight = Math.max(1, Math.floor(4096 / scale));
  const tiles: { sourceY: number; sourceHeight: number; width: number; height: number }[] = [];
  for (let y = 0; y < height; y += sourceTileHeight) {
    const sourceHeight = Math.min(sourceTileHeight, height - y);
    tiles.push({ sourceY: y, sourceHeight, width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(sourceHeight * scale)) });
  }
  return tiles;
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new Error('invalid_image');
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i++] !== 255) throw new Error('invalid_image');
    while (bytes[i] === 255) i++;
    const marker = bytes[i++];
    if (marker === 218 || marker === 217) break;
    const size = (bytes[i] << 8) | bytes[i + 1];
    if (size < 2 || i + size > bytes.length) throw new Error('invalid_image');
    if ([192, 193, 194].includes(marker)) {
      if (size < 17 || bytes[i + 2] !== 8 || bytes[i + 7] !== 3) throw new Error('invalid_image');
      return { height: (bytes[i + 3] << 8) | bytes[i + 4], width: (bytes[i + 5] << 8) | bytes[i + 6] };
    }
    i += size;
  }
  throw new Error('invalid_image');
}

/** Compressed pages accumulate as Blob parts; decoded bitmaps never accumulate. */
export class ImagePdf {
  private parts: BlobPart[] = [];
  private offsets: number[] = [0];
  private size = 0;
  private count = 0;
  private finished = false;
  constructor(private readonly maximumBytes = MAX_DOWNLOAD_BYTES) {
    this.append(encode('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n'));
  }
  private append(bytes: Uint8Array) {
    if (this.size + bytes.byteLength > this.maximumBytes) throw new Error('too_large');
    // Own the array: callers may release/reuse their input after addJpeg returns.
    this.parts.push(new Uint8Array(bytes));
    this.size += bytes.byteLength;
  }
  private object(id: number, body: string, stream?: Uint8Array) {
    this.offsets[id] = this.size;
    this.append(encode(`${id} 0 obj\n${body}${stream ? '\nstream\n' : '\nendobj\n'}`));
    if (stream) { this.append(stream); this.append(encode('\nendstream\nendobj\n')); }
  }
  addJpeg(bytes: Uint8Array, width: number, height: number) {
    if (this.finished || this.count >= 800) throw new Error('too_large');
    if (![width, height].every(v => Number.isSafeInteger(v) && v > 0 && v <= 4096)) throw new Error('invalid_image');
    const dimensions = jpegDimensions(bytes);
    if (dimensions.width !== width || dimensions.height !== height) throw new Error('invalid_image');
    const page = 3 + this.count * 3, image = page + 1, content = page + 2;
    const scale = Math.min(1, 612 / width);
    const w = Number((width * scale).toFixed(4)), h = Number((height * scale).toFixed(4));
    const draw = encode(`q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`);
    this.object(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`);
    this.object(image, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.byteLength} >>`, bytes);
    this.object(content, `<< /Length ${draw.byteLength} >>`, draw);
    this.count++;
  }
  finish(): Blob {
    if (!this.count || this.finished) throw new Error('invalid_pdf');
    this.object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    this.object(2, `<< /Type /Pages /Count ${this.count} /Kids [${Array.from({ length: this.count }, (_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
    const xref = this.size;
    const rows = this.offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    this.append(encode(`xref\n0 ${this.offsets.length}\n0000000000 65535 f \n${rows}trailer\n<< /Size ${this.offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
    this.finished = true;
    const blob = new Blob(this.parts, { type: 'application/pdf' });
    this.parts = [];
    return blob;
  }
}
