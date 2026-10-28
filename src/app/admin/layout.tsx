import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, GalleryVerticalEnd, LayoutDashboard, LibraryBig, ListOrdered, LogOut, MessageSquareWarning, PenTool, ShieldAlert, UsersRound, MessageSquarePlus, Trash2 } from "lucide-react";
import { BrandMark } from "@/components/library/brand-mark";
import { currentProfileOrNull } from "@/lib/queries";
import { isStaffRole } from "@/lib/team-access";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminNewRequestCount } from "@/lib/content-requests/service";
import { withDatabaseScope } from "@/lib/db";
import { AdminLogoutButton } from "@/components/admin/admin-client";

/**
 * Admin layout — second guard layer (docs/DECISIONS.md D-12).
 * Fetches fresh profile from database so role changes apply immediately.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await currentProfileOrNull();
  if (!profile) redirect("/login?next=/admin");
  const role = profile.role as Role;

  if (!isStaffRole(role)) {
    return (
      <main className="bg-library-glow flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <span className="grid size-16 place-items-center rounded-2xl border border-danger/40 bg-danger/10 text-danger">
          <ShieldAlert className="size-7" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-foreground">لا تملك صلاحية الوصول</h1>
        <p className="mt-2 max-w-sm text-sm leading-7 text-muted-foreground">
          لوحة الإدارة متاحة لفريق العمل فقط. حسابك الحالي: <strong>{ROLE_LABELS[role] ?? role}</strong>.
        </p>
        <Button asChild className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href="/">العودة إلى المكتبة</Link>
        </Button>
      </main>
    );
  }

  const isAdmin = role === "admin";
  const isEditor = role === "editor";
  const newRequestCount = isAdmin ? await withDatabaseScope(() => getAdminNewRequestCount()) : 0;

  const nav = [
    { href: "/admin", label: isAdmin ? "اللوحة" : "أعمالي", icon: LayoutDashboard },
    { href: "/studio", label: "استوديو التحرير", icon: PenTool },
    { href: "/admin/series", label: isAdmin ? "الأعمال" : "أعمالي المسندة", icon: LibraryBig },
    { href: "/admin/chapters", label: "الفصول", icon: ListOrdered },
    ...(isAdmin || isEditor ? [{ href: "/admin/moderation", label: "الإشراف", icon: MessageSquareWarning }] : []),
    ...(isAdmin ? [{ href: "/admin/collections", label: "المجموعات", icon: GalleryVerticalEnd }] : []),
    ...(isAdmin ? [{ href: "/admin/requests", label: `طلبات القراء${newRequestCount ? ` (${newRequestCount})` : ""}`, icon: MessageSquarePlus }] : []),
    ...(isAdmin ? [{ href: "/admin/trash", label: "سلة المحتوى", icon: Trash2 }] : []),
    ...(isAdmin ? [{ href: "/admin/translators", label: "المترجمون والفرق", icon: UsersRound }] : []),
    ...(isAdmin ? [{ href: "/admin/users", label: "المستخدمون", icon: UsersRound }] : []),
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-e border-border/60 bg-sidebar p-4 md:flex">
        <Link href="/admin" className="mb-6 flex min-h-11 items-center gap-2.5">
          <BrandMark className="size-11" />
          <span>
            <span className="block text-sm font-bold text-foreground">مكتبة بانيورا</span>
            <span className="block text-[10px] text-gold">لوحة الإدارة</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1" aria-label="تنقل الإدارة">
          {nav.map((item) => (
            <Button
              key={item.href}
              asChild
              variant="ghost"
              className="min-h-11 w-full justify-start gap-2.5 text-muted-foreground hover:text-foreground"
            >
              <Link href={item.href}>
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>

        <div className="space-y-2 border-t border-border/60 pt-3">
          <Button asChild variant="ghost" className="w-full justify-start gap-2.5 text-muted-foreground">
            <Link href="/" target="_blank">
              <ExternalLink className="size-4" aria-hidden />
              عرض الموقع
            </Link>
          </Button>
          <div className="rounded-xl border border-border/60 bg-card p-3">
            <p className="truncate text-sm font-medium text-foreground">{profile.nickname}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground" dir="ltr">{profile.email}</p>
            <Badge variant="secondary" className="mt-2 bg-primary/15 text-primary border-primary/25">
              {ROLE_LABELS[role]}
            </Badge>
          </div>
          <AdminLogoutButton />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex min-h-14 items-center gap-2 border-b border-border/60 bg-background/90 px-4 backdrop-blur-md md:hidden">
        <Link href="/admin" className="flex min-h-11 items-center gap-2 text-sm font-bold text-foreground">
          <BrandMark className="size-8" />
          الإدارة
        </Link>
        <nav className="ms-auto flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="تنقل الإدارة">
          {nav.map((item) => (
            <Button key={item.href} asChild variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground" aria-label={item.label}>
              <Link href={item.href}>
                <item.icon className="size-4.5" />
              </Link>
            </Button>
          ))}
          <AdminLogoutButton compact />
        </nav>
      </div>

      <div className="min-w-0 flex-1">
        <div className="pt-16 md:pt-0">{children}</div>
      </div>
    </div>
  );
}
