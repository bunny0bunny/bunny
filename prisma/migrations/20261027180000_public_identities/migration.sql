-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "publicationId" TEXT;

-- CreateTable
CREATE TABLE "PublicIdentity" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "avatarSeed" TEXT NOT NULL DEFAULT 'bunny',
    "kind" TEXT NOT NULL DEFAULT 'individual',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesCredit" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeriesCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityFollow" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "followedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertsEnabledAt" TIMESTAMP(3),

    CONSTRAINT "IdentityFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterPublication" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstPublishedAt" TIMESTAMP(3),
    "seriesDebut" BOOLEAN NOT NULL DEFAULT false,
    "creditsSnapshot" JSONB NOT NULL DEFAULT '[]',
    "isAdult" BOOLEAN NOT NULL DEFAULT false,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "seriesTitle" TEXT NOT NULL,
    "chapterTitle" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "seriesSlug" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "evidenceJson" JSONB NOT NULL DEFAULT '[]',
    "cursorProfileId" TEXT,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicIdentity_slug_key" ON "PublicIdentity"("slug");

-- CreateIndex
CREATE INDEX "PublicIdentity_status_displayName_idx" ON "PublicIdentity"("status", "displayName");

-- CreateIndex
CREATE INDEX "SeriesCredit_identityId_seriesId_idx" ON "SeriesCredit"("identityId", "seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesCredit_seriesId_identityId_role_key" ON "SeriesCredit"("seriesId", "identityId", "role");

-- CreateIndex
CREATE INDEX "IdentityFollow_identityId_alertsEnabledAt_profileId_idx" ON "IdentityFollow"("identityId", "alertsEnabledAt", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityFollow_profileId_identityId_key" ON "IdentityFollow"("profileId", "identityId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterPublication_chapterId_key" ON "ChapterPublication"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterPublication_state_eventAt_idx" ON "ChapterPublication"("state", "eventAt");

-- CreateIndex
CREATE INDEX "ChapterPublication_seriesId_idx" ON "ChapterPublication"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_profileId_publicationId_key" ON "Notification"("profileId", "publicationId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "ChapterPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesCredit" ADD CONSTRAINT "SeriesCredit_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesCredit" ADD CONSTRAINT "SeriesCredit_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "PublicIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityFollow" ADD CONSTRAINT "IdentityFollow_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityFollow" ADD CONSTRAINT "IdentityFollow_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "PublicIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
