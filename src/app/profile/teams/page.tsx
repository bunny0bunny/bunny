import type { Metadata } from 'next';
import Link from 'next/link';
import { requireProfile } from '@/lib/queries';
import { listOwnedIdentities } from '@/lib/public-identities/service';
import { IdentityShell, IdentityCard, EmptyIdentities } from '@/components/public-identities/shared';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'إدارة فريقي' };
export default async function OwnedTeamsPage() {
  await requireProfile();
  const teams = await listOwnedIdentities();
  return <IdentityShell><Link href="/profile" className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">حسابي</Link><header className="mb-6 mt-3"><h1 className="text-2xl font-bold">إدارة فريقي</h1><p className="mt-2 text-sm leading-7 text-muted-foreground">عدّل الاسم والنبذة والشعار للفرق التي عيّنتك الإدارة مسؤولًا عنها.</p></header>{teams.length ? <div className="grid gap-4 sm:grid-cols-2">{teams.map(team => <IdentityCard key={team.id} identity={team}><Link href={`/profile/teams/${team.id}`} className="mt-3 inline-flex min-h-11 items-center text-sm text-primary hover:underline">{team.status === 'suspended' ? 'عرض ملف الفريق' : 'تعديل ملف الفريق'}</Link></IdentityCard>)}</div> : <EmptyIdentities>لا يوجد فريق مرتبط بحسابك حاليًا. تواصل مع الإدارة لتعيين حسابك مسؤولًا عن فريقك.</EmptyIdentities>}</IdentityShell>;
}
