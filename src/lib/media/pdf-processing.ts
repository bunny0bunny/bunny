/** Browser-safe policy shared by the upload UI and renderer. */
export type ProcessingProfile = "balanced-v1" | "high-v1";

export function getProcessingProfile(profile: ProcessingProfile) {
  return { webpQuality: profile === "high-v1" ? 0.85 : 0.8, jpegQuality: 0.9 };
}

type Matrix = number[];
type Viewport = { width: number; height: number; transform: number[] };
type Operators = { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> };
type ImageOps = { dependency: number; save: number; restore: number; transform: number; paintImageXObject: number; paintInlineImageXObject: number };

function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
function validMatrix(value: unknown): value is Matrix {
  return Array.isArray(value) && value.length === 6 && value.every(v => typeof v === "number" && Number.isFinite(v));
}

/** Only recognize a single axis-aligned full-page image. Unknown drawing, text,
 * masks, annotations and optimizer groups deliberately keep normal resolution.
 * PDF.js image operators draw a unit square using the current transform; their
 * width/height arguments are pixel dimensions, not PDF page dimensions. */
export function simpleRasterScale(list: Operators, ops: ImageOps, viewport: Viewport): number | null {
  if (!validMatrix(viewport.transform) || list.fnArray.length !== list.argsArray.length) return null;
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let result: number | null = null;
  for (let i = 0; i < list.fnArray.length; i++) {
    const op = list.fnArray[i], args = list.argsArray[i];
    if (op === ops.dependency) continue;
    if (op === ops.save) { stack.push(matrix); continue; }
    if (op === ops.restore) { if (!stack.length) return null; matrix = stack.pop()!; continue; }
    if (!Array.isArray(args)) return null;
    if (op === ops.transform) { if (!validMatrix(args)) return null; matrix = multiply(matrix, args); continue; }
    if (op !== ops.paintImageXObject && op !== ops.paintInlineImageXObject) return null;
    if (result !== null) return null;
    const inline = args[0] as { width?: number; height?: number } | null;
    const width = op === ops.paintImageXObject ? args[1] : inline?.width;
    const height = op === ops.paintImageXObject ? args[2] : inline?.height;
    if (typeof width !== "number" || typeof height !== "number" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return null;
    const m = multiply(viewport.transform, matrix);
    // Reject skew/oblique placement, even if its bounding box fills the page.
    const epsilon = 0.0001;
    if (!m.every(Number.isFinite) || !((Math.abs(m[1]) < epsilon && Math.abs(m[2]) < epsilon) || (Math.abs(m[0]) < epsilon && Math.abs(m[3]) < epsilon))) return null;
    const xs = [m[4], m[4]+m[0], m[4]+m[2], m[4]+m[0]+m[2]];
    const ys = [m[5], m[5]+m[1], m[5]+m[3], m[5]+m[1]+m[3]];
    if (Math.abs(Math.min(...xs)) > epsilon || Math.abs(Math.min(...ys)) > epsilon || Math.abs(Math.max(...xs)-viewport.width) > epsilon || Math.abs(Math.max(...ys)-viewport.height) > epsilon) return null;
    result = Math.min(width / Math.hypot(m[0], m[1]), height / Math.hypot(m[2], m[3]));
    if (!Number.isFinite(result) || result <= 0) return null;
  }
  return stack.length ? null : result;
}

export function getRenderDimensions(viewport: { width: number; height: number }, rasterScale?: number | null) {
  const { width, height } = viewport;
  if (![width, height].every(v => Number.isFinite(v) && v > 0)) throw new Error("أبعاد الصفحة غير صالحة.");
  let scale = Math.min(1440 / width, 16000 / Math.max(width, height), Math.sqrt(16_777_216 / width / height));
  if (rasterScale != null && Number.isFinite(rasterScale) && rasterScale > 0) scale = Math.min(scale, rasterScale);
  return { scale, width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
