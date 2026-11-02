"use server";

import { z } from "zod";
import {
  openOrCreateDraft as openDraftService,
  updateDraftSnapshot as updateDraftService,
  submitForReview as submitForReviewService,
  returnForChanges as returnForChangesService,
  recommendApproval as recommendApprovalService,
  approveRevision as approveRevisionService,
  approveAndPublishRevision as approveAndPublishRevisionService,
  publishRevisionNow as publishRevisionNowService,
  scheduleRevision as scheduleRevisionService,
  cancelScheduledRevision as cancelScheduledRevisionService,
  withdrawPublishedChapter as withdrawPublishedChapterService,
  executeDuePublications as executeDuePublicationsService,
} from "@/lib/editorial";
import { currentProfileOrNull } from "@/lib/queries";
import { isAdminRole } from "@/lib/team-access";

const errorTranslations: Record<string, string> = {
  scheduled_locked: "النسخة مجدولة للنشر ولا يمكن تعديلها. اطلب من مدير النظام إلغاء الجدولة أولاً.",
  unauthenticated: "يجب تسجيل الدخول أولاً للمتابعة.",
  forbidden: "لا تملك الصلاحية الكافية لتنفيذ هذا الإجراء.",
  not_found: "لم يتم العثور على العنصر المطلوب.",
  conflict: "تم تعديل النسخة بواسطة مستخدم آخر أو أن البيانات غير متزامنة. يرجى إعادة تحميل الصفحة.",
  reason_required: "سبب الإجراء مطلوب ولا يمكن تركه فارغاً.",
};

function translateError(err?: string): string {
  if (!err) return "حدث خطأ غير متوقع أثناء معالجة الطلب.";
  if (errorTranslations[err]) return errorTranslations[err];
  return err;
}

const pageSnapshotSchema = z.object({
  pageIndex: z.number().int().min(0),
  imagePath: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const openOrCreateDraftSchema = z.object({
  chapterId: z.string().min(1),
});

const updateDraftSnapshotSchema = z.object({
  revisionId: z.string().min(1),
  expectedVersion: z.number().int(),
  titleAr: z.string().trim().max(300).optional(),
  readingDirection: z.enum(["rtl", "ltr"]).optional(),
  isPremiumDemo: z.boolean().optional(),
  novelBody: z.string().max(60000).optional(),
  pages: z.array(pageSnapshotSchema).optional(),
});

const submitForReviewSchema = z.object({
  revisionId: z.string().min(1),
  expectedVersion: z.number().int(),
});

const returnForChangesSchema = z.object({
  revisionId: z.string().min(1),
  expectedVersion: z.number().int(),
  reason: z.string().min(1, "سبب الإعادة مطلوب").max(2000),
});

const recommendApprovalSchema = z.object({
  revisionId: z.string().min(1),
  expectedVersion: z.number().int(),
  note: z.string().max(2000).optional(),
});

const approveRevisionSchema = z.object({
  revisionId: z.string().min(1),
  expectedVersion: z.number().int(),
});

const publishRevisionNowSchema = z.object({
  revisionId: z.string().min(1),
  expectedVersion: z.number().int(),
});

const scheduleRevisionSchema = z.object({
  revisionId: z.string().min(1),
  expectedVersion: z.number().int(),
  scheduledFor: z.string().datetime().or(z.date()),
});

const cancelScheduledRevisionSchema = z.object({
  revisionId: z.string().min(1),
  expectedVersion: z.number().int(),
});

const withdrawPublishedChapterSchema = z.object({
  chapterId: z.string().min(1),
  expectedRevisionId: z.string().min(1),
  expectedVersion: z.number().int(),
  reason: z.string().min(1, "سبب السحب مطلوب").max(2000),
});

export async function openOrCreateDraftAction(input: unknown) {
  const parsed = openOrCreateDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "معرّف الفصل غير صالح" };
  }
  const res = await openDraftService(parsed.data.chapterId);
  return {
    ok: res.ok,
    error: res.error ? translateError(res.error) : undefined,
    revision: res.revision,
  };
}

