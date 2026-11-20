import { withDatabaseScope } from "@/lib/db";
import { requireRequestProfile } from "@/components/content-requests/server";
import { NewRequestForm } from "@/components/content-requests/new-request-form";
import { getMyRequestAllowance } from "@/lib/content-requests/service";
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ title?: string }> }) {
  const { title = "" } = await searchParams;
  return withDatabaseScope(async () => {
    await requireRequestProfile(`/requests/new${title ? `?title=${encodeURIComponent(title)}` : ""}`);
    const allowance = await getMyRequestAllowance();
    return <><h1 className="text-2xl font-bold sm:text-3xl">اطلب عملًا</h1><p className="mb-7 mt-2 max-w-prose text-sm leading-7 text-muted-foreground">لم تجد ما تبحث عنه؟ أرسل طلبًا خاصًا للإدارة. يمكنك متابعة حالته وقراءة رد الإدارة من صفحة طلباتي. إرسال الطلب لا يضمن إضافة العمل.</p>{allowance !== null && <p role="status" className="mb-5 text-sm text-muted-foreground">{allowance > 0 ? `متبقٍ لك ${allowance} من 3 طلبات خلال ٢٤ ساعة.` : "استخدمت طلباتك الثلاثة خلال آخر ٢٤ ساعة. تقدر تطلب مرة أخرى لاحقًا."}</p>}<NewRequestForm initialTitle={title} /></>;
  });
}
