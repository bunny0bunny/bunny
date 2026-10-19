import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PenTool, ChevronLeft, ArrowRight, Eye, ShieldAlert } from "lucide-react";
import { SiteHeader, SiteFooter, BottomNav } from "@/components/library/chrome";
import { currentProfileOrNull } from "@/lib/queries";
import { isStaffRole, canManageSeries } from "@/lib/team-access";
import { db } from "@/lib/db";
import { openOrCreateDraft } from "@/lib/editorial";
import { EditorialEditor } from "@/components/studio/editorial-editor";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "إدارة نسخة الفصل | استوديو التحرير",
};

export default async function StudioChapterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: chapterId } = await params;

  // 1. Authenticate & Role Gate
  const actor = await currentProfileOrNull();
  if (!actor || !isStaffRole(actor.role)) {
    redirect("/login?next=/studio");
  }

  // 2. Load chapter with series and check assigned series access
  let chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    include: {
      series: true,
      revisions: {
        orderBy: { revisionNumber: "desc" },
      },
      editorialEvents: {
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { nickname: true } },
        },
      },
    },
  });

  if (!chapter) {
    notFound();
  }

  // Scoped permissions check: staff accesses only assigned series, admin global
  const hasAccess = await canManageSeries(actor, chapter.seriesId);
  if (!hasAccess) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto flex flex-1 max-w-lg flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-danger/40 bg-danger/10 text-danger">
            <ShieldAlert className="size-7" />
          </div>
          <h1 className="text-xl font-bold">غير مصرح بالوصول لهذا العمل</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            هذا الفصل ينتمي إلى عمل غير مسند لحسابك الحالي. بإمكانك طلب الإسناد من مدير النظام.
          </p>
          <Button asChild className="mt-6">
            <Link href="/studio">العودة لاستوديو التحرير</Link>
          </Button>
        </main>
        <SiteFooter />
      </div>
    );
  }

  // 3. Open or get working draft revision (lazily initialized or created if none open)
  const openResult = await openOrCreateDraft(chapterId);
  if (!openResult.ok || !openResult.revision) {
    throw new Error(openResult.error ?? "تعذّر فتح مسودة الفصل التحريرية");
  }

  const workingRevision = openResult.revision;

  // Opening can initialize/fork snapshots: render the resulting public version
  // and history, including the event just written, rather than the old query.
  chapter = await db.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: { series: true, revisions: { orderBy: { revisionNumber: "desc" } }, editorialEvents: { orderBy: { createdAt: "desc" }, include: { actor: { select: { nickname: true } } } } },
  });

  // 4. Derive active published snapshot (highest revisionNumber published)
  const publishedRev = chapter.workflow === "published" ? chapter.revisions.find((r) => r.status === "published") ?? null : null;

  // Format events
  const formattedEvents = chapter.editorialEvents.map((ev) => ({
    id: ev.id,
    action: ev.action,
    reasonAr: ev.reasonAr,
    createdAt: ev.createdAt.toISOString(),
    actorName: ev.actor?.nickname ?? "النظام",
    metadata: ev.metadata,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1 pb-24 md:pb-12">
        <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
          {/* Breadcrumb Navigation */}
          <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link href="/studio" className="transition hover:text-foreground">
              استوديو التحرير
            </Link>
            <ChevronLeft className="size-3.5" aria-hidden />
            <Link href={`/admin/series/${chapter.seriesId}`} className="transition hover:text-foreground">
              {chapter.series.titleAr}
            </Link>
            <ChevronLeft className="size-3.5" aria-hidden />
            <span className="font-semibold text-foreground">
              الفصل {chapter.number}
            </span>
          </nav>

          {/* Header */}
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground">
                <PenTool className="size-6 text-primary" aria-hidden />
                إدارة نسخة الفصل {chapter.number}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {chapter.series.titleAr} — {chapter.titleAr}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {chapter.workflow === "published" && (
                <Button asChild variant="outline" size="sm" className="min-h-[44px] gap-1.5 border-border">
                  <Link href={`/read/${chapter.series.format}/${chapter.series.slug}/${chapter.number}`} target="_blank">
                    <Eye className="size-4" />
                    عرض الفصل في القارئ
                  </Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="sm" className="min-h-[44px] gap-1.5">
                <Link href="/studio">
                  <ArrowRight className="size-4" />
                  العودة للقائمة
                </Link>
              </Button>
            </div>
          </header>

          {/* Client Editor Component */}
          <EditorialEditor
            uploadsEnabled={process.env.MEDIA_UPLOADS_ENABLED === "1"}
            chapter={{
              id: chapter.id,
              number: chapter.number,
              titleAr: chapter.titleAr,
              seriesId: chapter.seriesId,
              seriesTitleAr: chapter.series.titleAr,
              seriesSlug: chapter.series.slug,
              format: chapter.series.format,
              workflow: chapter.workflow,
              isPublishedPublicly: chapter.workflow === "published",
            }}
            initialRevision={{
              id: workingRevision.id,
              chapterId: workingRevision.chapterId,
              revisionNumber: workingRevision.revisionNumber,
              version: workingRevision.version,
              pendingUploadId: workingRevision.pendingUploadId,
              status: workingRevision.status,
              titleAr: workingRevision.titleAr,
              readingDirection: workingRevision.readingDirection,
              isPremiumDemo: workingRevision.isPremiumDemo,
              novelBody: workingRevision.novelBody,
              pagesJson: workingRevision.pagesJson,
              scheduledFor: workingRevision.scheduledFor ? workingRevision.scheduledFor.toISOString() : null,
              approvedById: workingRevision.approvedById,
              approvedAt: workingRevision.approvedAt ? workingRevision.approvedAt.toISOString() : null,
              createdAt: workingRevision.createdAt.toISOString(),
              updatedAt: workingRevision.updatedAt.toISOString(),
            }}
            publishedSnapshot={
              publishedRev
                ? {
                    id: publishedRev.id,
                    revisionNumber: publishedRev.revisionNumber,
                    version: publishedRev.version,
                    titleAr: publishedRev.titleAr,
                    novelBody: publishedRev.novelBody,
                    pagesJson: publishedRev.pagesJson,
                    publishedAt: chapter.publishedAt ? chapter.publishedAt.toISOString() : null,
                  }
                : null
            }
            events={formattedEvents}
            currentActorRole={actor.role as any}
          />
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
