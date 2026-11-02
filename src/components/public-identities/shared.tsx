import Link from 'next/link';
import { IdentityAvatar } from './identity-avatar';
import { RatingSummary } from './rating-controls';
import { SiteHeader, SiteFooter, BottomNav } from '@/components/library/chrome';
import type { IdentityView } from '@/lib/public-identities/contracts';

export const creditLabels = { translation: 'ترجمة', editing: 'تحرير', preparation: 'إعداد' };
export function IdentityCard({ identity, children }: { identity: IdentityView; children?: React.ReactNode }) {
  const suspended = identity.status === 'suspended';
  return <article className="rounded-xl border border-border bg-card p-5">
    <div className="flex items-center gap-3"><IdentityAvatar avatarPath={identity.avatarPath} seed={identity.avatarSeed} name={identity.displayName} className="size-12 text-xl" /><div className="min-w-0"><h2 className="break-words font-bold">{suspended ? identity.displayName : <Link className="inline-flex min-h-11 items-center hover:text-primary focus-visible:outline-2 focus-visible:outline-primary" href={`/translators/${identity.slug}`}>{identity.displayName}</Link>}</h2><p className="text-xs text-muted-foreground">{identity.kind === 'team' ? 'فريق ترجمة' : 'مترجم مستقل'}{suspended && ' · غير متاح حاليًا'}</p></div></div>
    {identity.bio && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{identity.bio}</p>}
    <p className="mt-3 text-xs text-muted-foreground">{identity.workCount} عمل منشور · {identity.followerCount} متابع</p>{identity.kind === 'team' && <div className="mt-3"><RatingSummary average={identity.ratingAverage} count={identity.ratingCount} /></div>}{children}
  </article>;
}
export function IdentityShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-24 sm:px-6">{children}</main><SiteFooter /><BottomNav /></div>;
}
export function EmptyIdentities({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm leading-7 text-muted-foreground">{children}</p>;
}
