/** Browser-safe protocol; no server dependencies. */
export const PDF_UPLOAD_LIMITS = { sourceBytes: 30 * 1024 * 1024, pageBytes: 6 * 1024 * 1024, pages: 200, aggregateBytes: 200 * 1024 * 1024 } as const;
export type StartUploadInput = { revisionId: string; expectedVersion: number; sourceName: string; sourceBytes: number; pageCount: number };
export type UploadState = "uploading" | "ready" | "failed" | "cancelled" | "superseded";
export type UploadStatus = { uploadId: string; state: UploadState; expectedPages: number; readyPages: number; sourceReady: boolean; revisionVersion: number; errorCode: string | null; expiresAt: string };
export type UploadError = { ok: false; error: string; code: string };
export type StartUploadResponse = { ok: true; uploadId: string; revisionVersion: number } | UploadError;
export type UploadStatusResponse = { ok: true; status: UploadStatus } | UploadError;
