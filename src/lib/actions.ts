"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { currentProfileOrNull } from "@/lib/queries";
import { notifyNewChapter, notifyCommentLike } from "@/lib/notifications";
import { revalidatePath } from "next/cache";
import { isWorkflow, isRole, type Workflow, type Role } from "@/lib/constants";
import { isStaffRole, isAssignableRole, isAssignedToSeries } from "@/lib/team-access";
import { categoryMatchesFormat } from "@/lib/content-category";

/* ------------------------------------------------------------------ */
/* Reading progress (authenticated readers; guests mirror locally)     */
/* ------------------------------------------------------------------ */

const progressSchema = z.object({
  seriesSlug: z.string().min(1),
  chapterNumber: z.number().int().min(1),
  pageIndex: z.number().int().min(0),
  percent: z.number().min(0).max(100),
  completed: z.boolean(),
});

export type ActionResult = { ok: boolean; error?: string };

export async function saveReadingProgress(input: unknown): Promise<ActionResult> {
  const profile = await currentProfileOrNull();
  if (!profile) return { ok: false, error: "unauthenticated" };
  const parsed = progressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { seriesSlug, chapterNumber, pageIndex, percent, completed } = parsed.data;

  const series = await db.series.findUnique({ where: { slug: seriesSlug } });
  if (!series) return { ok: false, error: "not_found" };
  const chapter = await db.chapter.findFirst({
    where: { seriesId: series.id, number: chapterNumber, workflow: "published" },
  });
  if (!chapter) return { ok: false, error: "not_found" };

  const existing = await db.readingProgress.findUnique({
    where: { profileId_chapterId: { profileId: profile.id, chapterId: chapter.id } },
  });

  await db.readingProgress.upsert({
    where: { profileId_chapterId: { profileId: profile.id, chapterId: chapter.id } },
    update: { pageIndex, percent, completed, seriesId: series.id },
    create: {
      profileId: profile.id,
      seriesId: series.id,
      chapterId: chapter.id,
      pageIndex,
      percent,
      completed,
    },
  });

  if (!existing) {
    await db.analyticsEvent.create({
      data: { type: "read_start", seriesId: series.id, chapterId: chapter.id, profileId: profile.id },
    });
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Admin: series + chapters (role enforced here, again)                */
/* ------------------------------------------------------------------ */

async function requireAdmin() {
  const profile = await currentProfileOrNull();
  if (!profile || profile.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return profile;
}

async function requireModerator() {
  const profile = await currentProfileOrNull();
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    throw new Error("FORBIDDEN");
  }
  return profile;
}

const seriesSchema = z
  .object({
    id: z.string().optional(),
    titleAr: z.string().min(2, "العنوان مطلوب"),
    titleOriginal: z.string().optional(),
    slug: z
      .string()
      .min(2)
      .regex(/^[a-z0-9-]+$/, "المعرّف: أحرف لاتينية صغيرة وأرقام وشرطات فقط"),
    synopsisAr: z.string().min(20, "الملخص قصير جدًا (٢٠ حرفًا على الأقل)"),
    category: z.enum(["manga", "manhwa", "novel", "comic"]).nullable().optional(),
    format: z.enum(["manga", "webtoon", "novel"]),
    status: z.enum(["ongoing", "completed", "hiatus"]),
    author: z.string().min(2, "المؤلف مطلوب"),
    translator: z.string().optional(),
    genres: z.array(z.string()).min(1, "اختر نوعًا واحدًا على الأقل"),
    isFeatured: z.boolean(),
  })
  .refine(
    (data) => categoryMatchesFormat(data.category, data.format),
    {
      message: "تصنيف الرواية يتطلب طريقة قراءة رواية نصية، والتصنيفات المصورة تتطلب طريقة قراءة صفحات أو تمرير ويبتون",
      path: ["category"],
    }
  );

export async function upsertSeries(input: unknown): Promise<ActionResult & { slug?: string }> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "forbidden" };
  }
  const parsed = seriesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const d = parsed.data;
  if (!d.id && !d.category) return { ok: false, error: "اختر تصنيف العمل قبل إنشائه" };
  const data = {
    titleAr: d.titleAr,
    titleOriginal: d.titleOriginal || null,
    slug: d.slug,
    synopsisAr: d.synopsisAr,
    format: d.format,
    status: d.status,
    author: d.author,
    translator: d.translator || null,
    genresJson: JSON.stringify(d.genres),
    isFeatured: d.isFeatured,
    ...(d.category !== undefined ? { category: d.category } : {}),
  };

  if (d.id) {
    const existing = await db.series.findUnique({ where: { id: d.id } });
    if (!existing) return { ok: false, error: "not_found" };
    if (!categoryMatchesFormat(d.category === undefined ? existing.category : d.category, d.format))
      return { ok: false, error: "تصنيف العمل لا يتوافق مع طريقة القراءة" };
    await db.series.update({ where: { id: d.id }, data });
    revalidatePath("/admin/series");
    revalidatePath(`/series/${d.slug}`);
    revalidatePath("/");
    return { ok: true, slug: d.slug };
  }

  const accentPalette = ["#9B7BFF", "#5FCB9B", "#E56B6F", "#DDBB77", "#7FA8C9", "#C98BD9"];
  const created = await db.series.create({
    data: {
      ...data,
      category: d.category ?? null,
      accent: accentPalette[Math.floor(Math.random() * accentPalette.length)],
      coverPath: "", // placeholder until cover art is uploaded (Release B upload flow)
    },
  });
  revalidatePath("/admin/series");
  revalidatePath("/");
  return { ok: true, slug: created.slug };
}

