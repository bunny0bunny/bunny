-- Additive private-media lifecycle. Existing chapter pages/revision snapshots remain unchanged.
CREATE TYPE "ChapterUploadState" AS ENUM ('uploading', 'ready', 'failed', 'cancelled', 'superseded');
ALTER TABLE "ChapterRevision" ADD COLUMN "pendingUploadId" TEXT;
CREATE TABLE "ChapterUpload" (
 "id" TEXT NOT NULL, "revisionId" TEXT NOT NULL, "chapterId" TEXT NOT NULL, "createdById" TEXT NOT NULL,
 "state" "ChapterUploadState" NOT NULL DEFAULT 'uploading', "sourceName" TEXT NOT NULL, "sourceBytes" INTEGER NOT NULL,
 "expectedPages" INTEGER NOT NULL, "reservedBytes" INTEGER NOT NULL DEFAULT 0, "revisionVersion" INTEGER NOT NULL,
 "errorCode" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ChapterUpload_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MediaAsset" (
 "id" TEXT NOT NULL, "uploadId" TEXT NOT NULL, "chapterId" TEXT NOT NULL, "pageIndex" INTEGER NOT NULL,
 "objectKey" TEXT NOT NULL, "mime" TEXT NOT NULL, "bytes" INTEGER NOT NULL, "width" INTEGER, "height" INTEGER,
 "readyAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChapterRevision_pendingUploadId_key" ON "ChapterRevision"("pendingUploadId");
CREATE INDEX "ChapterUpload_createdById_state_expiresAt_idx" ON "ChapterUpload"("createdById", "state", "expiresAt");
CREATE INDEX "ChapterUpload_revisionId_idx" ON "ChapterUpload"("revisionId");
CREATE UNIQUE INDEX "MediaAsset_objectKey_key" ON "MediaAsset"("objectKey");
CREATE UNIQUE INDEX "MediaAsset_uploadId_pageIndex_key" ON "MediaAsset"("uploadId", "pageIndex");
CREATE INDEX "MediaAsset_chapterId_idx" ON "MediaAsset"("chapterId");
ALTER TABLE "ChapterUpload" ADD CONSTRAINT "ChapterUpload_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ChapterRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChapterUpload" ADD CONSTRAINT "ChapterUpload_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChapterUpload" ADD CONSTRAINT "ChapterUpload_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChapterRevision" ADD CONSTRAINT "ChapterRevision_pendingUploadId_fkey" FOREIGN KEY ("pendingUploadId") REFERENCES "ChapterUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "ChapterUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
