import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireProfile } from '@/lib/queries';
import { getEditableIdentity } from '@/lib/public-identities/service';
import { IdentityForm } from '@/components/public-identities/identity-form';
import { IdentityShell } from '@/components/public-identities/shared';
export const dynamic = 'force-dynamic';
export default async function EditOwnedTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const identity = await getEditableIdentity((await params).id);
  if (!identity || identity.kind !== 'team' || (profile.role !== 'admin' && identity.ownerProfileId !== profile.id)) notFound();
  const isOwner = identity.ownerProfileId === profile.id;
  return <IdentityShell><h1 className="mb-6 text-2xl font-bold">إدارة ملف الفريق</h1>{profile.role === 'admin' && !isOwner ? <p className="mb-5 text-sm leading-7">أنت تعرض فريقًا تابعًا لحساب آخر. <Link href={`/admin/translators/${identity.id}`} className="inline-flex min-h-11 items-center text-primary hover:underline">تعديل الفريق من الإدارة</Link></p> : <IdentityForm key={`${identity.id}:${identity.version}`} initial={identity} ownerMode readOnly={identity.status !== 'active'} />}</IdentityShell>;
}
