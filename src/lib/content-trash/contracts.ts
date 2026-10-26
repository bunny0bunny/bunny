export type TrashKind = 'series' | 'chapter';
export type TrashState = 'trashed' | 'purging' | 'purged' | 'restored';
export type TrashPreview = {
  kind: TrashKind; id: string; title: string; confirmation: string; updatedAt: string;
  chapterCount: number; publishedCount: number; uploadCount: number; bytes: number;
};
export type TrashItem = {
  id: string; kind: TrashKind; entityId: string; seriesId: string | null; title: string;
  deletedByName?: string | null; deletedAt: string; purgeAfter: string; state: TrashState; version: number;
  chapterCount: number; bytes: number; purgeNotBefore?: string | null; errorCode: string | null; parentUnavailable: boolean;
  filesDeleted?: number; filesTotal?: number; restoredAt?: string | null; purgedAt?: string | null; lastActionByName?: string | null;
};
export type TrashResult = { ok: boolean; error?: string; id?: string };
export type MoveToTrashInput = {kind: TrashKind; id: string; expectedUpdatedAt: string; confirmation: string};
export type RestoreTrashInput = {id: string; expectedVersion: number};
export type PermanentDeleteInput = RestoreTrashInput & {confirmation: string};