const chapterMetaSchema = z.object({
  id: z.string(),
  titleAr: z.string().min(2).optional(),
  workflow: z.enum(["draft", "review", "published"]).optional(),
  isPremiumDemo: z.boolean().optional(),
  readingDirection: z.enum(["rtl", "ltr"]).optional(),
  scheduledFor: z.string().datetime({ offset: true }).nullable().optional(),
});

export async function updateChapterMeta(input: unknown): Promise<ActionResult> {
  const actor = await currentProfileOrNull();
  if (!actor || !isStaffRole(actor.role)) {
    return { ok: false, error: "forbidden" };
  }
  const parsed = chapterMetaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { id, ...patch } = parsed.data;

  const chapter = await db.chapter.findUnique({ where: { id }, include: { series: true } });
  if (!chapter) return { ok: false, error: "not_found" };

  if (await db.chapterRevision.count({ where: { chapterId: id } })) {
    if (actor.role !== "admin" && !await isAssignedToSeries(actor.id, chapter.seriesId)) return { ok: false, error: "forbidden" };
    return { ok: false, error: "هذا الفصل يستخدم النسخ التحريرية؛ افتح النسخة في الاستوديو لتعديلها." };
  }

  if (actor.role !== "admin") {
    // Non-admin staff (contributor/editor):
    // 1. Cannot touch published or scheduled chapters
    if (chapter.workflow === "published" || chapter.scheduledFor) {
      return { ok: false, error: "forbidden" };
    }
    // 2. Cannot set published workflow
    if (patch.workflow === "published") {
      return { ok: false, error: "forbidden" };
    }
    // 3. Cannot set premium or schedule
    if (patch.isPremiumDemo !== undefined || patch.scheduledFor !== undefined) {
      return { ok: false, error: "forbidden" };
    }
    // 4. Must be assigned to the series
    const assigned = await isAssignedToSeries(actor.id, chapter.seriesId);
    if (!assigned) {
      return { ok: false, error: "forbidden" };
    }

    // Conditional atomic write: verifies workflow remains draft/review, not scheduled, and actor assigned with valid staff role
    const updateResult = await db.chapter.updateMany({
      where: {
        id,
        workflow: { in: ["draft", "review"] },
        scheduledFor: null,
        series: {
          assignments: {
            some: {
              profileId: actor.id,
              profile: { role: { in: ["contributor", "editor"] } },
            },
          },
        },
      },
      data: {
        ...(patch.titleAr !== undefined ? { titleAr: patch.titleAr } : {}),
        ...(patch.readingDirection !== undefined ? { readingDirection: patch.readingDirection } : {}),
        ...(patch.workflow !== undefined ? { workflow: patch.workflow } : {}),
      },
    });

    if (updateResult.count === 0) {
      return { ok: false, error: "conflict" };
    }

    revalidatePath("/admin/chapters");
    revalidatePath(`/admin/series/${chapter.seriesId}`);
    revalidatePath(`/series/${chapter.series.slug}`);
    return { ok: true };
  }

  // Admin path:
  // In the new editorial workflow:
  // 1. Published chapters cannot have their public metadata or body directly altered without an approved revision
  if (chapter.workflow === "published") {
    return { ok: false, error: "لا يمكن تعديل الفصل المنشور مباشرة؛ يرجى فتح مسودة مراجعة في استوديو التحرير." };
  }

  // 2. Direct publication or scheduling via legacy meta action is not allowed without revision approval
  if (patch.workflow === "published" || patch.scheduledFor !== undefined) {
    return { ok: false, error: "النشر والجدولة يتطلبان اعتماد نسخة محددة في استوديو التحرير." };
  }
  const data: Record<string, unknown> = {
    ...(patch.titleAr !== undefined ? { titleAr: patch.titleAr } : {}),
    ...(patch.readingDirection !== undefined ? { readingDirection: patch.readingDirection } : {}),
    ...(patch.workflow !== undefined ? { workflow: patch.workflow } : {}),
    ...(patch.isPremiumDemo !== undefined ? { isPremiumDemo: patch.isPremiumDemo } : {}),
  };
  await db.chapter.update({ where: { id }, data });

  revalidatePath("/admin/chapters");
  revalidatePath(`/admin/series/${chapter.seriesId}`);
  revalidatePath(`/series/${chapter.series.slug}`);
  return { ok: true };
}

