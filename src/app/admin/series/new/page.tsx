import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeriesForm } from "@/components/admin/admin-client";
import { currentProfileOrNull } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NewSeriesPage() {
  const profile = await currentProfileOrNull();
  if (!profile || profile.role !== "admin") {
    redirect("/admin?denied=1");
  }
  return (
    <main className="mx-auto max-w-5xl p-4 pt-6 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5 text-muted-foreground">
        <Link href="/admin/series">
          <ArrowRight className="size-4" aria-hidden />
          عودة إلى الأعمال
        </Link>
      </Button>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">عمل جديد</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          أضف بيانات العمل وغلافه، وبعد الحفظ تقدر تضيف أول فصل. العمل يظهر في الكتالوج بعد نشر فصل؛ رفع الغلاف أو الفصل لا ينشره تلقائيًا.
        </p>
      </header>
      <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
        <SeriesForm currentActorId={profile.id} />
      </div>
    </main>
  );
}
