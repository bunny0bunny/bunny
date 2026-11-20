-- Readers can withdraw their own work requests. A withdrawn request no longer
-- blocks asking for the same title again, so the per-reader title uniqueness
-- becomes a partial index. The new index is strictly weaker than the old one,
-- so existing rows always satisfy it.
BEGIN;
ALTER TABLE "ContentRequest" ADD COLUMN "withdrawnAt" TIMESTAMP(3);
DROP INDEX "ContentRequest_profileId_category_normalizedTitle_key";
CREATE UNIQUE INDEX "ContentRequest_live_profile_title_key" ON "ContentRequest"("profileId", "category", "normalizedTitle") WHERE "withdrawnAt" IS NULL;
CREATE INDEX "ContentRequest_profileId_category_normalizedTitle_idx" ON "ContentRequest"("profileId", "category", "normalizedTitle");
COMMIT;
