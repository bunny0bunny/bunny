export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const LATE_WRITE_GRACE_MS = 24 * 60 * 60 * 1000;
export function validKind(value: unknown): value is 'series' | 'chapter' { return value === 'series' || value === 'chapter'; }
export function bounded(value: number | undefined, fallback: number, maximum: number) { return Number.isSafeInteger(value) && value! > 0 ? Math.min(value!, maximum) : fallback; }
export type PurgeObject = { key: string; deleted: boolean };
export function parseObjects(value: unknown): PurgeObject[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PurgeObject => Boolean(item && typeof item === 'object' && typeof item.key === 'string' && typeof item.deleted === 'boolean'));
}
