import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookMarked, BookOpenCheck, CalendarDays, Flame, MessageSquare, Star, Trophy } from "lucide-react";
import { SiteHeader, SiteFooter, BottomNav } from "@/components/library/chrome";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { BadgeCard } from "@/components/library/badge-card";
import { SeriesCardItem } from "@/components/library/series-card";
import { getPublicProfile } from "@/lib/public-profile";
import { coverClass } from "@/lib/public-profile-policy";
import { currentProfileOrNull } from "@/lib/queries";
import { ROLE_LABELS } from "@/lib/constants";
import { getWorkTitle } from "@/lib/work-title";
import { timeAgoAr } from "@/lib/time-ago";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const profile = await getPublicProfile((await params).key);
  // Reader pages are shareable by link but kept out of search engines.
  return profile ? { title: profile.nickname, robots: { index: false, follow: false } } : { title: "القارئ غير موجود" };
}

const joinedAr = (date: Date) => new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(date);

export default async function PublicProfilePage({ params }: { params: Promise<{ key: string }> }) {
  const [profile, viewer] = await Promise.all([getPublicProfile((await params).key), currentProfileOrNull()]);
  if (!profile) notFound();
  const isMe = viewer?.id === profile.id;
  const earned = profile.badges.filter(b => b.earned);
  const stats = [
    { label: "فصل أتمّه", value: profile.stats.chapters, icon: BookOpenCheck },
    { label: "في مكتبته", value: profile.stats.library, icon: BookMarked },
    { label: "تقييم", value: profile.stats.ratings, icon: Star },
    { label: "تعليق", value: profile.stats.comments, icon: MessageSquare },
    { label: "أطول سلسلة", value: profile.stats.longestStreak, icon: Flame },
  ];
  const staff = profile.role !== "reader" ? ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS] : null;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 pb-20 md:pb-0">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <section aria-label="بطاقة القارئ" className="overflow-hidden rounded-3xl border border-border/60 bg-card">
            <div className={`relative h-32 sm:h-44 ${coverClass(profile.coverTheme)}`} aria-hidden>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_45%),radial-gradient(circle_at_85%_70%,rgba(255,255,255,0.10),transparent_40%)]" />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
            </div>
            <div className="relative px-4 pb-5 sm:px-6">
              <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-end gap-4">
                  <AccountAvatar seed={profile.avatarSeed} src={profile.avatarPath} name={profile.nickname}
                    className="size-24 border-4 border-card text-3xl font-bold shadow-xl sm:size-28" brandMarkSize="size-14" />
                  <div className="min-w-0 pb-1">
                    <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold"><bdi>{profile.nickname}</bdi>
                      {staff && <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{staff}</span>}
                    </h1>
                    {profile.handle && <p className="text-sm text-muted-foreground" dir="ltr">@{profile.handle}</p>}
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" aria-hidden />انضم في {joinedAr(profile.joinedAt)}</p>
                  </div>
                </div>
                {isMe && <Link href="/profile#public-profile" className="inline-flex min-h-11 items-center self-start rounded-xl border border-border px-4 text-sm hover:border-primary/50 hover:text-primary sm:self-auto">تعديل بروفايلي</Link>}
              </div>
              {profile.bio && <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-7 text-foreground/90">{profile.bio}</p>}
              {profile.genres.length > 0 && <ul aria-label="الأنواع المفضلة" className="mt-4 flex flex-wrap gap-2">
                {profile.genres.map(g => <li key={g}><Link href={`/explore?genre=${encodeURIComponent(g)}`} className="inline-flex min-h-9 items-center rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/20">#{g}</Link></li>)}
              </ul>}
              {profile.showcase.length > 0 && <div className="mt-4 flex flex-wrap gap-2" aria-label="شارات مميزة">
                {profile.showcase.map(b => <span key={b.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-xs"><Trophy className="size-3.5 text-gold" aria-hidden />{b.labelAr}</span>)}
              </div>}
            </div>
          </section>

          <section aria-label="إحصاءات" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map(s => <div key={s.label} className="rounded-2xl border border-border/60 bg-card p-4">
              <s.icon className="size-4 text-primary" aria-hidden />
              <p className="mt-2 text-2xl font-bold tabular-nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>)}
          </section>

          {profile.featured.length > 0 && <section aria-label="أعمال مفضلة" className="mt-8">
            <h2 className="mb-3 text-lg font-bold">المفضلة عنده</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {profile.featured.map(work => <SeriesCardItem key={work.id} series={work} className="w-full" />)}
            </div>
          </section>}

          <section aria-label="الشارات" className="mt-8">
            <h2 className="mb-3 flex items-center gap-1.5 text-lg font-bold"><Trophy className="size-4 text-gold" aria-hidden />الشارات
              <span className="text-sm font-normal text-muted-foreground">{earned.length} من {profile.badges.length}</span></h2>
            {earned.length === 0 ? <p className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">لم يكتسب شارات بعد.</p>
              : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{earned.map(b => <BadgeCard key={b.id} badge={b} />)}</div>}
          </section>

          {profile.recentComments.length > 0 && <section aria-label="آخر التعليقات" className="mt-8">
            <h2 className="mb-3 flex items-center gap-1.5 text-lg font-bold"><MessageSquare className="size-4 text-muted-foreground" aria-hidden />آخر تعليقاته</h2>
            <ul className="space-y-3">
              {profile.recentComments.map(c => <li key={c.id} className="rounded-2xl border border-border/60 bg-card p-4">
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <Link href={`/series/${c.series.slug}`} className="truncate font-semibold text-foreground/90 hover:text-primary"><bdi>{getWorkTitle(c.series)}</bdi></Link>
                  <span className="shrink-0">{timeAgoAr(c.createdAt, { precision: "day" })}</span>
                </div>
                <p className="line-clamp-4 whitespace-pre-line text-sm leading-7">{c.body}</p>
              </li>)}
            </ul>
          </section>}
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
