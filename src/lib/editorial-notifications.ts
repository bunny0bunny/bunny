import "server-only";
import type { Prisma } from "@prisma/client";

type EditorialNotificationAction = "submit" | "recommend" | "return";

const messages = {
  submit: { titleAr: "فصل بانتظار المراجعة", bodyAr: "تم إرسال نسخة للمراجعة. افتح الاستوديو للاطلاع عليها." },
  recommend: { titleAr: "توصية باعتماد فصل", bodyAr: "تمت مراجعة نسخة والتوصية باعتمادها. افتح الاستوديو لمتابعتها." },
  return: { titleAr: "طلب تعديلات على فصل", bodyAr: "أُعيدت نسخة لإجراء تعديلات. افتح الاستوديو للاطلاع على الملاحظات." },
} as const;

/** Keep previews generic: recipients may lose their assignment after delivery. */
export async function notifyEditorialTransition(
  tx: Prisma.TransactionClient,
  input: { action: EditorialNotificationAction; actorId: string | null; seriesId: string; chapterId: string },
) {
  const assignedEditors: Prisma.ProfileWhereInput = { role: "editor", assignments: { some: { seriesId: input.seriesId } } };
  const audience: Prisma.ProfileWhereInput = input.action === "return"
    ? { role: { in: ["contributor", "editor"] }, assignments: { some: { seriesId: input.seriesId } } }
    : input.action === "recommend"
      ? { role: "admin" }
      : { OR: [{ role: "admin" }, assignedEditors] };
  const recipients = await tx.profile.findMany({
    where: {
      ...audience, disabledAt: null, emailVerifiedAt: { not: null },
      ...(input.actorId ? { id: { not: input.actorId } } : {}),
    },
    select: { id: true },
  });
  if (!recipients.length) return;
  // The caller's transaction commits delivery, revision and audit together.
  await tx.notification.createMany({ data: recipients.map(({ id }) => ({
    profileId: id, type: "system", ...messages[input.action], href: `/studio/chapters/${input.chapterId}`,
  })) });
}
