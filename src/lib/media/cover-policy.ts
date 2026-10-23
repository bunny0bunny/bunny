export const MAX_COVER_BYTES = 2 * 1024 * 1024;
type Result = { ok: boolean; error?: string; data?: unknown };
export type CoverTransaction = {
  role: string;
  findSeries(id: string): Promise<{ coverPath: string } | null>;
  reserve(): Promise<boolean>;
  replaceSeries(id: string, previous: string, next: string): Promise<boolean>;
};
type Dependencies = {
  transaction(work: (tx: CoverTransaction) => Promise<Result>): Promise<Result>;
  inspect(bytes: Uint8Array): { mime: string; width: number; height: number };
  storage: { putPage(key: string, bytes: Uint8Array, mime: 'image/webp' | 'image/jpeg'): Promise<unknown>; deleteObject(key: string): Promise<void> };
  newId(): string;
  prefix: string;
};
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,95}$/;
const filePattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,95}\.(?:webp|jpg)$/;
export function coverObjectKey(seriesId: string, file: string, prefix: string) {
  if (!idPattern.test(seriesId) || !filePattern.test(file) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(prefix)) throw new Error('Invalid cover key');
  return `media/${prefix}/covers-${seriesId}/${file}`;
}
export function currentCoverKey(seriesId: string, file: string, current: string, prefix: string): string | null {
  if (!idPattern.test(seriesId) || !filePattern.test(file) || current !== `/api/covers/${seriesId}/${file}`) return null;
  return coverObjectKey(seriesId, file, prefix);
}
/** Stream bound is enforced even when a client lies about Content-Length. */
export async function readCoverBytes(request: Request, expected: number) {
  if (!Number.isSafeInteger(expected) || expected < 1 || expected > MAX_COVER_BYTES || !request.body) throw new Error('invalid_length');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let count = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; count += part.value.length; if (count > expected) throw new Error('invalid_length'); chunks.push(part.value); }
    if (count !== expected) throw new Error('invalid_length');
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(count); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export async function replaceSeriesCover(input: { seriesId: string; previous: string; consent: string; bytes: Uint8Array; mime: string }, deps: Dependencies): Promise<Result> {
  if (!idPattern.test(input.seriesId) || typeof input.previous !== 'string' || input.previous.length > 2048 || input.consent !== 'public-cover') return { ok: false, error: 'invalid_input' };
  if (!['image/webp', 'image/jpeg'].includes(input.mime) || input.bytes.length < 1 || input.bytes.length > MAX_COVER_BYTES) return { ok: false, error: 'invalid_media' };
  try {
    const image = deps.inspect(input.bytes);
    if (image.mime !== input.mime || image.width < 1 || image.height < 1 || image.width > 1200 || image.height > 1800 || image.width * image.height > 2_160_000) return { ok: false, error: 'invalid_media' };
  } catch { return { ok: false, error: 'invalid_media' }; }
  const check = await deps.transaction(async tx => {
    if (tx.role !== 'admin') return { ok: false, error: 'forbidden' };
    const series = await tx.findSeries(input.seriesId);
    if (!series) return { ok: false, error: 'not_found' };
    if (series.coverPath !== input.previous) return { ok: false, error: 'conflict' };
    return await tx.reserve() ? { ok: true } : { ok: false, error: 'rate_limit' };
  });
  if (!check.ok) return check;
  const file = `${deps.newId()}.${input.mime === 'image/webp' ? 'webp' : 'jpg'}`;
  const key = coverObjectKey(input.seriesId, file, deps.prefix);
  const coverPath = `/api/covers/${input.seriesId}/${file}`;
  try { await deps.storage.putPage(key, input.bytes, input.mime as 'image/webp' | 'image/jpeg'); }
  catch { return { ok: false, error: 'storage_failed' }; }
  // Re-check the actor inside the final transaction after the storage await.
  // If commit outcome is uncertain, retain the object: it may already be current.
  const saved = await deps.transaction(async tx => {
    if (tx.role !== 'admin') return { ok: false, error: 'forbidden' };
    if (!await tx.replaceSeries(input.seriesId, input.previous, coverPath)) return { ok: false, error: 'conflict' };
    return { ok: true, data: { coverPath } };
  });
  if (!saved.ok) await deps.storage.deleteObject(key).catch(() => {}); // Only this request's unreferenced object.
  return saved;
}
