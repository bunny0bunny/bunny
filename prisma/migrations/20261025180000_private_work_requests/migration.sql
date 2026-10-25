CREATE TYPE "content_request_status" AS ENUM ('new', 'reviewing', 'preparing', 'available', 'declined');
CREATE TABLE "ContentRequest" (
 "id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "title" TEXT NOT NULL, "category" "series_category" NOT NULL,
 "referenceUrl" TEXT, "message" TEXT, "normalizedTitle" TEXT NOT NULL, "submissionId" TEXT NOT NULL,
 "reply" TEXT, "internalNote" TEXT, "status" "content_request_status" NOT NULL DEFAULT 'new',
 "statusNote" TEXT, "fulfilledSeriesId" TEXT, "mergedIntoId" TEXT, "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ContentRequest_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ContentRequest_no_self_merge" CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id")
);
CREATE UNIQUE INDEX "ContentRequest_profileId_submissionId_key" ON "ContentRequest"("profileId", "submissionId");
CREATE UNIQUE INDEX "ContentRequest_profileId_category_normalizedTitle_key" ON "ContentRequest"("profileId", "category", "normalizedTitle");
CREATE INDEX "ContentRequest_profileId_createdAt_idx" ON "ContentRequest"("profileId", "createdAt");
CREATE INDEX "ContentRequest_mergedIntoId_status_createdAt_idx" ON "ContentRequest"("mergedIntoId", "status", "createdAt");
CREATE INDEX "ContentRequest_fulfilledSeriesId_idx" ON "ContentRequest"("fulfilledSeriesId");
ALTER TABLE "ContentRequest" ADD CONSTRAINT "ContentRequest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentRequest" ADD CONSTRAINT "ContentRequest_fulfilledSeriesId_fkey" FOREIGN KEY ("fulfilledSeriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentRequest" ADD CONSTRAINT "ContentRequest_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "ContentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