const createChapterSchema = z.object({
  seriesId: z.string(),
  number: z.number().int().min(1),
  titleAr: z.string().min(2, "عنوان الفصل مطلوب"),
  workflow: z.enum(["draft", "review", "published"]),
  isPremiumDemo: z.boolean(),
  readingDirection: z.enum(["rtl", "ltr"]),
  pageCount: z.number().int().min(1).max(30).optional().default(1),
  scheduledFor: z.string().datetime({ offset: true }).nullable().optional(),
  novelBody: z.string().max(60000).optional(),
});

export async function createChapter(input: unknown): Promise<ActionResult & { id?: string }> {
  const actor = await currentProfileOrNull();
  if (!actor || !isStaffRole(actor.role)) {
    return { ok: false, error: "forbidden" };
  }
  const parsed = createChapterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const d = parsed.data;

  // Non-admin rules:
  if (actor.role !== "admin") {
    const assigned = await isAssignedToSeries(actor.id, d.seriesId);
    if (!assigned) {
      return { ok: false, error: "forbidden" };
    }
    if (d.workflow === "published" || d.isPremiumDemo || d.scheduledFor) {
      return { ok: false, error: "forbidden" };
    }
  }

  // Admin cannot directly create published or scheduled chapter:
  if (d.workflow === "published" || d.scheduledFor) {
    return { ok: false, error: "لا يمكن إنشاء فصل منشور أو مجدول مباشرة؛ يُنشأ كمسودة ثم يُعتمد ويُنشر من الاستوديو." };
  }

  const series = await db.series.findUnique({ where: { id: d.seriesId } });
  if (!series) return { ok: false, error: "not_found" };

  const exists = await db.chapter.findUnique({
    where: { seriesId_number: { seriesId: series.id, number: d.number } },
  });
  if (exists) return { ok: false, error: "رقم الفصل مستخدم في هذا العمل" };

  let chapter;
  try {
    chapter = await db.chapter.create({
      data: {
        seriesId: series.id,
        number: d.number,
        titleAr: d.titleAr,
        workflow: d.workflow,
        publishedAt: null,
        scheduledFor: null,
        isPremiumDemo: d.isPremiumDemo,
        readingDirection: d.readingDirection,
        novelBody: d.novelBody ?? null,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return { ok: false, error: "رقم الفصل مستخدم في هذا العمل" };
    }
    throw err;
  }

  // Visual chapters start empty; the reviewed PDF upload supplies real pages.
  revalidatePath("/admin/chapters");
  revalidatePath(`/admin/series/${series.id}`);
  revalidatePath(`/series/${series.slug}`);
  return { ok: true, id: chapter.id };
}

export async function setWorkflowBulk(_ids: string[], workflow: Workflow): Promise<ActionResult> {
  try { await requireAdmin(); } catch { return { ok: false, error: "forbidden" }; }
  if (!isWorkflow(workflow)) return { ok: false, error: "invalid" };
  return { ok: false, error: "تغيير حالة الفصول يتم من الاستوديو على نسخة محددة مع توثيق الإجراء." };
}

/* ------------------------------------------------------------------ */
/* Release B — library, community, ratings, moderation, admin CRUD     */
/* ------------------------------------------------------------------ */

const librarySchema = z.object({
  seriesSlug: z.string().min(1),
  shelf: z.enum(["reading", "plan", "finished"]).nullable(), // null = remove
});

export async function setLibraryItem(input: unknown): Promise<ActionResult> {
  const profile = await currentProfileOrNull();
  if (!profile) return { ok: false, error: "unauthenticated" };
  const parsed = librarySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { seriesSlug, shelf } = parsed.data;
  const series = await db.series.findUnique({ where: { slug: seriesSlug }, select: { id: true, slug: true } });
  if (!series) return { ok: false, error: "not_found" };

  if (shelf === null) {
    await db.libraryItem.deleteMany({ where: { profileId: profile.id, seriesId: series.id } });
  } else {
    await db.libraryItem.upsert({
      where: { profileId_seriesId: { profileId: profile.id, seriesId: series.id } },
      update: { shelf },
      create: { profileId: profile.id, seriesId: series.id, shelf },
    });
  }
  revalidatePath("/library");
  revalidatePath(`/series/${series.slug}`);
  revalidatePath("/profile");
  return { ok: true };
}

export async function markSeriesRead(seriesSlug: string): Promise<ActionResult> {
  const profile = await currentProfileOrNull();
  if (!profile) return { ok: false, error: "unauthenticated" };
  const series = await db.series.findUnique({ where: { slug: seriesSlug } });
  if (!series) return { ok: false, error: "not_found" };
  const now = new Date();
  const chapters = await db.chapter.findMany({
    where: { seriesId: series.id, workflow: "published", OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }] },
    select: { id: true },
  });
  for (const c of chapters) {
    await db.readingProgress.upsert({
      where: { profileId_chapterId: { profileId: profile.id, chapterId: c.id } },
      update: { completed: true, percent: 100 },
      create: { profileId: profile.id, seriesId: series.id, chapterId: c.id, pageIndex: 0, percent: 100, completed: true },
    });
  }
  revalidatePath("/library");
  revalidatePath("/updates");
  revalidatePath(`/series/${series.slug}`);
  return { ok: true };
}

