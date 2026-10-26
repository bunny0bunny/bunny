import { redirect } from "next/navigation";
import { currentProfileOrNull } from "@/lib/queries";
import { listTrash } from "@/lib/content-trash/service";
import { withDatabaseScope } from "@/lib/db";
import { TrashList } from "@/components/admin/content-trash-controls";

export const dynamic = "force-dynamic";
export default async function AdminTrashPage() {
  const profile = await currentProfileOrNull();
  if (!profile) redirect("/login?next=/admin/trash");
  if (profile.role !== "admin") redirect("/admin");
  const result = await withDatabaseScope(() => listTrash());
  return <main className="mx-auto max-w-4xl space-y-6 p-4 pt-6 sm:p-6"><header><h1 className="text-2xl font-bold">سلة المحتوى</h1><p className="mt-2 text-sm leading-7 text-muted-foreground">المحتوى مخفي عن القراء. الاستعادة خلال 30 يومًا تعيده كمسودة وتحتاج إلى نشره مجددًا. الحذف النهائي يزيل الملفات والمحتوى مع الاحتفاظ بحسابات القراء وطلباتهم الخاصة. المواعيد بتوقيت القاهرة.</p></header>{result.ok ? <TrashList items={result.data} /> : <p role="alert" className="text-danger">تعذر تحميل السلة. حدّث الصفحة للمحاولة مجددًا.</p>}</main>;
}
