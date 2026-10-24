export const SOURCE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export function sourceDeletionDate(completedAt: Date): Date { return new Date(completedAt.getTime() + SOURCE_RETENTION_MS); }
type RetentionPolicy = {
  state: string; keepSource: boolean; completedAt: Date | null;
  sourceSha256: string | null; processingProfile: string | null;
  sourceReviewedAt: Date | null; sourceDeleteAfter: Date | null; sourceDeletedAt: Date | null;
};
export function sourceDeletionEligible(upload: RetentionPolicy, now: Date): boolean {
  return upload.state === "ready" && !upload.keepSource && !!upload.completedAt &&
    /^[a-f0-9]{64}$/.test(upload.sourceSha256 ?? "") && ["balanced-v1", "high-v1"].includes(upload.processingProfile ?? "") &&
    !!upload.sourceReviewedAt && !upload.sourceDeletedAt && !!upload.sourceDeleteAfter &&
    upload.sourceDeleteAfter.getTime() <= now.getTime() && sourceDeletionDate(upload.completedAt).getTime() <= now.getTime();
}
