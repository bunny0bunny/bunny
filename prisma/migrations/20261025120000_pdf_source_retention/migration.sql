-- Existing uploads deliberately remain permanent; no dates are backfilled.
ALTER TABLE "ChapterUpload"
  ADD COLUMN "sourceSha256" TEXT,
  ADD COLUMN "processingProfile" TEXT,
  ADD COLUMN "keepSource" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sourceReviewedAt" TIMESTAMP(3),
  ADD COLUMN "sourceDeleteAfter" TIMESTAMP(3),
  ADD COLUMN "sourceDeletedAt" TIMESTAMP(3),
  ADD COLUMN "sourceDeletingAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);
CREATE INDEX "ChapterUpload_source_retention_idx"
  ON "ChapterUpload"("state", "keepSource", "sourceDeletedAt", "sourceDeleteAfter");
