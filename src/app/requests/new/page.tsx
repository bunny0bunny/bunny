import { withDatabaseScope } from "@/lib/db";
import { requireRequestProfile } from "@/components/content-requests/server";
import { NewRequestForm } from "@/components/content-requests/new-request-form";
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ title?: string }> }) {
  const { title = "" } = await searchParams;
  return withDatabaseScope(async () => {
    await requireRequestProfile(`/requests/new${title ? `?title=${encodeURIComponent(title)}` : ""}`);
    return <><h1 className="text-2xl font-bold sm:text-3xl">اطلب عملًا</h1><p className="mb-7 mt-2 max-w-prose text-sm leading-7 text-muted-foreground">لم تجد ما تبحث عنه؟ أرسل طلبًا خاصًا للإدارة. يمكنك متابعة حالته وقراءة رد الإدارة من صفحة طلباتي. إرسال الطلب لا يضمن إضافة العمل.</p><NewRequestForm initialTitle={title} /></>;
  });
}
