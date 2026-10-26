import { getWorkTitle } from '@/lib/work-title';
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PenTool,
  FileEdit,
  CheckCircle2,
  Clock,
  Eye,
  CalendarClock,
  Filter,
  Layers,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { SiteHeader, SiteFooter, BottomNav } from "@/components/library/chrome";
import { currentProfileOrNull } from "@/lib/queries";
import { isStaffRole, isAdminRole } from "@/lib/team-access";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PublishDueAdminButton } from "@/components/studio/publish-due-button";
import { FORMAT_LABELS, type Format } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "استوديو التحرير والمراجعة",
};

const STATUS_FILTER_LABELS: Record<string, string> = {
  all: "الكل",
  review: "قيد المراجعة",
  draft: "مسودة",
  changes_requested: "طُلبت تعديلات",
  approved: "معتمد",
  scheduled: "مجدول",
  published: "منشور",
};

const REVISION_BADGE_STYLES: Record<string, string> = {
  draft: "border-border bg-secondary text-muted-foreground",
  review: "border-gold/40 bg-gold/10 text-gold",
  changes_requested: "border-danger/40 bg-danger/10 text-danger",
  approved: "border-success/40 bg-success/10 text-success",
  scheduled: "border-primary/40 bg-primary/10 text-primary",
  published: "border-success/50 bg-success/15 text-success",
  withdrawn: "border-danger/50 bg-danger/15 text-danger",
};

