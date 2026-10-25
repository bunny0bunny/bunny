import Link from "next/link";
import { withDatabaseScope } from "@/lib/db";
import { listMyRequests } from "@/lib/content-requests/service";
import { CATEGORY_LABELS } from "@/lib/content-requests/contracts";
import { requireRequestProfile, RequestStatusBadge, RequestError, RequestPagination, requestDate } from "@/components/content-requests/server";
import { Button } from "@/components/ui/button";
export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<{page?: string}> }) {
  const { page } = await searchParams;
  return withDatabaseScope(async () => {
    await requireRequestProfile(`/requests${page ? `?page=${encodeURIComponent(page)}` : ""}`);
    const result = await listMyRequests({ page: Number(page) || 1 });
    return <><header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold sm:text-3xl">طلباتي</h1><p className="mt-2 text-sm leading-7 text-muted-foreground">تابع طلباتك وردود الإدارة هنا. هذه المراسلات خاصة بك.</p></div><Button asChild className="min-h-11"><Link href="/requests/new">اطلب عملًا</Link></Button></header>{!result.ok ? <RequestError error={result.error} /> : <>{result.data.items.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center"><h2 className="text-lg font-semibold">لم ترسل طلبات بعد</h2><p className="mt-2 text-sm text-muted-foreground">هل هناك عمل تود قراءته؟ أرسل اسمه إلى الإدارة.</p><Button asChild className="mt-5 min-h-11" variant="outline"><Link href="/requests/new">إرسال أول طلب</Link></Button></div> : <><p className="mb-3 text-sm text-muted-foreground">{result.data.total} طلب</p><ul className="divide-y divide-border rounded-2xl border border-border bg-card">{result.data.items.map(item => <li key={item.id}><Link href={`/requests/${item.id}`} className="block space-y-3 p-5 transition hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-primary"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="min-w-0 break-words font-semibold"><bdi>{item.title}</bdi></h2><RequestStatusBadge status={item.status} /></div><p className="text-xs text-muted-foreground">{CATEGORY_LABELS[item.category]} · {requestDate(item.createdAt)}</p>{item.reply && <p className="text-sm text-primary">لديك رد من الإدارة</p>}</Link></li>)}</ul></>}<RequestPagination page={result.data.page} pages={result.data.pages} href={p => `/requests?page=${p}`} /></>}</>;
  });
}