const commentSchema = z.object({
  seriesSlug: z.string().min(1),
  chapterNumber: z.number().int().min(1).nullable().optional(),
  body: z.string().trim().min(2, "التعليق قصير جدًا").max(2000, "التعليق طويل جدًا"),
});

export async function postComment(input: unknown): Promise<ActionResult> {
  const profile = await currentProfileOrNull();
  if (!profile) return { ok: false, error: "unauthenticated" };
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const { seriesSlug, chapterNumber, body } = parsed.data;
  const series = await db.series.findUnique({ where: { slug: seriesSlug }, select: { id: true, slug: true } });
  if (!series) return { ok: false, error: "not_found" };
  let chapterId: string | null = null;
  if (chapterNumber) {
    const now = new Date();
    const chapter = await db.chapter.findFirst({
      where: { seriesId: series.id, number: chapterNumber, workflow: "published", OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }] },
      select: { id: true },
    });
    if (!chapter) return { ok: false, error: "not_found" };
    chapterId = chapter.id;
  }
  await db.comment.create({ data: { profileId: profile.id, seriesId: series.id, chapterId, body } });
  revalidatePath(`/series/${series.slug}`);
  return { ok: true };
}

const reportSchema = z.object({
  commentId: z.string().min(1),
  reasonAr: z.string().trim().max(500).optional(),
});

