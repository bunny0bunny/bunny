import Link from "next/link";
import { withDatabaseScope } from "@/lib/db";
import { getAdminRequest } from "@/lib/content-requests/service";
import { CATEGORY_LABELS } from "@/lib/content-requests/contracts";
import { requireRequestProfile, RequestStatusBadge, RequestError } from "@/components/content-requests/server";
import { AdminRequestControls } from "@/components/content-requests/admin-request-controls";
export const dynamic = "force-dynamic";
export const metadata = { title: "مراجعة طلب — الإدارة", robots: { index: false, follow: false } };
export default async function AdminRequestPage({ params }: { params: Promise<{id: string}> }) {
  const { id } = await params;
  return withDatabaseScope(async () => {
    await requireRequestProfile(`/admin/requests/${encodeURIComponent(id)}`, true);
    const result = await getAdminRequest(id);
    return <main className="mx-auto max-w-4xl px-4 py-7 sm:px-6"><Link href="/admin/requests" className="mb-4 inline-flex min-h-11 items-center text-sm text-primary">العودة إلى طلبات القراء</Link>{!result.ok ? <RequestError error={result.error} /> : <><header className="mb-7"><h1 className="break-words text-2xl font-bold"><bdi>{result.data.title}</bdi></h1><div className="mt-3 flex flex-wrap items-center gap-3"><RequestStatusBadge status={result.data.status} /><p className="text-sm text-muted-foreground">{CATEGORY_LABELS[result.data.category]} · {result.data.requesterCount} قارئ مهتم</p></div></header><AdminRequestControls detail={result.data} /></>}</main>;
  });
}
