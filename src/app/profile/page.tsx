import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BookMarked, BookOpenCheck, Check, Flame, MessageSquare, Star, History, Trophy } from "lucide-react";
import { SiteHeader, SiteFooter, BottomNav } from "@/components/library/chrome";
import { ProfileSettings } from "@/components/library/profile-settings";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { ReadingActivityChart } from "@/components/library/reading-activity-chart";
import {
  requireProfile,
  getProfileStats,
  getProfileActivity,
  getFavoriteGenres,
} from "@/lib/queries";
import { getReadingStats } from "@/lib/reading-stats";
import { EVENT_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "حسابي — مكتبة باني" };

function timeAgoAr(date: Date) {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "اليوم";
  if (days < 30) return `قبل ${days} يوم`;
  return `قبل ${Math.floor(days / 30)} شهر`;
}

/** Arabic number agreement for أيام: 1 يوم · 2 يومان · 3–10 أيام · 11+ يومًا */
function daysUnitAr(n: number): string {
  if (n === 1) return "يوم";
  if (n === 2) return "يومان";
  if (n >= 3 && n <= 10) return "أيام";
  return "يومًا";
}

export default async function ProfilePage() {
  const profile = await requireProfile();
  // Retire the old seeded placeholder without hiding user-written biographies.
  const bio = profile.bio === "حساب تجريبي ضمن النسخة التجريبية من مكتبة باني." ? "" : (profile.bio ?? "");
  const [stats, activity, genres, readingStats] = await Promise.all([
    getProfileStats(profile.id),
    getProfileActivity(profile.id),
    getFavoriteGenres(profile.id),
    getReadingStats(profile.id),
  ]);

  const statCards = [
    { label: "في مكتبتي", value: stats.libraryCount, icon: BookMarked, href: "/library" },
    { label: "فصل أتممته", value: stats.chaptersRead, icon: BookOpenCheck, href: "/updates" },
    { label: "تعليق", value: stats.commentCount, icon: MessageSquare, href: "/library" },
    { label: "تقييم", value: stats.ratingCount, icon: Star, href: "/library" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 pb-20 md:pb-0">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          {/* identity */}
          <header className="flex items-center gap-4">
            <AccountAvatar
              seed={profile.avatarSeed}
              name={profile.nickname}
              className="size-16 text-2xl font-bold border border-border"
              brandMarkSize="size-10"
            />
            <div>
              <h1 className="text-2xl font-bold">{profile.nickname}</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground font-mono" dir="ltr">{profile.email}</p>
                {profile.emailVerifiedAt ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    <Check className="size-3" aria-hidden /> مفعّل
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                    بانتظار التأكيد
                  </span>
                )}
              </div>
              {bio && <p className="mt-1.5 max-w-md text-sm leading-7 text-foreground/85">{bio}</p>}
            </div>
          </header>

          {/* stats */}
          <section aria-label="إحصاءات القراءة" className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statCards.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="rounded-2xl border border-border/60 bg-card p-4 transition hover:border-primary/40"
              >
                <s.icon className="size-4 text-primary" aria-hidden />
                <p className="mt-2 text-2xl font-bold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </Link>
            ))}
          </section>

          {/* reading streak (Release D, FD-12) */}
          <section aria-label="سلسلة القراءة" className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-center gap-4">
                <span
                  className={`flex size-16 shrink-0 items-center justify-center rounded-2xl border ${
                    readingStats.currentStreak > 0
                      ? "border-primary/40 bg-primary/15"
                      : "border-border bg-secondary/60"
                  }`}
                  aria-hidden
                >
                  <Flame
                    className={`size-8 ${
                      readingStats.currentStreak > 0 ? "text-primary" : "text-muted-foreground/50"
                    }`}
                  />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">سلسلة قراءتك الحالية</p>
                  <p className="text-3xl font-bold tabular-nums leading-tight">
                    {readingStats.currentStreak}
                    <span className="ms-1.5 text-sm font-medium text-muted-foreground">
                      {daysUnitAr(readingStats.currentStreak)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {readingStats.currentStreak > 0
                      ? "واصل القراءة اليوم لتمتد السلسلة"
                      : "اقرأ اليوم لتشتعل السلسلة من جديد"}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-border/50 bg-secondary/40 px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">أطول سلسلة</dt>
                  <dd className="text-lg font-bold tabular-nums">{readingStats.longestStreak}</dd>
                </div>
                <div className="rounded-xl border border-border/50 bg-secondary/40 px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">أيام نشطة (30 يومًا)</dt>
                  <dd className="text-lg font-bold tabular-nums">{readingStats.daysActive30}</dd>
                </div>
                <div className="rounded-xl border border-border/50 bg-secondary/40 px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">فصل أتممته</dt>
                  <dd className="text-lg font-bold tabular-nums">{readingStats.completedChapters}</dd>
                </div>
              </dl>
            </div>
            <div className="border-t border-border/50 px-4 pb-3 pt-4 sm:px-5">
              <ReadingActivityChart data={readingStats.weekly} />
            </div>
          </section>

          {/* badges (Release D, FD-12) */}
          <section aria-label="شارات القراءة" className="mt-6">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold">
              <Trophy className="size-4 text-gold" aria-hidden />
              شاراتك
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {readingStats.badges.map((b) => (
                <div
                  key={b.id}
                  className={`rounded-2xl border p-3.5 transition ${
                    b.earned
                      ? "border-gold/35 bg-gradient-to-b from-gold/10 to-transparent"
                      : "border-dashed border-border/60 bg-card opacity-70"
                  }`}
                >
                  <p className={`text-sm font-bold ${b.earned ? "text-gold" : "text-muted-foreground"}`}>
                    {b.labelAr}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{b.descriptionAr}</p>
                  {!b.earned && b.hintAr && (
                    <p className="mt-1.5 inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                      {b.hintAr}
                    </p>
                  )}
                  {b.earned && (
                    <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-gold/90">
                      <Check className="size-3" aria-hidden />
                      مُكتسبة
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="mt-7 grid gap-6 lg:grid-cols-2">
            {/* settings */}
            <section aria-label="إعدادات الحساب" className="rounded-2xl border border-border/60 bg-card p-4">
              <h2 className="mb-3 text-sm font-bold">إعدادات الحساب</h2>
              <ProfileSettings nickname={profile.nickname} bio={bio} avatarSeed={profile.avatarSeed} />
            </section>

            {/* favorite genres */}
            <section aria-label="الأنواع المفضلة" className="rounded-2xl border border-border/60 bg-card p-4">
              <h2 className="mb-3 text-sm font-bold">أنواعك المفضلة</h2>
              {genres.length === 0 ? (
                <p className="text-sm text-muted-foreground">أضف أعمالًا إلى مكتبتك لتكتشف ذوقك.</p>
              ) : (
                <ul className="space-y-2.5">
                  {genres.map((g) => {
                    const max = genres[0].count || 1;
                    return (
                      <li key={g.genre}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-foreground/90">{g.genre}</span>
                          <span className="text-muted-foreground">{g.count}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-primary/70" style={{ width: `${(g.count / max) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* recent reading */}
          <section aria-label="آخر قراءاتك" className="mt-6">
            <h2 className="mb-3 text-sm font-bold">آخر قراءاتك</h2>
            {stats.recentProgress.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                لم تبدأ أي عمل بعد — <Link href="/explore" className="text-primary hover:underline">استكشف الآن</Link>.
              </p>
            ) : (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">
                {stats.recentProgress.map((p) => (
                  <li key={p.id}>
                    <Link href={`/read/${p.series.format}/${p.series.slug}/${p.chapter.number}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-accent/40">
                      <span className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-border/60">
                        <Image src={p.series.coverPath || "/art/covers/no-cover.svg"} alt="" fill sizes="44px" className="object-cover" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.series.titleAr}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          الفصل {p.chapter.number} · قارأتم {Math.round(p.percent)}٪
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgoAr(p.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* activity */}
          <section aria-label="سجل النشاط" className="mt-6">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold">
              <History className="size-4 text-muted-foreground" aria-hidden />
              سجل النشاط
            </h2>
            <ul className="space-y-1.5 rounded-2xl border border-border/60 bg-card p-4 text-xs text-muted-foreground">
              {activity.length === 0 && <li>لا نشاط بعد.</li>}
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3">
                  <span>
                    {EVENT_LABELS[a.type] ?? a.type}
                    {a.series && <> — <Link href={`/series/${a.series.slug}`} className="text-foreground/80 hover:text-primary">{a.series.titleAr}</Link></>}
                  </span>
                  <span className="shrink-0">{timeAgoAr(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
