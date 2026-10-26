import { getWorkTitle } from '@/lib/work-title';
import Link from "next/link";
import { AlertTriangle, ArrowUpLeft, BookOpen, CheckCircle2, FileEdit, LibraryBig, ListOrdered, Eye, Users } from "lucide-react";
import { getAdminOverview, getDashboardActivity, getCommunityCounts, getStaffOverview, currentProfileOrNull } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActivityChart } from "@/components/admin/activity-chart";
import { WORKFLOW_LABELS, type Workflow, FORMAT_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

const EVENT_TEXT: Record<string, string> = {
  read_start: "بدأ قراءة",
  read_page: "تابع قراءة",
  read_complete: "أكمل قراءة",
  login: "سجّل الدخول",
  publish: "نُشر فصل جديد",
};

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const denied = sp.denied === "1";
  const profile = await currentProfileOrNull();

  // Non-admin staff landing (contributor/editor): assigned works view without redirect loop
  if (profile && profile.role !== "admin") {
    const staff = await getStaffOverview();
    const seriesList = staff?.series ?? [];

    return (
      <main className="mx-auto max-w-6xl p-4 pt-6 sm:p-6 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">مساحة العمل</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              الأعمال المسندة إليك للمساهمة وإعداد ومراجعة الفصول.
            </p>
          </div>
          <Button asChild size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/admin/chapters/new"><ListOrdered className="size-4" /> فصل جديد</Link>
          </Button>
        </header>

        {denied && (
          <p role="alert" className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            لا تملك صلاحية الوصول إلى تلك الشاشة.
          </p>
        )}

        {seriesList.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-card p-12 text-center">
            <LibraryBig className="mx-auto size-12 text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold text-foreground">لا توجد أعمال مسندة بعد</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              لم يقم مدير المكتبة بإسناد أي عمل إلى حسابك حاليًا. عند إسناد عمل، سيظهر هنا لإعداد الفصول وتعديل المسودات.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {seriesList.map((s) => (
              <Card key={s.id} className="border-border/60 bg-card hover:border-primary/40 transition">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px]">{FORMAT_LABELS[s.format]}</Badge>
                    <span className="text-xs text-muted-foreground">{s._count.chapters} فصل</span>
                  </div>
                  <CardTitle className="text-base mt-2 truncate">
                    <Link href={`/admin/series/${s.id}`} className="hover:text-primary transition-colors">
                      {getWorkTitle(s)}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground truncate">{s.author}</span>
                  <Button asChild variant="ghost" size="sm" className="gap-1 text-xs text-primary">
                    <Link href={`/admin/series/${s.id}`}>
                      إدارة العمل
                      <ArrowUpLeft className="size-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    );
  }

  // Admin global dashboard
  const o = await getAdminOverview();
  if (!o) return null;
  const [chart, community] = await Promise.all([getDashboardActivity(14), getCommunityCounts()]);

  const cards = [
    { label: "الأعمال", value: o.seriesCount, icon: LibraryBig, href: "/admin/series" },
    { label: "الفصول المنشورة", value: o.publishedCount, icon: CheckCircle2, href: "/admin/chapters?workflow=published" },
    { label: "قيد المراجعة", value: o.reviewCount, icon: Eye, href: "/admin/chapters?workflow=review" },
    { label: "المسودات", value: o.draftCount, icon: FileEdit, href: "/admin/chapters?workflow=draft" },
    { label: "طُلبت تعديلات", value: o.changesRequestedCount, icon: FileEdit, href: "/admin/chapters?workflow=changes_requested" },
    { label: "معتمد", value: o.approvedCount, icon: CheckCircle2, href: "/admin/chapters?workflow=approved" },
    { label: "مجدول", value: o.scheduledCount, icon: Eye, href: "/admin/chapters?workflow=scheduled" },
    { label: "قراءو العرض", value: o.profileCount, icon: Users, href: "/admin/series" },
    { label: "إجمالي الأحداث", value: o.eventCount, icon: BookOpen, href: "/admin" },
  ];

  return (
    <main className="mx-auto max-w-6xl p-4 pt-6 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">اللوحة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            نظرة سريعة على الأعمال والفصول ونشاط القراء في المكتبة.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="border-border gap-1.5">
            <Link href="/admin/series/new"><LibraryBig className="size-4" /> عمل جديد</Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/admin/chapters/new"><ListOrdered className="size-4" /> فصل جديد</Link>
          </Button>
        </div>
      </header>

      {denied && (
        <p role="alert" className="mb-5 flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          لا تملك صلاحية الوصول إلى تلك الشاشة.
        </p>
      )}

      {/* Status cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="مؤشرات عامة">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <Card className="border-border/60 bg-card transition hover:border-primary/40">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <c.icon className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{c.value}</p>
                <p className="text-[11px] text-muted-foreground">{c.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Activity chart (Release B) */}
        <Card className="border-border/60 bg-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">نشاط آخر ١٤ يومًا</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityChart data={chart} />
          </CardContent>
        </Card>

        {/* Community pulse (Release B) */}
        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">نبض المجتمع</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border/40 bg-secondary/40 p-3">
              <p className="text-xl font-bold tabular-nums">{community.comments}</p>
              <p className="text-[11px] text-muted-foreground">تعليق ظاهر</p>
            </div>
            <div className="rounded-xl border border-border/40 bg-secondary/40 p-3">
              <p className="text-xl font-bold tabular-nums">{community.ratings}</p>
              <p className="text-[11px] text-muted-foreground">تقييم</p>
            </div>
            <div className="rounded-xl border border-border/40 bg-secondary/40 p-3">
              <p className="text-xl font-bold tabular-nums">{community.libraryItems}</p>
              <p className="text-[11px] text-muted-foreground">عنصر بمكتبات القراء</p>
            </div>
            <div className="rounded-xl border border-border/40 bg-secondary/40 p-3">
              <p className="text-xl font-bold tabular-nums">{community.avgRating.toFixed(1)}</p>
              <p className="text-[11px] text-muted-foreground">متوسط التقييم العام</p>
            </div>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">النشاط الأخير</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {o.recentEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 text-sm">
                <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span className="text-foreground/90">{EVENT_TEXT[e.type] ?? e.type}</span>
                {e.series && <Link href={`/series/${e.series.slug}`} className="truncate text-muted-foreground hover:text-primary">{getWorkTitle(e.series)}</Link>}
                {e.profile?.nickname && <span className="ms-auto shrink-0 text-[11px] text-muted-foreground">{e.profile.nickname}</span>}
              </div>
            ))}
            {o.recentEvents.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">لا نشاط بعد.</p>}
          </CardContent>
        </Card>

        {/* Top series + content status */}
        <div className="space-y-4">
          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">الأعمال الأعلى قراءة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {o.topSeries.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="w-5 text-center text-sm font-bold text-gold">{i + 1}</span>
                  <Link href={`/series/${s.slug}`} className="flex-1 truncate text-sm text-foreground hover:text-primary">
                    {getWorkTitle(s)}
                  </Link>
                  <span className="text-xs tabular-nums text-muted-foreground">{s.reads.toLocaleString("ar-EG")} قراءة</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">حالة المحتوى</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs leading-relaxed text-muted-foreground">حالة التحرير تخص أحدث نسخة؛ قد يكون للفصل المنشور مسودة بديلة أو نسخة قيد المراجعة، لذا تتداخل أعداد النشر والتحرير.</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" /> {WORKFLOW_LABELS.published} ({o.publishedCount})</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-gold" /> {WORKFLOW_LABELS.review} ({o.reviewCount})</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground/40" /> {WORKFLOW_LABELS.draft} ({o.draftCount})</span>
                <Badge variant="secondary" className="ms-auto border-border">إجمالي الفصول: {o.chapterCount}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card">
            <CardContent className="flex items-center justify-between p-4">
              <p className="text-sm text-muted-foreground">
                ترتيب سير العمل: <strong className="text-foreground">مسودة ← مراجعة ← منشور</strong>
              </p>
              <Button asChild variant="ghost" size="sm" className="gap-1 text-primary">
                <Link href="/admin/chapters">
                  إدارة الفصول
                  <ArrowUpLeft className="size-4" aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
