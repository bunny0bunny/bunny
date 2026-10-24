/** Browser-safe protocol; no server dependencies. */
export const PDF_UPLOAD_LIMITS = { sourceBytes: 30 * 1024 * 1024, pageBytes: 6 * 1024 * 1024, pages: 200, aggregateBytes: 200 * 1024 * 1024 } as const;
export type StartUploadInput = { revisionId: string; expectedVersion: number; sourceName: string; sourceBytes: number; pageCount: number; sourceSha256?: string; processingProfile?: "balanced-v1" | "high-v1"; keepSource?: boolean };
export type ResumeUploadInput = { expectedVersion: number; sourceSha256: string; sourceBytes: number; pageCount: number; processingProfile: "balanced-v1" | "high-v1" };
export type UploadState = "uploading" | "ready" | "failed" | "cancelled" | "superseded";
export type UploadStatus = { uploadId: string; state: UploadState; expectedPages: number; readyPages: number; sourceReady: boolean; revisionVersion: number; errorCode: string | null; expiresAt: string; sourceName: string; sourceBytes: number; sourceSha256: string | null; processingProfile: string | null; readyPageIndices: number[]; pageBytes: number; keepSource: boolean; sourceReviewedAt: string | null; sourceDeleteAfter: string | null; sourceDeletedAt: string | null; sourceDeletingAt: string | null };
export type UploadError = { ok: false; error: string; code: string };
export type StartUploadResponse = { ok: true; uploadId: string; revisionVersion: number } | UploadError;
export type UploadStatusResponse = { ok: true; status: UploadStatus } | UploadError;
