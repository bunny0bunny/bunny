ALTER TABLE "Series" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "trashBatchId" TEXT;
ALTER TABLE "Chapter" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "trashBatchId" TEXT;
CREATE INDEX "Series_deletedAt_idx" ON "Series"("deletedAt");
CREATE INDEX "Series_trashBatchId_idx" ON "Series"("trashBatchId");
CREATE INDEX "Chapter_deletedAt_idx" ON "Chapter"("deletedAt");
CREATE INDEX "Chapter_trashBatchId_idx" ON "Chapter"("trashBatchId");
CREATE TABLE "ContentTrash" (
 "id" TEXT NOT NULL PRIMARY KEY, "activeKey" TEXT, "entityType" TEXT NOT NULL,
 "entityId" TEXT NOT NULL, "seriesId" TEXT, "title" TEXT NOT NULL, "deletedById" TEXT,
 "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "purgeAfter" TIMESTAMP(3) NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'trashed', "version" INTEGER NOT NULL DEFAULT 1,
 "objectsJson" JSONB NOT NULL DEFAULT '[]', "detailsJson" JSONB NOT NULL DEFAULT '{}',
 "errorCode" TEXT, "purgeStartedAt" TIMESTAMP(3), "purgedAt" TIMESTAMP(3), "restoredAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ContentTrash_activeKey_key" ON "ContentTrash"("activeKey");
CREATE INDEX "ContentTrash_state_purgeAfter_idx" ON "ContentTrash"("state", "purgeAfter");
CREATE INDEX "ContentTrash_entityType_entityId_idx" ON "ContentTrash"("entityType", "entityId");
CREATE INDEX "ContentTrash_seriesId_idx" ON "ContentTrash"("seriesId");