export async function updateDraftSnapshotAction(input: unknown) {
  const parsed = updateDraftSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "بيانات الحفظ غير صالحة";
    return { ok: false, error: msg };
  }
  const res = await updateDraftService(parsed.data);
  return {
    ok: res.ok,
    error: res.error ? translateError(res.error) : undefined,
    revision: res.revision,
  };
}

export async function submitForReviewAction(input: unknown) {
  const parsed = submitForReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "بيانات إرسال المراجعة غير صالحة" };
  }
  const res = await submitForReviewService(parsed.data);
  return {
    ok: res.ok,
    error: res.error ? translateError(res.error) : undefined,
    revision: res.revision,
  };
}

export async function returnForChangesAction(input: unknown) {
  const parsed = returnForChangesSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "بيانات إعادة الملاحظات غير صالحة";
    return { ok: false, error: msg };
  }
  const res = await returnForChangesService(parsed.data);
  return {
    ok: res.ok,
    error: res.error ? translateError(res.error) : undefined,
    revision: res.revision,
  };
}

export async function recommendApprovalAction(input: unknown) {
  const parsed = recommendApprovalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "بيانات التوصية بالاعتماد غير صالحة" };
  }
  const res = await recommendApprovalService(parsed.data);
  return {
    ok: res.ok,
    error: res.error ? translateError(res.error) : undefined,
    revision: res.revision,
  };
}

export async function approveRevisionAction(input: unknown) {
  const parsed = approveRevisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "بيانات اعتماد النسخة غير صالحة" };
  }
  const res = await approveRevisionService(parsed.data);
  return {
    ok: res.ok,
    error: res.error ? translateError(res.error) : undefined,
    revision: res.revision,
  };
}

export async function publishRevisionNowAction(input: unknown) {
  const parsed = publishRevisionNowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "بيانات النشر الفوري غير صالحة" };
  }
  const res = await publishRevisionNowService(parsed.data);
  return {
    ok: res.ok,
    error: res.error ? translateError(res.error) : undefined,
    revision: res.revision,
  };
}

export async function scheduleRevisionAction(input: unknown) {
  const parsed = scheduleRevisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "بيانات جدولة النشر غير صالحة" };
  }
  const scheduledFor =
    typeof parsed.data.scheduledFor === "string"
      ? new Date(parsed.data.scheduledFor)
      : parsed.data.scheduledFor;

  const res = await scheduleRevisionService({
    revisionId: parsed.data.revisionId,
    expectedVersion: parsed.data.expectedVersion,
    scheduledFor,
  });
  return {
    ok: res.ok,
    error: res.error ? translateError(res.error) : undefined,
    revision: res.revision,
  };
}

export async function cancelScheduledRevisionAction(input: unknown) {
  const parsed = cancelScheduledRevisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "بيانات إلغاء الجدولة غير صالحة" };
  }
  const res = await cancelScheduledRevisionService(parsed.data);
  return {
    ok: res.ok,
    error: res.error ? translateError(res.error) : undefined,
    revision: res.revision,
  };
}

export async function withdrawPublishedChapterAction(input: unknown) {
  const parsed = withdrawPublishedChapterSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "بيانات سحب الفصل غير صالحة";
    return { ok: false, error: msg };
  }
  const res = await withdrawPublishedChapterService(parsed.data);
  return {
    ok: res.ok,
    error: res.error ? translateError(res.error) : undefined,
    revision: res.revision,
  };
}

/**
 * Dedicated guarded admin server action to run due publications on demand.
 * Cannot be called without a verified DB admin session.
 */
export async function executeDuePublicationsAdminAction() {
  const profile = await currentProfileOrNull();
  if (!profile || !isAdminRole(profile.role)) {
    return { ok: false, error: "غير مصرح — هذا الإجراء متاح لمدير النظام فقط." };
  }

  const res = await executeDuePublicationsService(20, { system: false });
  return {
    ok: res.errors.length === 0,
    publishedCount: res.publishedCount,
    errors: res.errors.map(translateError),
  };
}

export async function approveAndPublishRevisionAction(input: unknown) {
  const parsed = publishRevisionNowSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "بيانات الاعتماد والنشر الفوري غير صالحة" };
  const res = await approveAndPublishRevisionService(parsed.data);
  return { ok: res.ok, error: res.error ? translateError(res.error) : undefined, revision: res.revision };
}