export async function reportComment(input: unknown): Promise<ActionResult> {
  const profile = await currentProfileOrNull();
  if (!profile) return { ok: false, error: "unauthenticated" };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const comment = await db.comment.findUnique({ where: { id: parsed.data.commentId }, select: { id: true, status: true, seriesId: true } });
  if (!comment) return { ok: false, error: "not_found" };
  await db.commentReport.upsert({
    where: { commentId_profileId: { commentId: comment.id, profileId: profile.id } },
    update: { reasonAr: parsed.data.reasonAr ?? null },
    create: { commentId: comment.id, profileId: profile.id, reasonAr: parsed.data.reasonAr ?? null },
  });
  if (comment.status === "visible") {
    await db.comment.update({ where: { id: comment.id }, data: { status: "flagged" } });
  }
  revalidatePath("/admin/moderation");
  return { ok: true };
}

const likeSchema = z.object({
  commentId: z.string().min(1),
});

/**
 * Toggle the current profile's like on a comment (Release E). One like per
 * profile per comment (compound unique). Liking someone else's comment sends
 * them a notification; unliking and self-likes stay silent.
 */
export async function toggleCommentLike(
  input: unknown
): Promise<ActionResult & { liked?: boolean; likeCount?: number }> {
  const profile = await currentProfileOrNull();
  if (!profile) return { ok: false, error: "unauthenticated" };
  const parsed = likeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const comment = await db.comment.findUnique({
    where: { id: parsed.data.commentId },
    select: {
      id: true,
      status: true,
      profileId: true,
      series: { select: { slug: true, titleAr: true } },
      _count: { select: { likes: true } },
    },
  });
  if (!comment || comment.status !== "visible") return { ok: false, error: "not_found" };

  const key = { commentId_profileId: { commentId: comment.id, profileId: profile.id } };
  const existing = await db.commentLike.findUnique({ where: key });
  let liked: boolean;
  if (existing) {
    await db.commentLike.delete({ where: key });
    liked = false;
  } else {
    await db.commentLike.create({ data: { commentId: comment.id, profileId: profile.id } });
    liked = true;
    if (comment.profileId !== profile.id) {
      await notifyCommentLike({
        authorProfileId: comment.profileId,
        likerNickname: profile.nickname,
        seriesSlug: comment.series.slug,
        seriesTitle: comment.series.titleAr,
      });
    }
  }
  return { ok: true, liked, likeCount: comment._count.likes + (liked ? 1 : -1) };
}

const ratingSchema = z.object({
  seriesSlug: z.string().min(1),
  value: z.number().int().min(1).max(5),
});

export async function setRating(input: unknown): Promise<ActionResult & { ratingAvg?: number; ratingCount?: number }> {
  const profile = await currentProfileOrNull();
  if (!profile) return { ok: false, error: "unauthenticated" };
  const parsed = ratingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const series = await db.series.findUnique({ where: { slug: parsed.data.seriesSlug }, select: { id: true, slug: true } });
  if (!series) return { ok: false, error: "not_found" };
  await db.rating.upsert({
    where: { profileId_seriesId: { profileId: profile.id, seriesId: series.id } },
    update: { value: parsed.data.value },
    create: { profileId: profile.id, seriesId: series.id, value: parsed.data.value },
  });
  const agg = await db.rating.aggregate({ where: { seriesId: series.id }, _avg: { value: true }, _count: { _all: true } });
  const ratingAvg = Math.round((agg._avg.value ?? 0) * 10) / 10;
  const ratingCount = agg._count._all;
  await db.series.update({ where: { id: series.id }, data: { ratingAvg, ratingCount } });
  revalidatePath(`/series/${series.slug}`);
  return { ok: true, ratingAvg, ratingCount };
}

