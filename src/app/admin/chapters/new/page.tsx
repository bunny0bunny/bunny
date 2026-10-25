import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChapterForm } from "@/components/admin/admin-client";
import { getAdminSeries, currentProfileOrNull } from "@/lib/queries";
import type { Format } from "@/lib/constants";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewChapterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const preferred = typeof sp.series === "string" ? sp.series : undefined;
  const profile = await currentProfileOrNull();
  const isAdmin = profile?.role === "admin";
  const seriesList = await getAdminSeries({});
  // Scope the aggregate to the works already authorized for this actor.
  const highestNumbers = seriesList.length ? await db.chapter.groupBy({
    by: ["seriesId"],
    where: { seriesId: { in: seriesList.map(series => series.id) } },
    _max: { number: true },
  }) : [];
  const nextNumbers = new Map(highestNumbers.map(row => [row.seriesId, (row._max.number ?? 0) + 1]));
  const options = seriesList.map((s) => ({
    id: s.id,
    titleAr: s.titleAr,
    format: s.format as Format,
    nextNumber: nextNumbers.get(s.id) ?? 1,
  }));
  // preselect via ?series=
  if (preferred) options.sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0));

  return (
    <main className="mx-auto max-w-3xl p-4 pt-6 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5 text-muted-foreground">
        <Link href="/admin/chapters">
          <ArrowRight className="size-4" aria-hidden />
          عودة إلى الفصول
        </Link>
      </Button>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">فصل جديد</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          يمكن إدخال نص الرواية هنا. للفصول المصوّرة، أنشئ مسودة فارغة ثم انتقل إلى الاستوديو لرفع PDF ومعاينته قبل المراجعة.
        </p>
      </header>
      {options.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
          {isAdmin ? <>
            <p>أنشئ عملًا أولًا، ثم أضف الفصل الأول من صفحة إدارة العمل.</p>
            <Button asChild className="mt-4 min-h-11"><Link href="/admin/series/new">إنشاء عمل جديد</Link></Button>
          </> : <p>لا توجد أعمال مسندة إليك لإنشاء فصول لها. يرجى التواصل مع إدارة الموقع لإسناد العمل إليك أولًا.</p>}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
          <ChapterForm currentActorId={profile?.id ?? ""} seriesOptions={options} isAdmin={isAdmin} />
        </div>
      )}
    </main>
  );
}
