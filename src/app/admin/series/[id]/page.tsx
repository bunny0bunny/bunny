import { EDITORIAL_LABELS, isPublicChapter } from "@/lib/editorial-state";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink, ListOrdered, Plus } from "lucide-react";
import { getAdminSeriesById, parseJsonArray, currentProfileOrNull, getAssignableStaff } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChapterWorkflowControls, SeriesForm } from "@/components/admin/admin-client";
import { TeamAssignmentPanel } from "@/components/admin/team-assignment-panel";
import { FORMAT_LABELS, STATUS_LABELS, type Format, type SeriesStatus, type Workflow } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AdminSeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await currentProfileOrNull();
  const isAdmin = profile?.role === "admin";
  const s = await getAdminSeriesById(id);
  if (!s) notFound();
  const genres = parseJsonArray(s.genresJson);

  const staff = isAdmin ? await getAssignableStaff() : [];
  const assignedProfileIds = (s as any).assignments?.map((a: any) => a.profileId) ?? [];

  const publishedCount = s.chapters.filter((c) => isPublicChapter(c)).length;

  return (
    <main className="mx-auto max-w-5xl p-4 pt-6 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5 text-muted-foreground">
        <Link href="/admin/series">
          <ArrowRight className="size-4" aria-hidden />
          عودة إلى الأعمال
        </Link>
      </Button>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative block size-14 shrink-0 overflow-hidden rounded-xl border border-border/60">
            {s.coverPath ? <Image src={s.coverPath} alt="" fill sizes="56px" className="object-cover" /> : <span className="flex h-full items-center justify-center bg-secondary text-xs text-muted-foreground">بلا غلاف</span>}
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground">{s.titleAr}</h1>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {FORMAT_LABELS[s.format as Format]} · {STATUS_LABELS[s.status as SeriesStatus]} · {publishedCount}/{s.chapters.length} فصل منشور · {s.reads.toLocaleString("ar-EG")} قراءة
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5 border-border">
            <Link href={`/admin/chapters/new?series=${s.id}`}>
              <Plus className="size-4" aria-hidden />
              فصل جديد
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5 border-border">
            <Link href={`/series/${s.slug}`} target="_blank">
              <ExternalLink className="size-4" aria-hidden />
              صفحة العمل العامة
            </Link>
          </Button>
        </div>
      </header>

      {/* Chapters management */}
      <section className="mb-8" aria-label="إدارة الفصول">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <ListOrdered className="size-5 text-primary" aria-hidden />
          الفصول
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs text-muted-foreground">
                <th className="p-3 text-start font-medium">الفصل</th>
                <th className="hidden p-3 text-start font-medium sm:table-cell">المحتوى</th>
                <th className="hidden p-3 text-start font-medium md:table-cell">سير العمل</th>
                <th className="p-3 text-start font-medium">التحكم</th>
              </tr>
            </thead>
            <tbody>
              {s.chapters.map((c) => (
                <tr key={c.id} className="border-b border-border/40 last:border-0">
                  <td className="p-3">
                    <p className="font-medium text-foreground">الفصل {c.number}: {c.workingTitleAr}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      {c.isPremiumDemo && (
                        <Badge variant="secondary" className="border-gold/40 bg-gold/10 text-gold">مقفل</Badge>
                      )}
                      {isPublicChapter(c) ? "النسخة العامة منشورة" : "غير منشور للعامة"}
                    </p>
                  </td>
                  <td className="hidden p-3 tabular-nums text-muted-foreground sm:table-cell">{s.format === "novel" ? `${c.workingWordCount} كلمة` : `${c.workingPageCount} صفحة`}</td>
                  <td className="hidden p-3 md:table-cell">
                    <Badge
                      variant="secondary"
                      className={
                        c.workingStatus === "published"
                          ? "border-success/40 bg-success/10 text-success"
                          : c.workingStatus === "review"
                            ? "border-gold/40 bg-gold/10 text-gold"
                            : "border-border bg-secondary text-muted-foreground"
                      }
                    >
                      {EDITORIAL_LABELS[c.workingStatus]}
                    </Badge>
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
          {s.chapters.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">لا فصول بعد — أنشئ أول فصل.</p>
          )}
        </div>
      </section>

      {/* Team assignment (admin only) */}
      {isAdmin && (
        <section className="mb-8" aria-label="إسناد العمل للفريق">
          <TeamAssignmentPanel
            seriesId={s.id}
            staff={staff}
            assignedProfileIds={assignedProfileIds}
          />
        </section>
      )}

      {/* Metadata editing (admin only) */}
      {isAdmin && (
        <section aria-label="تعديل بيانات العمل">
          <h2 className="mb-3 text-lg font-bold">تعديل البيانات</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
            <SeriesForm
              currentActorId={profile?.id ?? ""}
              readingFormatLocked={s.chapters.length > 0}
              initial={{
                id: s.id,
                coverPath: s.coverPath,
                titleAr: s.titleAr,
                titleOriginal: s.titleOriginal ?? "",
                slug: s.slug,
                synopsisAr: s.synopsisAr,
                category: s.category,
                format: s.format as Format,
                status: s.status as SeriesStatus,
                author: s.author,
                translator: s.translator ?? "",
                genres,
                isFeatured: s.isFeatured,
              }}
            />
          </div>
        </section>
      )}
    </main>
  );
}
