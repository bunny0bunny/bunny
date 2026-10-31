import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { SiteHeader, SiteFooter, BottomNav } from "@/components/library/chrome";
import { NotificationsList } from "@/components/library/notifications-list";
import { requireProfile } from "@/lib/queries";
import { getNotifications, getUnreadCount, PAGE_ITEMS } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "الإشعارات",
};

export default async function NotificationsPage() {
  const profile = await requireProfile();
  const [items, unread] = await Promise.all([
    getNotifications(profile.id, PAGE_ITEMS),
    getUnreadCount(profile.id),
  ]);

  // Server-computed Arabic time labels (deterministic, hydration-safe).
  const fmtDate = new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long" });
  const fmtTime = new Intl.DateTimeFormat("ar-EG", { hour: "numeric", minute: "2-digit" });
  const now = Date.now();
  const withTime = items.map((n) => {
    const t = new Date(n.createdAt).getTime();
    const days = Math.floor((now - t) / 86400000);
    const when =
      days < 1
        ? `اليوم ${fmtTime.format(n.createdAt)}`
        : days === 1
          ? "أمس"
          : days < 30
            ? `قبل ${days} يوم`
            : fmtDate.format(n.createdAt);
    return { ...n, createdAt: undefined, readAt: undefined, read: n.readAt !== null, when };
  });

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 pb-20 md:pb-0">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <header className="pt-8">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground sm:text-3xl">
              <Bell className="size-6 text-primary" aria-hidden />
              الإشعارات
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              تحديثات الأعمال التي تتابعها وتفاعلات القرّاء مع تعليقاتك{profile.role !== 'reader' ? ' ومهام المراجعة المسندة إليك' : ''} — في مكان واحد.
            </p>
          </header>
          <NotificationsList items={withTime} unread={unread} />
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
