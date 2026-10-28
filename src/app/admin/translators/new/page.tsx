import { requireRole } from '@/lib/queries';
import { IdentityForm } from '@/components/public-identities/identity-form';
export const dynamic = 'force-dynamic';
export default async function NewTranslatorPage() {
  await requireRole(['admin']);
  return <main className="mx-auto max-w-4xl p-4 py-8 sm:p-6"><h1 className="mb-6 text-2xl font-bold">إنشاء ملف مترجم أو فريق</h1><IdentityForm /></main>;
}
