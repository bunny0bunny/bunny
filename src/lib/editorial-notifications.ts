import "server-only";
import type { Prisma } from "@prisma/client";

type EditorialNotificationAction = "submit" | "recommend" | "return" | "published" | "scheduled" | "withdrawn" | "cancelled" | "approval_invalidated" | "approved" | "left_review";

const messages = {
  published: { titleAr: "تم نشر فصل", bodyAr: "تم نشر نسخة. افتح الاستوديو لمتابعة حالتها." },
  scheduled: { titleAr: "تمت جدولة فصل", bodyAr: "تمت جدولة نسخة للنشر. افتح الاستوديو لمتابعة حالتها." },
  withdrawn: { titleAr: "تم سحب فصل", bodyAr: "تم سحب نسخة منشورة. افتح الاستوديو لمتابعة حالتها." },
  cancelled: { titleAr: "أُلغيت جدولة فصل", bodyAr: "أُلغيت جدولة نسخة. افتح الاستوديو لمتابعة حالتها." },
  approval_invalidated: { titleAr: "أُلغي اعتماد فصل", bodyAr: "أدى تعديل نسخة إلى إلغاء اعتمادها. افتح الاستوديو لمراجعتها." },
  submit: { titleAr: "فصل بانتظار المراجعة", bodyAr: "تم إرسال نسخة للمراجعة. افتح الاستوديو للاطلاع عليها." },
  recommend: { titleAr: "توصية باعتماد فصل", bodyAr: "تمت مراجعة نسخة والتوصية باعتمادها. افتح الاستوديو لمتابعتها." },
  return: { titleAr: "طلب تعديلات على فصل", bodyAr: "أُعيدت نسخة لإجراء تعديلات. افتح الاستوديو للاطلاع على الملاحظات." },
  approved: { titleAr: "تم اعتماد فصل", bodyAr: "اعتمدت الإدارة نسخة أرسلتها للمراجعة. افتح الاستوديو لمتابعة نشرها." },
  left_review: { titleAr: "سُحب فصل من المراجعة", bodyAr: "سحب صاحب النسخة نسخته من المراجعة لتعديلها. لا حاجة لمراجعتها الآن." },
} as const;

/**
 * Keep previews generic (no work or chapter titles): recipients may lose their assignment after delivery.
 * submitterId: who sent this revision for review; return/recommend/approve reach them directly.
 */
export async function notifyEditorialTransition(
  tx: Prisma.TransactionClient,
  input: { action: EditorialNotificationAction; actorId: string | null; seriesId: string; chapterId: string; submitterId?: string | null },
) {
  const assignedEditors: Prisma.ProfileWhereInput = { role: "editor", assignments: { some: { seriesId: input.seriesId } } };
  // The submitter only while they still work on this series (or are an admin).
  const submitter: Prisma.ProfileWhereInput | null = input.submitterId
    ? { id: input.submitterId, OR: [{ role: "admin" }, { assignments: { some: { seriesId: input.seriesId } } }] }
    : null;
  const audience: Prisma.ProfileWhereInput = input.action === "return"
    ? submitter ? { OR: [submitter, assignedEditors] } : { role: { in: ["contributor", "editor"] }, assignments: { some: { seriesId: input.seriesId } } }
    : input.action === "approved"
      ? submitter ?? { id: { in: [] } }
      : input.action === "left_review"
        ? { OR: [{ role: "admin" }, assignedEditors] }
        : input.action === "recommend" && submitter
          ? { OR: [{ role: "admin" }, submitter] }
          : input.action === "recommend" || input.action === "approval_invalidated"
      ? { role: "admin" }
      : input.action === "submit"
        ? { OR: [{ role: "admin" }, assignedEditors] }
        : { OR: [{ role: "admin" }, { role: { in: ["contributor", "editor"] }, assignments: { some: { seriesId: input.seriesId } } }] };
  const recipients = await tx.profile.findMany({
    where: { AND: [audience, { disabledAt: null, emailVerifiedAt: { not: null } }, ...(input.actorId ? [{ id: { not: input.actorId } }] : [])] },
    select: { id: true },
  });
  if (!recipients.length) return;
  // The caller's transaction commits delivery, revision and audit together.
  const { titleAr, bodyAr } = messages[input.action];
  await tx.notification.createMany({ data: recipients.map(({ id }) => ({
    profileId: id, type: "system", titleAr, bodyAr, href: `/studio/chapters/${input.chapterId}`,
  })) });
}
