import Link from 'next/link';
import { requireRole } from '@/lib/queries';
import { listManagedIdentities } from '@/lib/public-identities/service';
import { IdentityCard, EmptyIdentities } from '@/components/public-identities/shared';
import { Button } from '@/components/ui/button';
export const dynamic = 'force-dynamic';
export default async function AdminTranslatorsPage() {
  await requireRole(['admin']);
  const identities = await listManagedIdentities();
  return <main className="mx-auto max-w-5xl p-4 py-8 sm:p-6"><header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">المترجمون والفرق</h1><p className="mt-2 text-sm text-muted-foreground">ملفات النسبة العامة مستقلة عن حسابات الفريق وصلاحياته.</p></div><Button asChild className="min-h-11"><Link href="/admin/translators/new">إنشاء ملف عام</Link></Button></header>
    <aside className="mb-6 rounded-xl border border-border bg-card p-4 text-sm leading-7">
      <p>لتمكين مترجم من الرفع: امنح حسابه المفعّل دور مساهم أو محرر من إدارة المستخدمين، ثم أسند إليه العمل من صفحة إدارة العمل. بعد ذلك يمكنه إضافة الفصول ورفعها وإرسالها للمراجعة؛ الاعتماد والنشر للإدارة.</p>
      <p className="mt-2 text-muted-foreground">إنشاء الملف العام أو ربطه بعمل يعرض النسبة والمتابعة فقط، ولا يمنح صلاحيات للحساب. إدارة هذه الملفات متاحة للإدارة حاليًا.</p>
      <Link href="/admin/users" className="mt-2 inline-flex min-h-11 items-center text-primary underline underline-offset-4">إدارة حسابات الفريق وأدوارها</Link>
    </aside>
    {identities.length ? <div className="grid gap-4 sm:grid-cols-2">{identities.map(identity => <IdentityCard key={identity.id} identity={identity}><Link href={`/admin/translators/${identity.id}`} className="mt-3 inline-flex min-h-11 items-center text-sm text-primary hover:underline">تعديل الملف{identity.status === 'suspended' ? ' · موقوف' : ''}</Link></IdentityCard>)}</div> : <EmptyIdentities>لا توجد ملفات بعد. أنشئ ملفًا للمترجم أو فريق الترجمة ثم اربطه بالأعمال.</EmptyIdentities>}</main>;
}