export default async function StudioWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const statusParam = typeof sp.status === "string" ? sp.status : "all";

  // 1. Authenticate & Role Gate
  const actor = await currentProfileOrNull();
  if (!actor || !isStaffRole(actor.role)) {
    redirect("/login?next=/studio");
  }

  const isAdmin = isAdminRole(actor.role);

  // 2. Scoped Series IDs for staff
  let seriesWhere: any = {};
  if (!isAdmin) {
    const assignments = await db.seriesAssignment.findMany({
      where: { profileId: actor.id },
      select: { seriesId: true },
    });
    const assignedIds = assignments.map((a) => a.seriesId);
    seriesWhere = { seriesId: { in: assignedIds } };
  }

  // 3. Load chapters with series, assignments, and revisions
  // Note: Avoid opening a draft for every row on list render!
  const chapters = await db.chapter.findMany({
    where: seriesWhere,
    include: {
      series: {
        include: {
          assignments: {
            include: {
              profile: { select: { id: true, nickname: true, role: true } },
            },
          },
        },
      },
      revisions: {
        orderBy: { revisionNumber: "desc" },
        take: 1, // Only latest revision for the queue row
      },
      _count: {
        select: { pages: true, editorialEvents: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { number: "asc" }],
  });

  // Calculate status counts
  const counts = {
    all: chapters.length,
    review: 0,
    draft: 0,
    changes_requested: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
  };

  const rows = chapters.map((ch) => {
    const latestRev = ch.revisions[0] ?? null;
    const effectiveStatus = latestRev ? latestRev.status : ch.workflow; // legacy workflow label if uninitialized
    if (effectiveStatus in counts) {
      (counts as any)[effectiveStatus]++;
    }
    return {
      chapter: ch,
      latestRev,
      effectiveStatus,
      isUninitialized: !latestRev,
    };
  });

  // Filter rows
  const filteredRows = statusParam === "all"
    ? rows
    : rows.filter((r) => r.effectiveStatus === statusParam);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1 pb-24 md:pb-12">
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          {/* Top Header */}
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground sm:text-3xl">
                <PenTool className="size-6 text-primary" aria-hidden />
                استوديو التحرير وسير العمل
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                إدارة النسخ التحريرية، دورات المراجعة والاعتماد، وجدولة النشر للمكتبة.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {isAdmin && <PublishDueAdminButton />}
              <Button asChild size="sm" className="min-h-[44px] gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                <Link href="/admin/chapters/new">
                  إنشاء مسودة فصل جديد
                </Link>
              </Button>
            </div>
          </header>

          {/* Useful Count Cards */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Link
              href="/studio"
              className={`rounded-2xl border p-3.5 transition hover:border-primary/40 ${
                statusParam === "all" ? "border-primary bg-primary/10" : "border-border/60 bg-card"
              }`}
            >
              <div className="text-xs text-muted-foreground">إجمالي الفصول</div>
              <p className="mt-1 text-xl font-bold text-foreground">{counts.all}</p>
            </Link>
            <Link
              href="/studio?status=review"
              className={`rounded-2xl border p-3.5 transition hover:border-gold/40 ${
                statusParam === "review" ? "border-gold bg-gold/10" : "border-border/60 bg-card"
              }`}
            >
              <div className="text-xs text-gold">قيد المراجعة</div>
              <p className="mt-1 text-xl font-bold text-foreground">{counts.review}</p>
            </Link>
            <Link
              href="/studio?status=draft"
              className={`rounded-2xl border p-3.5 transition hover:border-border ${
                statusParam === "draft" ? "border-foreground/50 bg-secondary" : "border-border/60 bg-card"
              }`}
            >
              <div className="text-xs text-muted-foreground">مسودات عمل</div>
              <p className="mt-1 text-xl font-bold text-foreground">{counts.draft}</p>
            </Link>
            <Link
              href="/studio?status=changes_requested"
              className={`rounded-2xl border p-3.5 transition hover:border-danger/40 ${
                statusParam === "changes_requested" ? "border-danger bg-danger/10" : "border-border/60 bg-card"
              }`}
            >
              <div className="text-xs text-danger">طُلبت تعديلات</div>
              <p className="mt-1 text-xl font-bold text-foreground">{counts.changes_requested}</p>
            </Link>
            <Link
              href="/studio?status=approved"
              className={`rounded-2xl border p-3.5 transition hover:border-success/40 ${
                statusParam === "approved" ? "border-success bg-success/10" : "border-border/60 bg-card"
              }`}
            >
              <div className="text-xs text-success">معتمدة جاهزة</div>
              <p className="mt-1 text-xl font-bold text-foreground">{counts.approved}</p>
            </Link>
            <Link
              href="/studio?status=scheduled"
              className={`rounded-2xl border p-3.5 transition hover:border-primary/40 ${
                statusParam === "scheduled" ? "border-primary bg-primary/10" : "border-border/60 bg-card"
              }`}
            >
              <div className="text-xs text-primary">مجدولة للنشر</div>
              <p className="mt-1 text-xl font-bold text-foreground">{counts.scheduled}</p>
            </Link>
          </div>

          {/* Filter Bar */}
          <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-xl border border-border/60 bg-card p-1.5">
            {Object.entries(STATUS_FILTER_LABELS).map(([key, label]) => {
              const isActive = statusParam === key;
              return (
                <Button
                  key={key}
                  asChild
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className={`min-h-[38px] text-xs ${
                    isActive ? "bg-accent font-bold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Link href={key === "all" ? "/studio" : `/studio?status=${key}`}>
                    {label}
                  </Link>
                </Button>
              );
            })}
          </div>

          {/* Queue Rows / Table */}
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs text-muted-foreground">
                    <th className="p-3.5 text-start font-medium">الفصل والعمل</th>
                    <th className="hidden p-3.5 text-start font-medium sm:table-cell">الحالة والمراجعة</th>
                    <th className="hidden p-3.5 text-start font-medium md:table-cell">المحتوى والإسناد</th>
                    <th className="p-3.5 text-end font-medium">إجراء التحرير</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(({ chapter: ch, latestRev, effectiveStatus, isUninitialized }) => (
                    <tr
                      key={ch.id}
                      className="border-b border-border/40 last:border-0 hover:bg-accent/30"
                    >
                      {/* Chapter & Series */}
                      <td className="p-3.5">
                        <div className="flex items-start gap-3">
                          <div className="relative aspect-[3/4] w-12 shrink-0 overflow-hidden rounded-lg bg-secondary/40">
                            <img
                              src={ch.series.coverPath || "/art/covers/no-cover.svg"}
                              alt={getWorkTitle(ch.series)}
                              className="size-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div>
                            <Link
                              href={`/studio/chapters/${ch.id}`}
                              className="font-bold text-foreground transition hover:text-primary"
                            >
                              الفصل {ch.number}: {ch.titleAr}
                            </Link>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {getWorkTitle(ch.series)} · {FORMAT_LABELS[ch.series.format as Format]}
                            </p>
                            {/* Mobile badge */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${REVISION_BADGE_STYLES[effectiveStatus] ?? ""}`}
                              >
                                {STATUS_FILTER_LABELS[effectiveStatus] ?? effectiveStatus}
                              </Badge>
                              {isUninitialized && (
                                <span className="text-[10px] text-muted-foreground">(مسار سابق)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Status & Revision Details */}
                      <td className="hidden p-3.5 sm:table-cell">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={`text-xs ${REVISION_BADGE_STYLES[effectiveStatus] ?? ""}`}
                            >
                              {STATUS_FILTER_LABELS[effectiveStatus] ?? effectiveStatus}
                            </Badge>
                            {isUninitialized && (
                              <span className="text-[11px] text-muted-foreground">
                                لم يُفتح بعد بالاستوديو
                              </span>
                            )}
                          </div>
                          {latestRev && (
                            <span className="text-[11px] text-muted-foreground">
                              مراجعة #{latestRev.revisionNumber} (v{latestRev.version})
                            </span>
                          )}
                          {ch.scheduledFor && (
                            <span className="flex items-center gap-1 text-[11px] text-primary" dir="ltr">
                              <CalendarClock className="size-3" />
                              {new Date(ch.scheduledFor).toLocaleDateString("ar-EG")}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Content & Assignees */}
                      <td className="hidden p-3.5 text-xs text-muted-foreground md:table-cell">
                        <div>
                          {ch.series.format === "novel" ? (
                            <span>نص روائي</span>
                          ) : (
                            <span>{ch._count.pages} {ch.series.format === "manga" ? "صفحة" : "لوحة"}</span>
                          )}
                        </div>
                        {ch.series.assignments.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {ch.series.assignments.map((a) => (
                              <span
                                key={a.id}
                                className="rounded bg-secondary/80 px-1.5 py-0.5 text-[10px] text-foreground/80"
                              >
                                {a.profile.nickname}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Action Link */}
                      <td className="p-3.5 text-end">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                        >
                          <Link href={`/studio/chapters/${ch.id}`}>
                            <PenTool className="size-4" aria-hidden />
                            إدارة النسخة
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredRows.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
                <FileEdit className="size-8" aria-hidden />
                <p className="text-sm">لا توجد فصول تطابق الفلتر المحدد حاليًا.</p>
                <Button asChild variant="outline" size="sm" className="mt-2 min-h-[44px]">
                  <Link href="/studio">عرض كل الفصول</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
