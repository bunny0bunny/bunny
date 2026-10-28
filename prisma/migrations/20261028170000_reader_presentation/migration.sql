CREATE TYPE "reading_presentation" AS ENUM ('paged', 'continuous');
ALTER TABLE "Series" ADD COLUMN "defaultPresentation" "reading_presentation" NOT NULL DEFAULT 'paged',
ADD COLUMN "defaultReadingDirection" "reading_direction" NOT NULL DEFAULT 'rtl';
ALTER TABLE "ReadingProgress" ADD COLUMN "pageOffset" DOUBLE PRECISION;
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_pageOffset_range" CHECK ("pageOffset" IS NULL OR ("pageOffset" >= 0 AND "pageOffset" <= 1));
