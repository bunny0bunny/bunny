-- Exact widening for all existing int32 chapter numbers; no content rows are deleted.
ALTER TABLE "Chapter" ALTER COLUMN "number" TYPE DOUBLE PRECISION USING "number"::DOUBLE PRECISION;
ALTER TABLE "ChapterPublication" ALTER COLUMN "chapterNumber" TYPE DOUBLE PRECISION USING "chapterNumber"::DOUBLE PRECISION;
