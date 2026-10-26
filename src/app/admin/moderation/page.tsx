import { getWorkTitle } from '@/lib/work-title';
import Link from "next/link";
import { MessageSquareWarning, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole, getModerationQueue } from "@/lib/queries";
import { ModerateActions } from "@/components/admin/moderate-actions";
import { COMMENT_STATUS_LABELS, type CommentStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AdminModerationPage() {
  await requireRole(["admin", "editor"]);
  const q = await getModerationQueue();

  return (
    <main className="mx-auto max-w-4xl p-4 pt-6 sm:p-6">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <MessageSquareWarning className="size-6 text-gold" aria-hidden />
          الإشراف على المجتمع
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          التعليقات المُبلّغ عنها والمخفية — الإجراءات تظهر فورًا في الموقع العام.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="border-border/60 bg-card">
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums">{q.items.filter((i) => i.status === "flagged").length}</p>
            <p className="text-[11px] text-muted-foreground">بانتظار المراجعة</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card">
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums">{q.hiddenCount}</p>
            <p className="text-[11px] text-muted-foreground">تعليق مخفي</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card">
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums">{q.reportCount}</p>
            <p className="text-[11px] text-muted-foreground">إجمالي البلاغات</p>
          </CardContent>
        </Card>
      </div>

      {q.items.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-success" aria-hidden />
          لا شيء يتطلب انتباهك — المجتمع بحالة جيدة.
        </p>
      ) : (
        <ul className="space-y-3">
          {q.items.map((c) => (
            <li key={c.id} className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-start gap-3">
                <Avatar className="size-9 border border-border">
                  <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                    {c.profile.nickname.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{c.profile.nickname}</span>
                    <Badge variant="secondary" className={c.status === "flagged" ? "border border-gold/40 bg-gold/10 text-gold" : "border border-danger/40 bg-danger/10 text-danger"}>
                      {COMMENT_STATUS_LABELS[c.status as CommentStatus]}
                    </Badge>
                    {c.reports.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {c.reports.length} بلاغ {c.reports[0].profile && <>· آخرها من {c.reports[0].profile.nickname}</>}
                      </span>
                    )}
                    <Link href={`/series/${c.series.slug}`} className="text-[11px] text-muted-foreground hover:text-primary">
                      على «{getWorkTitle(c.series)}»{c.chapter ? ` · الفصل ${c.chapter.number}` : ""}
                    </Link>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-7 text-foreground/90">{c.body}</p>
                  <div className="mt-3">
                    <ModerateActions commentId={c.id} status={c.status as "flagged" | "hidden"} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
