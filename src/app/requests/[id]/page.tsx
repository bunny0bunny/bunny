import Link from "next/link";
import { withDatabaseScope } from "@/lib/db";
import { getMyRequest } from "@/lib/content-requests/service";
import { CATEGORY_LABELS } from "@/lib/content-requests/contracts";
import { requireRequestProfile, RequestStatusBadge, RequestError, requestDate } from "@/components/content-requests/server";
import { Button } from "@/components/ui/button";
export default async function MyRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withDatabaseScope(async () => {
    await requireRequestProfile(`/requests/${encodeURIComponent(id)}`);
    const result = await getMyRequest(id);
    if (!result.ok) return <><Link className="mb-4 inline-flex min-h-11 items-center text-sm text-primary" href="/requests">العودة إلى طلباتي</Link><RequestError error={result.error} /></>;
    const item = result.data;
    return <><Link className="mb-4 inline-flex min-h-11 items-center text-sm text-primary" href="/requests">العودة إلى طلباتي</Link><header className="mb-7 space-y-3"><h1 className="break-words text-2xl font-bold sm:text-3xl"><bdi>{item.title}</bdi></h1><div className="flex flex-wrap items-center gap-3"><RequestStatusBadge status={item.status} /><span className="text-xs text-muted-foreground">{CATEGORY_LABELS[item.category]} · أُرسل {requestDate(item.createdAt)}</span></div></header><div className="divide-y divide-border rounded-2xl border border-border bg-card px-5 sm:px-7">{item.statusNote && <section className="py-6"><h2 className="mb-2 font-semibold">تحديث الحالة</h2><p className="whitespace-pre-wrap break-words text-sm leading-8">{item.statusNote}</p></section>}<section className="py-6"><h2 className="mb-2 font-semibold">رد الإدارة</h2><p className="whitespace-pre-wrap break-words text-sm leading-8 text-muted-foreground">{item.reply || "لم ترد الإدارة بعد. ستصلك إشعارات عند وجود تحديث."}</p></section><section className="py-6"><h2 className="mb-2 font-semibold">طلبك الأصلي</h2><p className="whitespace-pre-wrap break-words text-sm leading-8 text-muted-foreground">{item.message || "لم تُرفق رسالة إضافية."}</p>{item.referenceUrl && <a className="mt-2 inline-flex min-h-11 max-w-full items-center break-all text-sm text-primary underline underline-offset-4" href={item.referenceUrl} target="_blank" rel="noopener noreferrer">فتح الرابط المرجعي</a>}</section></div>{item.status === "available" && !item.availableSeries && <p role="status" className="mt-6 rounded-xl border border-border p-5 text-sm text-muted-foreground">العمل المرتبط بهذا الطلب غير متاح حاليًا. يظل طلبك وتحديثاته محفوظة.</p>}{item.availableSeries && <section className="mt-6 rounded-xl border border-primary/30 bg-primary/10 p-5"><h2 className="font-semibold">العمل متاح في المكتبة</h2><Button asChild className="mt-3 min-h-11"><Link href={item.availableSeries.href}>قراءة <bdi>{item.availableSeries.title}</bdi></Link></Button></section>}</>;
  });
}
