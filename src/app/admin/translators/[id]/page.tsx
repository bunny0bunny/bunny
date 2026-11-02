import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/queries';
import { getManagedIdentity, listIdentityOwnerCandidates } from '@/lib/public-identities/service';
import { IdentityForm } from '@/components/public-identities/identity-form';
export const dynamic = 'force-dynamic';
export default async function EditTranslatorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(['admin']);
  const { id } = await params;
  const [identity, ownerCandidates] = await Promise.all([getManagedIdentity(id), listIdentityOwnerCandidates()]);
  if (!identity) notFound();
  return <main className="mx-auto max-w-4xl p-4 py-8 sm:p-6"><h1 className="mb-6 text-2xl font-bold">تعديل الملف العام</h1><IdentityForm key={`${identity.id}:${identity.version}`} initial={identity} ownerCandidates={ownerCandidates} /></main>;
}
