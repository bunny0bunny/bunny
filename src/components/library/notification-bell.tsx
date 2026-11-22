"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bell, BellRing, BookOpenText, Heart, Sparkles, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions";
import type { NotificationView } from "@/lib/notifications";
import { timeAgoAr as sharedTimeAgo } from "@/lib/time-ago";

/**
 * Header notification bell (Release E). Polls the bell feed on mount, on a
 * 60 s interval, and whenever the dropdown opens. Mark-as-read is optimistic;
 * the dropdown content only mounts on open, so relative timestamps inside it
 * are client-only (no hydration risk, unlike the comments section pattern).
 */

type FeedItem = Omit<NotificationView, "createdAt" | "readAt"> & {
  createdAt: string;
  readAt: string | null;
};

const TYPE_META: Record<string, { icon: typeof Bell; classes: string }> = {
  new_chapter: { icon: BookOpenText, classes: "bg-primary/15 text-primary" },
  comment_like: { icon: Heart, classes: "bg-rose-500/15 text-rose-400" },
  system: { icon: Sparkles, classes: "bg-gold/15 text-gold" },
};

function timeAgoClient(iso: string): string {
  return sharedTimeAgo(iso);
}

export function NotificationBell() {
  const { status } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/notifications", { signal });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items: FeedItem[] };
      setUnread(data.unread);
      setItems(data.items);
    } catch {
      /* aborted or transient — keep the last feed */
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    // Deferred: keeps setState out of the synchronous effect body (react-hooks rule).
    const boot = setTimeout(() => load(controller.signal), 0);
    timer.current = setInterval(() => load(), 60_000);
    return () => {
      controller.abort();
      clearTimeout(boot);
      if (timer.current) clearInterval(timer.current);
    };
  }, [status, load]);

  if (status !== "authenticated") return null;

  const markAll = () => {
    setUnread(0);
    setItems((list) => list.map((it) => ({ ...it, readAt: it.readAt ?? new Date().toISOString() })));
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  };

  const openItem = (it: FeedItem) => {
    if (!it.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) => list.map((x) => (x.id === it.id ? { ...x, readAt: new Date().toISOString() } : x)));
      startTransition(async () => {
        await markNotificationRead({ id: it.id });
      });
    }
    setOpen(false);
    if (it.href) router.push(it.href);
  };

  return (
    <DropdownMenu open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); }}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={unread > 0 ? `الإشعارات — ${unread} غير مقروء` : "الإشعارات"}
        >
          {unread > 0 ? <BellRing className="size-[18px]" aria-hidden /> : <Bell className="size-[18px]" aria-hidden />}
          {unread > 0 && (
            <span className="absolute -top-0.5 -end-0.5 grid min-w-4 h-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm font-bold text-foreground">الإشعارات</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-primary hover:text-primary"
              onClick={markAll}
            >
              <CheckCheck className="size-3.5" aria-hidden />
              تعليم الكل كمقروء
            </Button>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="max-h-80 overflow-y-auto" role="menu" aria-label="قائمة الإشعارات">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              لا إشعارات بعد — تظهر هنا تحديثات أعمالك وتفاعلات تعليقاتك.
            </p>
          ) : (
            items.map((it) => {
              const meta = TYPE_META[it.type] ?? TYPE_META.system;
              const Icon = meta.icon;
              return (
                <DropdownMenuItem
                  key={it.id}
                  asChild
                  className="cursor-pointer rounded-none border-b border-border/40 last:border-0 px-3 py-2.5"
                >
                  <div
                    onClick={() => openItem(it)}
                    className={`flex items-start gap-2.5 ${it.readAt ? "" : "bg-primary/5"}`}
                    role="menuitem"
                  >
                    <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${meta.classes}`}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] ${it.readAt ? "text-foreground/80" : "font-semibold text-foreground"}`}>
                        {it.titleAr}
                      </span>
                      {it.bodyAr && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{it.bodyAr}</span>
                      )}
                      <span className="mt-1 block text-[10px] text-muted-foreground/80">
                        {timeAgoClient(it.createdAt)}
                      </span>
                    </span>
                    {!it.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="غير مقروء" />}
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
