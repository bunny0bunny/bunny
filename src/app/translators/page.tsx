import type { Metadata } from 'next';
import { listPublicIdentities } from '@/lib/public-identities/service';
import { IdentityCard, IdentityShell, EmptyIdentities } from '@/components/public-identities/shared';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'المترجمون وفرق الترجمة' };
export default async function TranslatorsPage() {
  const identities = await listPublicIdentities();
  return <IdentityShell><header className="mb-7"><h1 className="text-2xl font-bold">المترجمون وفرق الترجمة</h1><p className="mt-2 text-sm leading-7 text-muted-foreground">تعرّف إلى أصحاب الترجمة والإعداد، وتابع إصداراتهم الجديدة.</p></header>{identities.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{identities.map(identity => <IdentityCard key={identity.id} identity={identity} />)}</div> : <EmptyIdentities>لا توجد ملفات عامة للمترجمين بعد. ستظهر هنا عند إتاحتها.</EmptyIdentities>}</IdentityShell>;
}
