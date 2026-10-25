import Link from "next/link";
import { redirect } from "next/navigation";
import { currentProfileOrNull } from "@/lib/queries";
import { REQUEST_STATUS_LABELS, type RequestStatus } from "@/lib/content-requests/contracts";
export async function requireRequestProfile(next: string, admin = false) {
  const profile = await currentProfileOrNull();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (admin && profile.role !== "admin") redirect("/admin");
  return profile;
}
export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${status === "available" ? "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300" : "border-border bg-secondary text-foreground"}`}>{REQUEST_STATUS_LABELS[status]}</span>;
}
const requestErrors: Record<string, string> = {
  unauthenticated: "انتهت جلسة الحساب أو لم يعد الحساب متاحًا. سجّل الدخول مجددًا لعرض طلباتك.",
  forbidden: "لا تملك صلاحية الوصول إلى هذه الطلبات.",
  not_found: "لم نجد هذا الطلب ضمن الطلبات المتاحة لحسابك.",
  invalid_input: "تعذّر قراءة المرشحات. عد إلى قائمة الطلبات وحاول مجددًا.",
  conflict: "تغيّرت بيانات الطلب. أعد تحميل الصفحة لعرض آخر تحديث.",
};
export function RequestError({ error }: { error: string }) { return <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm leading-7 text-foreground">{requestErrors[error] ?? "تعذّر تحميل الطلبات الآن. أعد تحميل الصفحة للمحاولة مجددًا."}</p>; }
export function RequestPagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  return <nav aria-label="صفحات الطلبات" className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">{page > 1 ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 hover:bg-accent" href={href(page - 1)}>السابق</Link> : <span />}<span className="text-muted-foreground">صفحة {page} من {pages}</span>{page < pages ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 hover:bg-accent" href={href(page + 1)}>التالي</Link> : <span />}</nav>;
}
export const requestDate = (date: string) => new Date(date).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" });
