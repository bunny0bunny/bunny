"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { BookOpenText, BookMarked, Compass, Library, Search, LogOut, ShieldCheck, UserRound, PenTool, MessageSquarePlus } from "lucide-react";
import { BrandMark } from "@/components/library/brand-mark";
import { NotificationBell } from "@/components/library/notification-bell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { getCurrentUserRole } from "@/lib/actions";
import type { Role } from "@/lib/constants";

function Logo() {
  return (
    <Link href="/" className="group flex min-h-11 shrink-0 items-center gap-2.5" aria-label="مكتبة باني — الرئيسية">
      <span className="transition group-hover:brightness-125">
        <BrandMark className="size-11" />
      </span>
      <span className="leading-tight">
        <span className="block font-bold text-[15px] text-foreground">مكتبة باني</span>
        <span className="block text-[10px] text-muted-foreground tracking-normal">Bunny Library</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const [roleSnapshot, setRoleSnapshot] = useState<{ userId: string; role: Role } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      return;
    }

    getCurrentUserRole()
      .then((role) => {
        if (!cancelled && role) {
          setRoleSnapshot({ userId, role });
        } else if (!cancelled) {
          setRoleSnapshot(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoleSnapshot(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, pathname]);

  const currentRole = roleSnapshot && roleSnapshot.userId === userId ? roleSnapshot.role : null;
  const isStaff = currentRole === "admin" || currentRole === "editor" || currentRole === "contributor";

  const loginNext = pathname && pathname !== "/login" && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  const loginHref = `/login${loginNext}`;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Logo />

        <nav className="mx-4 hidden items-center gap-1 md:flex" aria-label="التنقل الرئيسي">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={pathname === "/" ? "h-11 rounded-none border-b-2 border-primary text-primary" : "h-11 rounded-none border-b-2 border-transparent text-muted-foreground hover:text-foreground"}
          >
            <Link href="/" className="flex items-center gap-1.5">
              <BookOpenText className="size-4" aria-hidden />
              <span>الرئيسية</span>
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={pathname === "/explore" ? "h-11 rounded-none border-b-2 border-primary text-primary" : "h-11 rounded-none border-b-2 border-transparent text-muted-foreground hover:text-foreground"}
          >
            <Link href="/explore" className="flex items-center gap-1.5">
              <Compass className="size-4" aria-hidden />
              <span>استكشف</span>
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={pathname === "/library" ? "h-11 rounded-none border-b-2 border-primary text-primary" : "h-11 rounded-none border-b-2 border-transparent text-muted-foreground hover:text-foreground"}
          >
            <Link href="/library" className="flex items-center gap-1.5">
              <Library className="size-4" aria-hidden />
              <span>مكتبتي</span>
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={pathname === "/updates" ? "h-11 rounded-none border-b-2 border-primary text-primary" : "h-11 rounded-none border-b-2 border-transparent text-muted-foreground hover:text-foreground"}
          >
            <Link href="/updates" className="flex items-center gap-1.5">
              <BookMarked className="size-4" aria-hidden />
              <span>التحديثات</span>
            </Link>
          </Button>
        </nav>

        <div className="ms-auto flex items-center gap-2">
          {/* Desktop prominent search */}
          <form
            action="/explore"
            method="GET"
            className="relative hidden md:block w-52 lg:w-64"
            role="search"
          >
            <Search className="absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden />
            <input
              type="search"
              name="q"
              placeholder="ابحث عن أعمال أو مؤلفين…"
              className="h-11 w-full rounded-xl border border-border/70 bg-card/90 pe-3 ps-8 text-xs text-foreground placeholder:text-muted-foreground transition hover:border-border focus:border-primary/60 focus:bg-card focus:outline-none focus:ring-1 focus:ring-primary/60"
              aria-label="ابحث في المكتبة"
            />
          </form>

          {/* Mobile search icon */}
          <Button asChild variant="ghost" size="icon" className="size-11 text-muted-foreground hover:text-foreground md:hidden">
            <Link href="/explore" aria-label="ابحث في المكتبة">
              <Search className="size-4" aria-hidden />
            </Link>
          </Button>

          <Button asChild variant="ghost" size="sm" className="hidden min-h-11 text-muted-foreground xl:inline-flex">
            <Link href="/requests/new"><MessageSquarePlus className="me-1.5 size-4" aria-hidden />اطلب عملًا</Link>
          </Button>
          <NotificationBell />

          {status === "loading" ? (
            <div className="size-9 animate-pulse rounded-full bg-accent" aria-hidden />
          ) : session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="قائمة الحساب"
                >
                  <AccountAvatar
                    seed={(session.user as { avatarSeed?: string })?.avatarSeed}
                    name={session.user?.name}
                    className="size-9 border border-border"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-sm font-medium text-foreground">{session.user?.name}</span>
                  <span className="block text-xs text-muted-foreground" dir="ltr">{session.user?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="cursor-pointer">
                    <UserRound className="size-4 me-2" aria-hidden /> حسابي
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/requests" className="min-h-11 cursor-pointer">
                    <MessageSquarePlus className="size-4 me-2" aria-hidden /> طلباتي
                  </Link>
                </DropdownMenuItem>
                {isStaff && (
                  <DropdownMenuItem asChild>
                    <Link href="/studio" className="cursor-pointer">
                      <PenTool className="size-4 me-2" aria-hidden /> استوديو المبدعين
                    </Link>
                  </DropdownMenuItem>
                )}
                {isStaff && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin" className="cursor-pointer">
                      <ShieldCheck className="size-4 me-2" aria-hidden /> لوحة الإدارة
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-danger focus:text-danger"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  <LogOut className="size-4 me-2" aria-hidden /> تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href={loginHref}>تسجيل الدخول</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { status } = useSession();
  const loginNext = pathname && pathname !== "/login" && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  const loginHref = `/login${loginNext}`;

  const items = [
    { href: "/", label: "الرئيسية", icon: BookOpenText },
    { href: "/explore", label: "استكشف", icon: Compass },
    { href: "/library", label: "المكتبة", icon: Library },
    { href: "/updates", label: "التحديثات", icon: BookMarked },
    { href: status === "authenticated" ? "/profile" : loginHref, label: status === "authenticated" ? "حسابي" : "دخول", icon: UserRound },
  ];
  if (pathname.startsWith("/admin") || pathname.startsWith("/read/")) return null;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-md md:hidden pb-[env(safe-area-inset-bottom)]"
      aria-label="التنقل السفلي"
    >
      <div className="grid grid-cols-5">
        {items.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <Link
              key={it.label}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
                active ? "border-t-2 border-primary text-primary" : "border-t-2 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <it.icon className="size-5" aria-hidden />
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Link href="/" aria-label="مكتبة باني — الرئيسية" className="inline-flex min-h-11 items-center gap-2.5 text-foreground">
              <BrandMark className="size-12" />
              <span className="font-bold">مكتبة باني</span>
            </Link>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              مكتبتك الشخصية للقصص التي تستحق الضياع فيها. تجربة قراءة عربية هادئة وفاخرة، بلا إعلانات ولا ضجيج.
            </p>
          </div>
          <div className="flex gap-12 text-sm">
            <div>
              <p className="mb-2 font-medium text-foreground">تصفح</p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li><Link className="hover:text-foreground" href="/">الرئيسية</Link></li>
                <li><Link className="hover:text-foreground" href="/explore">استكشف</Link></li>
                <li><Link className="hover:text-foreground" href="/library">مكتبتي</Link></li>
                <li><Link className="hover:text-foreground" href="/updates">التحديثات</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-2 font-medium text-foreground">الحساب</p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li><Link className="hover:text-foreground" href="/login">تسجيل الدخول</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">© ٢٠٢٦ مكتبة باني</p>
      </div>
    </footer>
  );
}
