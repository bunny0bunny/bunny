import { getWorkTitle } from '@/lib/work-title';
import { EDITORIAL_LABELS, isPublicChapter } from "@/lib/editorial-state";
import Link from "next/link";
import { FileEdit, Eye, Plus } from "lucide-react";
import { getAdminChapters, currentProfileOrNull } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChapterWorkflowControls } from "@/components/admin/admin-client";
import { FORMAT_LABELS, WORKFLOW_LABELS, type Format, type Workflow } from "@/lib/constants";

export const dynamic = "force-dynamic";

const WORKFLOW_STYLES: Record<Workflow, string> = {
  published: "border-success/40 bg-success/10 text-success",
  review: "border-gold/40 bg-gold/10 text-gold",
  draft: "border-border bg-secondary text-muted-foreground",
};

export default async function AdminChaptersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const profile = await currentProfileOrNull();
  const isAdmin = profile?.role === "admin";
  const chapters = await getAdminChapters({ workflow: get("workflow"), format: get("format") });

  const filters = [
    { key: "all", label: "الكل", href: "/admin/chapters" },
    { key: "published", label: WORKFLOW_LABELS.published, href: "/admin/chapters?workflow=published" },
    { key: "review", label: WORKFLOW_LABELS.review, href: "/admin/chapters?workflow=review" },
    { key: "draft", label: WORKFLOW_LABELS.draft, href: "/admin/chapters?workflow=draft" },
    ...(["changes_requested", "approved", "scheduled", "withdrawn"] as const).map((key) => ({ key, label: EDITORIAL_LABELS[key], href: `/admin/chapters?workflow=${key}` })),
  ];
  const active = get("workflow") ?? "all";

  return (
    <main className="mx-auto max-w-6xl p-4 pt-6 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الفصول</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            الحالة التحريرية تخص أحدث نسخة. تبقى النسخة المنشورة متاحة أثناء تجهيز التعديلات.
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href="/admin/chapters/new">
            <Plus className="size-4" aria-hidden />
            فصل جديد
          </Link>
        </Button>
      </header>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <Button
            key={f.key}
            asChild
            size="sm"
            variant={active === f.key ? "secondary" : "ghost"}
            className={active === f.key ? "bg-accent text-foreground" : "text-muted-foreground"}
          >
            <Link href={f.href}>{f.label}</Link>
          </Button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-xs text-muted-foreground">
              <th className="p-3 text-start font-medium">الفصل</th>
              <th className="hidden p-3 text-start font-medium sm:table-cell">العمل</th>
              <th className="hidden p-3 text-start font-medium md:table-cell">المحتوى</th>
              <th className="p-3 text-start font-medium">التحكم</th>
            </tr>
          </thead>
          <tbody>
            {chapters.map((c) => (
              <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-accent/30">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <FileEdit className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <p className="font-medium text-foreground">الفصل {c.number}: {c.workingTitleAr}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className={`border ${WORKFLOW_STYLES[c.workingStatus === "published" ? "published" : c.workingStatus === "draft" ? "draft" : "review"]}`}
                        >
                          {EDITORIAL_LABELS[c.workingStatus]}
                        </Badge>
                        {isPublicChapter(c) && c.workingStatus !== "published" && <Badge variant="secondary">النسخة العامة منشورة</Badge>}
                        {c.isPremiumDemo && (
                          <Badge variant="secondary" className="border border-gold/40 bg-gold/10 text-gold">مقفل</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="hidden p-3 sm:table-cell">
                  <Link href={`/admin/series/${c.series.id}`} className="text-foreground hover:text-primary">
                    {getWorkTitle(c.series)}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">{FORMAT_LABELS[c.series.format as Format]}</p>
                </td>
                <td className="hidden p-3 text-muted-foreground md:table-cell">
                  {c.series.format === "novel" ? `${c.workingWordCount} كلمة` : `${c.workingPageCount} ${c.series.format === "manga" ? "صفحة" : "لوحة"}`}
                  {c.publishedAt && (
                    <p className="text-[11px]">
                      نُشر {c.publishedAt.toLocaleDateString("ar-EG")}
                    </p>
                  )}
                </td>
                <td className="p-3">
                  <ChapterWorkflowControls
                    chapter={{
                      id: c.id,
                      number: c.number,
                      titleAr: c.workingTitleAr,
                      workflow: c.workflow as Workflow,
                      workingStatus: c.workingStatus,
                      publicPublished: isPublicChapter(c),
                      isPremiumDemo: c.isPremiumDemo,
                      scheduledFor: c.workingScheduledFor ? c.workingScheduledFor.toISOString() : null,
                    }}
                    isAdmin={isAdmin}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {chapters.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <Eye className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">لا فصول بهذه الحالة.</p>
            <Button asChild variant="outline" size="sm" className="border-border">
              <Link href="/admin/chapters/new">إنشاء فصل جديد</Link>
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
