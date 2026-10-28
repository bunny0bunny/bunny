'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AccountAvatar, VALID_AVATAR_SEEDS, AVATAR_SEED_LABELS } from '@/components/accounts/account-avatar';
import { savePublicIdentity } from '@/lib/public-identities/actions';
import type { IdentityView, SaveIdentityInput } from '@/lib/public-identities/contracts';
import { identityError } from './follow-controls';

const fieldClass = 'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60';
export function IdentityForm({ initial }: { initial?: IdentityView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [name, setName] = useState(initial?.displayName ?? '');
  const [seed, setSeed] = useState(initial?.avatarSeed ?? 'initials');
  return <form className="max-w-2xl space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6" aria-busy={pending} onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const input: SaveIdentityInput = { ...(initial ? { id: initial.id, expectedVersion: initial.version } : {}), slug: initial?.slug ?? String(data.get('slug')).trim(), displayName: name.trim(), bio: String(data.get('bio')).trim(), avatarSeed: seed, kind: data.get('kind') as SaveIdentityInput['kind'], status: data.get('status') as SaveIdentityInput['status'] };
    if (!/^[a-z0-9-]{2,80}$/.test(input.slug) || input.displayName.length < 2 || input.displayName.length > 80 || input.bio.length > 300) { setError('الاسم من حرفين إلى 80 حرفًا، والنبذة حتى 300 حرف. الرابط حرفان على الأقل من الحروف الإنجليزية الصغيرة والأرقام والشرطة.'); return; }
    setError(''); startTransition(async () => { try { const result = await savePublicIdentity(input); if (!result.ok) { setError(identityError(result.error)); if (result.error === 'conflict') { setBlocked(true); router.refresh(); } return; } router.replace(`/admin/translators/${result.id ?? initial?.id}`); router.refresh(); } catch { setError('تعذر تأكيد الحفظ. راجع قائمة الملفات قبل تكرار الإنشاء أو الحفظ.'); setBlocked(true); router.refresh(); } });
  }}>
    <fieldset disabled={pending || blocked} className="space-y-5 disabled:opacity-70">
      <div><label className="mb-2 block text-sm font-medium" htmlFor="identity-name">الاسم العام</label><input id="identity-name" name="displayName" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} className={fieldClass} /></div>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="identity-slug">الرابط الثابت</label><input id="identity-slug" name="slug" dir="ltr" required minLength={2} maxLength={80} pattern="[a-z0-9-]{2,80}" defaultValue={initial?.slug} readOnly={Boolean(initial)} aria-describedby="slug-help" className={fieldClass} /><p id="slug-help" className="mt-2 text-xs leading-6 text-muted-foreground">حروف إنجليزية صغيرة وأرقام وشرطة. لا يمكن تغيير الرابط بعد الإنشاء.</p></div>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="identity-bio">نبذة عامة</label><textarea id="identity-bio" name="bio" maxLength={300} rows={4} defaultValue={initial?.bio} className={fieldClass} /><p className="mt-1 text-xs text-muted-foreground">حتى 300 حرف. تظهر للزوار.</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-medium" htmlFor="identity-kind">نوع الملف</label><select id="identity-kind" name="kind" defaultValue={initial?.kind ?? 'individual'} className={fieldClass}><option value="individual">مترجم مستقل</option><option value="team">فريق ترجمة</option></select></div><div><label className="mb-2 block text-sm font-medium" htmlFor="identity-status">الإتاحة العامة</label><select id="identity-status" name="status" defaultValue={initial?.status ?? 'active'} className={fieldClass}><option value="active">نشط</option><option value="suspended">موقوف</option></select></div></div>
      <fieldset><legend className="mb-2 text-sm font-medium">الصورة الرمزية</legend><div className="flex flex-wrap gap-2">{VALID_AVATAR_SEEDS.map(value => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2"><input type="radio" name="avatarSeed" value={value} checked={seed === value} onChange={() => setSeed(value)} /><AccountAvatar seed={value} name={name} className="size-8" /><span className="text-xs">{AVATAR_SEED_LABELS[value]}</span></label>)}</div></fieldset>
      <p className="text-xs leading-6 text-muted-foreground">إيقاف الملف يخفي صفحته العامة ويوقف تنبيهات متابعيه. هذا الملف لا يمنح صلاحيات دخول أو تحرير.</p>
      <Button type="submit" className="min-h-11">{pending ? 'جارٍ الحفظ…' : initial ? 'حفظ التغييرات' : 'إنشاء الملف'}</Button>
    </fieldset>
    {error && <p role="alert" className="text-sm leading-7 text-destructive">{error}</p>}
    {blocked && <Button type="button" variant="outline" className="min-h-11" onClick={() => window.location.reload()}>تحميل النسخة الأخيرة</Button>}
    <div className="flex flex-wrap gap-4"><Link href="/admin/translators" className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">كل الملفات</Link>{initial?.status === 'active' && <Link href={`/translators/${initial.slug}`} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">معاينة الصفحة العامة</Link>}</div>
  </form>;
}
