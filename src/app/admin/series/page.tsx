import Link from "next/link";
import Image from "next/image";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { getAdminSeries, currentProfileOrNull } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SeriesFilters } from "@/components/admin/admin-client";
import { FORMAT_LABELS, STATUS_LABELS, type Format, type SeriesStatus, type Workflow } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AdminSeriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const profile = await currentProfileOrNull();
  const isAdmin = profile?.role === "admin";
  const series = await getAdminSeries({ q: get("q"), format: get("format"), status: get("status") });

  return (
    <main className="mx-auto max-w-6xl p-4 pt-6 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{isAdmin ? "الأعمال" : "أعمالي المسندة"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? `${series.length} عمل في مكتبة العرض.` : `${series.length} عمل مسند إليك.`}
          </p>
        </div>
        {isAdmin && (
          <Button asChild size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/admin/series/new">
              <Plus className="size-4" aria-hidden />
              عمل جديد
            </Link>
          </Button>
        )}
      </header>

      <div className="mb-4">
        <SeriesFilters initial={{ q: get("q"), format: get("format"), status: get("status") }} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-start text-xs text-muted-foreground">
              <th className="p-3 text-start font-medium">العمل</th>
              <th className="p-3 text-start font-medium">الصيغة</th>
              <th className="p-3 text-start font-medium">الحالة</th>
              <th className="hidden p-3 text-start font-medium sm:table-cell">الفصول</th>
              <th className="hidden p-3 text-start font-medium md:table-cell">القراءات</th>
              <th className="p-3 text-start font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.id} className="border-b border-border/40 transition last:border-0 hover:bg-accent/30">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <span className="relative block size-11 shrink-0 overflow-hidden rounded-lg border border-border/60">
                      {s.coverPath ? <Image src={s.coverPath} alt="" fill sizes="44px" className="object-cover" /> : <span className="flex h-full items-center justify-center bg-secondary text-[10px] text-muted-foreground">بلا غلاف</span>}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{s.titleAr}</p>
                      <p className="truncate text-[11px] text-muted-foreground" dir="ltr">{s.slug}</p>
                    </div>
                    {s.isFeatured && <Badge variant="secondary" className="hidden border-gold/40 bg-gold/10 text-gold lg:inline-flex">مميز</Badge>}
                  </div>
                </td>
                <td className="p-3 text-muted-foreground">{FORMAT_LABELS[s.format as Format]}</td>
                <td className="p-3">
                  <Badge variant="secondary" className="border border-border bg-secondary/60 text-muted-foreground">
                    {STATUS_LABELS[s.status as SeriesStatus]}
                  </Badge>
                </td>
                <td className="hidden p-3 tabular-nums text-muted-foreground sm:table-cell">{s._count.chapters}</td>
                <td className="hidden p-3 tabular-nums text-muted-foreground md:table-cell">{s.reads.toLocaleString("ar-EG")}</td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5">
                    <Button asChild variant="ghost" size="icon" className="size-8 text-muted-foreground" title={isAdmin ? "تعديل البيانات" : "عرض العمل والفصول"}>
                      <Link href={`/admin/series/${s.id}`}>
                        <Pencil className="size-4" aria-hidden />
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="icon" className="size-8 text-muted-foreground" title="معاينة الصفحة العامة">
                      <Link href={`/series/${s.slug}`} target="_blank">
                        <ExternalLink className="size-4" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {series.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            لا أعمال مطابقة. أنشئ عملًا جديدًا أو عدّل المرشحات.
          </p>
        )}
      </div>
    </main>
  );
}
