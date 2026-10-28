import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { getPublicIdentity, getViewerIdentityFollow } from '@/lib/public-identities/service';
import { currentProfileOrNull } from '@/lib/queries';
import { AccountAvatar } from '@/components/accounts/account-avatar';
import { IdentityShell, EmptyIdentities } from '@/components/public-identities/shared';
import { FollowControls } from '@/components/public-identities/follow-controls';
import { SeriesCardItem } from '@/components/library/series-card';
import { AdultBadge } from '@/components/library/adult-badge';
import { readerHref } from '@/lib/reader-route';
import type { Format } from '@/lib/constants';
export const dynamic = 'force-dynamic';
const getIdentity = cache(getPublicIdentity);
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const detail = await getIdentity((await params).slug);
  return { title: detail?.identity.displayName ?? 'ملف غير متاح', description: detail?.identity.bio };
}
export default async function TranslatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await getIdentity(slug);
  if (!detail || detail.identity.status !== 'active') notFound();
  const { identity, works, recentChapters } = detail;
  const profile = await currentProfileOrNull();
  const follow = profile ? await getViewerIdentityFollow(identity.id) : { following: false, alertsEnabled: false };
  return <IdentityShell><Link href="/translators" className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">كل المترجمين والفرق</Link><header className="mt-4 border-b border-border pb-7"><div className="flex items-center gap-4"><AccountAvatar seed={identity.avatarSeed} name={identity.displayName} className="size-16 text-2xl" /><div><h1 className="break-words text-2xl font-bold">{identity.displayName}</h1><p className="mt-1 text-sm text-muted-foreground">{identity.kind === 'team' ? 'فريق ترجمة' : 'مترجم مستقل'} · {identity.workCount} عمل منشور · {identity.followerCount} متابع</p></div></div>{identity.bio && <p className="mt-4 max-w-2xl whitespace-pre-wrap break-words text-sm leading-7">{identity.bio}</p>}<FollowControls key={`${identity.id}:${follow.following}:${follow.alertsEnabled}`} identityId={identity.id} initialFollow={follow} canFollow={Boolean(profile)} returnTo={`/translators/${identity.slug}`} /></header>
    <section className="mt-8" aria-labelledby="identity-works"><h2 id="identity-works" className="mb-4 text-xl font-bold">الأعمال المنشورة</h2>{works.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{works.map(work => <SeriesCardItem key={work.id} series={work} />)}</div> : <EmptyIdentities>لا توجد أعمال منشورة لهذا الملف حاليًا.</EmptyIdentities>}</section>
    <section className="mt-9" aria-labelledby="identity-releases"><h2 id="identity-releases" className="mb-4 text-xl font-bold">أحدث الفصول</h2>{recentChapters.length ? <ul className="divide-y divide-border rounded-xl border border-border">{recentChapters.map(chapter => <li key={chapter.id}><Link className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-primary" href={readerHref(chapter.format as Format, chapter.seriesSlug, chapter.number)}><span className="min-w-0"><bdi className="block break-words font-medium">{chapter.seriesTitle}</bdi><span className="text-sm text-muted-foreground">الفصل {chapter.number}{!chapter.isAdult && chapter.title ? ` · ${chapter.title}` : ''}</span></span><span className="flex items-center gap-2">{chapter.isAdult && <AdultBadge />}{chapter.isPremium && <span className="inline-flex items-center gap-1 text-xs text-gold"><LockKeyhole className="size-4" aria-hidden />مقفل</span>}<time className="text-xs text-muted-foreground" dateTime={chapter.publishedAt}>{new Date(chapter.publishedAt).toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' })}</time></span></Link></li>)}</ul> : <EmptyIdentities>لا توجد إصدارات حديثة حاليًا.</EmptyIdentities>}</section>
  </IdentityShell>;
}
