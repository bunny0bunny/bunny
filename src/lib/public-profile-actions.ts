"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentProfileOrNull } from "@/lib/queries";
import { getReadingStats } from "@/lib/reading-stats";
import { cleanHandle, isCoverTheme, MAX_FEATURED_BADGES, MAX_FEATURED_SERIES } from "@/lib/public-profile-policy";

export type PublicProfileResult = { ok: true; href: string | null } | { ok: false; error: string };

const schema = z.object({
  handle: z.string().max(40).nullable(),
  profilePublic: z.boolean(),
  coverTheme: z.string().refine(isCoverTheme, "اختر غلافًا من القائمة"),
  featuredSeriesIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)).max(MAX_FEATURED_SERIES),
  featuredBadgeIds: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).max(MAX_FEATURED_BADGES),
});

export async function updatePublicProfile(input: unknown): Promise<PublicProfileResult> {
  const profile = await currentProfileOrNull();
  if (!profile) return { ok: false, error: "سجّل الدخول أولًا." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة." };
  const handle = cleanHandle(parsed.data.handle);
  if (!handle.ok) return { ok: false, error: handle.error };

  // Keep only works that are live and in this reader's library, in the chosen order.
  const seriesIds = [...new Set(parsed.data.featuredSeriesIds)];
  const owned = seriesIds.length ? await db.libraryItem.findMany({
    where: { profileId: profile.id, seriesId: { in: seriesIds }, series: { deletedAt: null } }, select: { seriesId: true },
  }) : [];
  const ownedIds = new Set(owned.map(item => item.seriesId));
  const featuredSeries = seriesIds.filter(id => ownedIds.has(id));

  // Showcase only badges the reader has actually earned.
  const badgeIds = [...new Set(parsed.data.featuredBadgeIds)];
  const earned = badgeIds.length ? new Set((await getReadingStats(profile.id)).badges.filter(b => b.earned).map(b => b.id)) : new Set<string>();
  const featuredBadges = badgeIds.filter(id => earned.has(id));

  try {
    await db.profile.update({
      where: { id: profile.id },
      data: {
        handle: handle.handle, profilePublic: parsed.data.profilePublic, coverTheme: parsed.data.coverTheme,
        featuredSeriesJson: JSON.stringify(featuredSeries), featuredBadgesJson: JSON.stringify(featuredBadges),
      },
    });
  } catch (error) {
    // Duck-typed: the Workers build uses its own generated client class.
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002") return { ok: false, error: "اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر." };
    throw error;
  }
  revalidatePath("/profile");
  revalidatePath(`/u/${handle.handle ?? profile.id}`);
  return { ok: true, href: parsed.data.profilePublic ? `/u/${handle.handle ?? profile.id}` : null };
}
