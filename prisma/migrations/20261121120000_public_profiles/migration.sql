-- Public reader profiles: optional handle, visibility, cover theme and showcased works/badges.
-- Additive only; every existing row gets safe defaults.
ALTER TABLE "Profile" ADD COLUMN "handle" TEXT;
ALTER TABLE "Profile" ADD COLUMN "profilePublic" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Profile" ADD COLUMN "coverTheme" TEXT NOT NULL DEFAULT 'dusk';
ALTER TABLE "Profile" ADD COLUMN "featuredSeriesJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Profile" ADD COLUMN "featuredBadgesJson" TEXT NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX "Profile_handle_key" ON "Profile"("handle");