const profileSchema = z.object({
  nickname: z.string().trim().min(2, "الاسم قصير جدًا").max(40),
  bio: z.string().trim().max(300).optional(),
  avatarSeed: z.enum(["initials", "bunny", "violet", "teal", "gold"]).optional(),
});

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const profile = await currentProfileOrNull();
  if (!profile) return { ok: false, error: "unauthenticated" };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  await db.profile.update({
    where: { id: profile.id },
    data: { nickname: parsed.data.nickname, bio: parsed.data.bio || null, ...(parsed.data.avatarSeed ? { avatarSeed: parsed.data.avatarSeed } : {}) },
  });
  revalidatePath("/profile");
  return { ok: true };
}

/* --- moderation (editor+) --- */

const moderationSchema = z.object({
  commentId: z.string().min(1),
  status: z.enum(["visible", "hidden"]),
});

export async function moderateComment(input: unknown): Promise<ActionResult> {
  try {
    await requireModerator();
  } catch {
    return { ok: false, error: "forbidden" };
  }
  const parsed = moderationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const comment = await db.comment.findUnique({ where: { id: parsed.data.commentId }, select: { series: { select: { slug: true } } } });
  if (!comment) return { ok: false, error: "not_found" };
  await db.comment.update({ where: { id: parsed.data.commentId }, data: { status: parsed.data.status } });
  revalidatePath("/admin/moderation");
  revalidatePath(`/series/${comment.series.slug}`);
  return { ok: true };
}

export async function deleteComment(input: unknown): Promise<ActionResult> {
  try {
    await requireModerator();
  } catch {
    return { ok: false, error: "forbidden" };
  }
  const parsed = z.object({ commentId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await db.comment.delete({ where: { id: parsed.data.commentId } });
  revalidatePath("/admin/moderation");
  revalidatePath("/");
  return { ok: true };
}

/* --- collections CRUD (admin only) --- */

const collectionSchema = z.object({
  id: z.string().optional(),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "المعرّف: أحرف لاتينية صغيرة وأرقام وشرطات فقط"),
  titleAr: z.string().min(2, "العنوان مطلوب"),
  descriptionAr: z.string().min(10, "الوصف قصير جدًا"),
  theme: z.enum(["violet", "gold", "emerald", "rose"]),
  displayOrder: z.number().int().min(0).max(99),
  isFeatured: z.boolean(),
  seriesSlugs: z.array(z.string()).max(12),
});

export async function upsertCollection(input: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "forbidden" };
  }
  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const d = parsed.data;
  const data = {
    slug: d.slug,
    titleAr: d.titleAr,
    descriptionAr: d.descriptionAr,
    theme: d.theme,
    displayOrder: d.displayOrder,
    isFeatured: d.isFeatured,
    seriesSlugsJson: JSON.stringify(d.seriesSlugs),
  };
  if (d.id) {
    await db.editorialCollection.update({ where: { id: d.id }, data });
  } else {
    const exists = await db.editorialCollection.findUnique({ where: { slug: d.slug } });
    if (exists) return { ok: false, error: "المعرّف مستخدم" };
    await db.editorialCollection.create({ data });
  }
  revalidatePath("/admin/collections");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteCollection(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "forbidden" };
  }
  await db.editorialCollection.delete({ where: { id } });
  revalidatePath("/admin/collections");
  revalidatePath("/");
  return { ok: true };
}

/* --- notifications (Release E) --- */

