import type { UploadStatus, UploadState } from "./contracts";

type StatusUpload = {
  id: string; state: string; expectedPages: number; revisionVersion: number;
  errorCode: string | null; expiresAt: Date; sourceName: string; sourceBytes: number;
  sourceSha256?: string | null; processingProfile?: string | null; keepSource?: boolean;
  sourceReviewedAt?: Date | null; sourceDeleteAfter?: Date | null; sourceDeletedAt?: Date | null; sourceDeletingAt?: Date | null;
  revision?: { version: number };
  assets: { pageIndex: number; readyAt: Date | null; bytes: number }[];
};
export function toUploadStatus(upload: StatusUpload): UploadStatus {
  const ready = upload.assets.filter(asset => asset.pageIndex >= 0 && asset.readyAt);
  return {
    uploadId: upload.id, state: upload.state as UploadState, expectedPages: upload.expectedPages,
    readyPages: ready.length, readyPageIndices: ready.map(asset => asset.pageIndex).sort((a, b) => a - b),
    pageBytes: ready.reduce((sum, asset) => sum + asset.bytes, 0),
    sourceReady: !upload.sourceDeletedAt && upload.assets.some(asset => asset.pageIndex === -1 && asset.readyAt),
    revisionVersion: upload.revision?.version ?? upload.revisionVersion,
    errorCode: upload.errorCode, expiresAt: upload.expiresAt.toISOString(),
    sourceName: upload.sourceName, sourceBytes: upload.sourceBytes,
    sourceSha256: upload.sourceSha256 ?? null, processingProfile: upload.processingProfile ?? null,
    keepSource: upload.keepSource ?? true,
    sourceReviewedAt: upload.sourceReviewedAt?.toISOString() ?? null,
    sourceDeleteAfter: upload.sourceDeleteAfter?.toISOString() ?? null,
    sourceDeletedAt: upload.sourceDeletedAt?.toISOString() ?? null,
    sourceDeletingAt: upload.sourceDeletingAt?.toISOString() ?? null,
  };
}
