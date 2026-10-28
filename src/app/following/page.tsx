import type { Metadata } from 'next';
import Link from 'next/link';
import { requireProfile } from '@/lib/queries';
import { getFollowingIdentities } from '@/lib/public-identities/service';
import { IdentityCard, IdentityShell, EmptyIdentities } from '@/components/public-identities/shared';
import { FollowControls } from '@/components/public-identities/follow-controls';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'أتابعهم' };
export default async function FollowingPage() {
  await requireProfile();
  const identities = await getFollowingIdentities();
  return <IdentityShell><header className="mb-7"><Link href="/profile" className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">حسابي</Link><h1 className="mt-3 text-2xl font-bold">أتابعهم</h1><p className="mt-2 text-sm text-muted-foreground">إدارة متابعاتك وتنبيهات النشر الخاصة بك.</p></header>{identities.length ? <div className="grid gap-4 sm:grid-cols-2">{identities.map(identity => <IdentityCard key={identity.id} identity={identity}><FollowControls key={`${identity.id}:${identity.following}:${identity.alertsEnabled}`} identityId={identity.id} initialFollow={{ following: identity.following, alertsEnabled: identity.alertsEnabled }} canFollow returnTo="/following" suspended={identity.status === 'suspended'} /></IdentityCard>)}</div> : <EmptyIdentities>لم تتابع مترجمًا أو فريقًا بعد. <Link className="text-primary hover:underline" href="/translators">اكتشف فرق الترجمة</Link></EmptyIdentities>}</IdentityShell>;
}