export async function markNotificationRead(input: unknown): Promise<ActionResult> {
  const profile = await currentProfileOrNull();
  if (!profile) return { ok: false, error: "unauthenticated" };
  const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    await db.notification.update({
      where: { id: parsed.data.id, profileId: profile.id },
      data: { readAt: new Date() },
    });
  } catch {
    return { ok: false, error: "not_found" }; // not owned / not found — no info leak
  }
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const profile = await currentProfileOrNull();
  if (!profile) return { ok: false, error: "unauthenticated" };
  await db.notification.updateMany({
    where: { profileId: profile.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

/* --- team assignments (admin only) --- */

const assignmentSchema = z.object({
  seriesId: z.string().min(1),
  profileId: z.string().min(1),
  assigned: z.boolean(),
});

export async function setSeriesAssignment(input: unknown): Promise<ActionResult> {
  const me = await currentProfileOrNull();
  if (!me || me.role !== "admin") return { ok: false, error: "forbidden" };

  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { seriesId, profileId, assigned } = parsed.data;

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await db.$transaction(
        async (tx) => {
          const actor = await tx.profile.findUnique({ where: { id: me.id } });
            if (!actor || actor.role !== "admin" || actor.disabledAt || !actor.emailVerifiedAt || actor.authVersion !== me.authVersion) {
            return { ok: false, error: "forbidden" };
          }
          const [series, target] = await Promise.all([
            tx.series.findUnique({ where: { id: seriesId }, select: { id: true } }),
            tx.profile.findUnique({ where: { id: profileId }, select: { id: true, role: true } }),
          ]);
          if (!series || !target) return { ok: false, error: "not_found" };
          if (!isAssignableRole(target.role)) {
            return { ok: false, error: "invalid_target" };
          }

          if (assigned) {
            await tx.seriesAssignment.upsert({
              where: { profileId_seriesId: { profileId, seriesId } },
              update: {},
              create: { profileId, seriesId },
            });
          } else {
            await tx.seriesAssignment.deleteMany({
              where: { profileId, seriesId },
            });
          }
          return { ok: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      if (res.ok) {
        revalidatePath("/admin/series");
        revalidatePath(`/admin/series/${seriesId}`);
      }
      return res;
    } catch (err: any) {
      if (err?.code === "P2034" || err?.meta?.code === "40001" || err?.code === "P2002") {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
          continue;
        }
        return { ok: false, error: "conflict" };
      }
      throw err;
    }
  }
  return { ok: false, error: "conflict" };
}

/* --- users & roles (admin only) --- */

export async function setUserRole(profileId: string, role: Role): Promise<ActionResult> {
  const me = await currentProfileOrNull();
  if (!me || me.role !== "admin") return { ok: false, error: "forbidden" };
  if (!isRole(role)) return { ok: false, error: "invalid" };

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await db.$transaction(
        async (tx) => {
          const actor = await tx.profile.findUnique({ where: { id: me.id } });
          if (!actor || actor.role !== "admin" || actor.disabledAt || !actor.emailVerifiedAt) {
            return { ok: false, error: "forbidden" };
          }
          if (profileId === actor.id && role !== "admin") {
            return { ok: false, error: "لا يمكن تخفيض دورك الخاص" };
          }
          const target = await tx.profile.findUnique({ where: { id: profileId } });
          if (!target) {
            return { ok: false, error: "not_found" };
          }
            if (target.role === "admin" && !target.disabledAt && target.emailVerifiedAt && role !== "admin") {
            const adminCount = await tx.profile.count({
              where: {
                role: "admin",
                disabledAt: null,
                emailVerifiedAt: { not: null },
              },
            });
            if (adminCount <= 1) {
              return { ok: false, error: "last_admin" };
            }
          }
          await tx.profile.update({
            where: { id: profileId },
            data: {
              role,
              authVersion: { increment: 1 },
            },
          });
          if (role === "reader") {
            await tx.seriesAssignment.deleteMany({
              where: { profileId },
            });
          }
          await tx.accountAudit.create({
            data: {
              actorId: actor.id,
              targetId: target.id,
              action: "role_changed",
              metadata: { oldRole: target.role, newRole: role },
            },
          });
          return { ok: true };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      );
      if (res.ok) {
        revalidatePath("/admin/users");
      }
      return res;
    } catch (err: any) {
      if (err?.code === "P2034" || err?.meta?.code === "40001") {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
          continue;
        }
        return { ok: false, error: "conflict" };
      }
      throw err;
    }
  }
  return { ok: false, error: "conflict" };
}

export async function getCurrentUserRole(): Promise<Role | null> {
  const profile = await currentProfileOrNull();
  return (profile?.role as Role) ?? null;
}
