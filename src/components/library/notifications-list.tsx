"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpenText, Heart, Sparkles, CheckCheck, BellOff, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllNotificationsRead, markNotificationRead, deleteNotification, clearReadNotifications } from "@/lib/actions";

/**
 * Full-page notifications list (Release E). Times are precomputed on the
 * server (hydration-safe); the client only handles mark-read + navigation.
 */

export type NotificationRow = {
  id: string;
  type: string;
  titleAr: string;
  bodyAr: string | null;
  href: string | null;
  when: string;
  read: boolean;
};

const TYPE_META: Record<string, { icon: typeof BellOff; classes: string }> = {
  new_chapter: { icon: BookOpenText, classes: "bg-primary/15 text-primary" },
  comment_like: { icon: Heart, classes: "bg-rose-500/15 text-rose-400" },
  system: { icon: Sparkles, classes: "bg-gold/15 text-gold" },
};

export function NotificationsList({ items, unread }: { items: NotificationRow[]; unread: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rows = items;
  const remaining = unread;

  const markAll = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await markAllNotificationsRead();
        if (!result.ok) throw new Error("save failed");
        router.refresh();
      } catch {
        setError("تعذّر تحديث الإشعارات. حاول مرة أخرى.");
      }
    });
  };

  const run = (work: () => Promise<{ ok: boolean }>, failure: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) throw new Error("save failed");
        router.refresh();
      } catch {
        setError(failure);
      }
    });
  };
  const hasRead = rows.some((it) => it.read);

  const open = (it: NotificationRow) => {
    setError(null);
    startTransition(async () => {
      try {
        if (!it.read) {
          const result = await markNotificationRead({ id: it.id });
          if (!result.ok) throw new Error("save failed");
        }
        if (it.href) router.push(it.href);
        else router.refresh();
      } catch {
        setError("تعذّر تحديث الإشعار. حاول مرة أخرى.");
      }
    });
  };

  return (
    <div className="mt-6 pb-10">
      {error && <p role="alert" className="mb-3 text-sm leading-7 text-danger">{error}</p>}
      {(remaining > 0 || hasRead) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{remaining > 0 ? `${remaining} إشعارًا غير مقروء` : "لا جديد"}</span>
          <div className="flex flex-wrap gap-1">
            {remaining > 0 && (
              <Button variant="ghost" size="sm" disabled={pending} className="min-h-11 gap-1.5 px-2 text-sm text-primary hover:text-primary" onClick={markAll}>
                <CheckCheck className="size-3.5" aria-hidden />
                تعليم الكل كمقروء
              </Button>
            )}
            {hasRead && (
              <Button variant="ghost" size="sm" disabled={pending} className="min-h-11 gap-1.5 px-2 text-sm text-muted-foreground" onClick={() => run(clearReadNotifications, "تعذّر حذف الإشعارات المقروءة.")}>
                <Trash2 className="size-3.5" aria-hidden />
                حذف المقروء
              </Button>
            )}
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-20 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent text-muted-foreground">
            <BellOff className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-bold text-foreground">لا إشعارات بعد</h2>
          <p className="mt-2 max-w-sm text-sm leading-7 text-muted-foreground">
            أضِف الأعمال التي تحبها إلى مكتبتك — نُعلمك هنا عند صدور فصل جديد، وعند تفاعل القرّاء مع تعليقاتك.
          </p>
          <Button asChild className="mt-5 bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/explore">تصفّح الأعمال</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((it) => {
            const meta = TYPE_META[it.type] ?? TYPE_META.system;
            const Icon = meta.icon;
            const body = (
              <>
                <span className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl ${meta.classes}`}>
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${it.read ? "text-foreground/80" : "font-semibold text-foreground"}`}>
                    {it.titleAr}
                  </span>
                  {it.bodyAr && <span className="mt-0.5 block text-xs leading-6 text-muted-foreground">{it.bodyAr}</span>}
                  <span className="mt-1 block text-[11px] text-muted-foreground/80">{it.when}</span>
                </span>
                {!it.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="غير مقروء" />}
              </>
            );
            return (
              <li key={it.id} className="group relative">
                <div className="absolute end-2 top-2 z-10 flex gap-1">
                  {!it.href && !it.read && (
                    <button type="button" disabled={pending} onClick={() => run(() => markNotificationRead({ id: it.id }), "تعذّر تحديث الإشعار.")} aria-label="تعليم كمقروء" title="تعليم كمقروء" className="grid size-11 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground">
                      <Check className="size-4" aria-hidden />
                    </button>
                  )}
                  <button type="button" disabled={pending} onClick={() => run(() => deleteNotification({ id: it.id }), "تعذّر حذف الإشعار.")} aria-label="حذف الإشعار" title="حذف الإشعار" className="grid size-11 place-items-center rounded-xl text-muted-foreground transition hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                {it.href ? (
                  <button
                    onClick={() => open(it)}
                    disabled={pending}
                    className={`flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 pe-24 text-start transition hover:border-primary/30 hover:bg-accent/30 ${it.read ? "" : "border-primary/25 bg-primary/5"}`}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={`flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 pe-24 ${it.read ? "" : "border-primary/25 bg-primary/5"}`}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
