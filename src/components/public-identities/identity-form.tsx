"use client";
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AccountAvatar, VALID_AVATAR_SEEDS, AVATAR_SEED_LABELS } from '@/components/accounts/account-avatar';
import { savePublicIdentity, updateOwnedIdentity } from '@/lib/public-identities/actions';
import type { ManagedIdentityView, SaveIdentityInput } from '@/lib/public-identities/contracts';
import { identityError } from './follow-controls';
import { IdentityAvatarEditor } from './avatar-editor';

const fieldClass = 'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60';
type OwnerCandidate = { id: string; nickname: string; email: string };
export function IdentityForm({ initial, ownerCandidates = [], ownerMode = false, readOnly = false }: { initial?: ManagedIdentityView; ownerCandidates?: OwnerCandidate[]; ownerMode?: boolean; readOnly?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [name, setName] = useState(initial?.displayName ?? '');
  const [seed, setSeed] = useState(initial?.avatarSeed ?? 'initials');
  const [kind, setKind] = useState(initial?.kind ?? 'individual');
  const [ownerId, setOwnerId] = useState(initial?.ownerProfileId ?? '');
  const [version, setVersion] = useState(initial?.version ?? 0);
  const [avatarPath, setAvatarPath] = useState(initial?.avatarPath ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  return <form className="max-w-2xl space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6" aria-busy={pending || photoBusy} onSubmit={event => {
    event.preventDefault(); if (readOnly || photoBusy || blocked || pending) return;
    const data = new FormData(event.currentTarget);
    const fields = { displayName: name.trim(), bio: String(data.get('bio')).trim(), avatarSeed: seed };
    if (fields.displayName.length < 2 || fields.displayName.length > 80 || fields.bio.length > 300) { setError('الاسم من حرفين إلى 80 حرفًا، والنبذة حتى 300 حرف.'); return; }
    const input: SaveIdentityInput = { ...(initial ? { id: initial.id, expectedVersion: version } : {}), ...fields, slug: initial?.slug ?? String(data.get('slug')).trim(), kind, status: data.get('status') as SaveIdentityInput['status'], ownerProfileId: kind === 'team' ? ownerId || null : null };
    if (!ownerMode && !/^[a-z0-9-]{2,80}$/.test(input.slug)) { setError('الرابط حرفان على الأقل من الحروف الإنجليزية الصغيرة والأرقام والشرطة.'); return; }
    setError(''); startTransition(async () => {
      try {
        const result = ownerMode && initial ? await updateOwnedIdentity({ id: initial.id, expectedVersion: version, ...fields }) : await savePublicIdentity(input);
        if (!result.ok) { setError(identityError(result.error)); if (result.error === 'conflict' || result.error === 'forbidden' || result.error === 'identity_suspended') setBlocked(true); return; }
        router.replace(ownerMode ? `/profile/teams/${initial?.id}` : `/admin/translators/${result.id ?? initial?.id}`); router.refresh();
      } catch { setError('تعذر تأكيد الحفظ. حمّل النسخة الأخيرة وراجع بياناتك قبل المحاولة مجددًا.'); setBlocked(true); }
    });
  }}>
    {readOnly && <p role="status" className="rounded-lg border border-border bg-secondary p-3 text-sm leading-7">الفريق موقوف حاليًا. يمكنك مراجعة ملفه هنا، ويُستأنف التعديل بعد إعادة تفعيله بواسطة الإدارة.</p>}
    <fieldset disabled={pending || blocked || readOnly || photoBusy} className="space-y-5 disabled:opacity-70">
      <div><label className="mb-2 block text-sm font-medium" htmlFor="identity-name">الاسم العام</label><input id="identity-name" name="displayName" required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} className={fieldClass} /></div>
      {!ownerMode && <div><label className="mb-2 block text-sm font-medium" htmlFor="identity-slug">الرابط الثابت</label><input id="identity-slug" name="slug" dir="ltr" required minLength={2} maxLength={80} pattern="[a-z0-9-]{2,80}" defaultValue={initial?.slug} readOnly={Boolean(initial)} aria-describedby="slug-help" className={fieldClass} /><p id="slug-help" className="mt-2 text-xs leading-6 text-muted-foreground">حروف إنجليزية صغيرة وأرقام وشرطة. لا يمكن تغيير الرابط بعد الإنشاء.</p></div>}
      <div><label className="mb-2 block text-sm font-medium" htmlFor="identity-bio">نبذة عامة</label><textarea id="identity-bio" name="bio" maxLength={300} rows={4} defaultValue={initial?.bio} className={fieldClass} /><p className="mt-1 text-xs text-muted-foreground">حتى 300 حرف. تظهر للزوار.</p></div>
      {!ownerMode && <><div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-medium" htmlFor="identity-kind">نوع الملف</label><select id="identity-kind" name="kind" value={kind} onChange={event => setKind(event.target.value as SaveIdentityInput['kind'])} className={fieldClass}><option value="individual">مترجم مستقل</option><option value="team">فريق ترجمة</option></select></div><div><label className="mb-2 block text-sm font-medium" htmlFor="identity-status">الإتاحة العامة</label><select id="identity-status" name="status" defaultValue={initial?.status ?? 'active'} className={fieldClass}><option value="active">نشط</option><option value="suspended">موقوف</option></select></div></div>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="identity-owner">الحساب المسؤول عن الفريق (اختياري)</label><select id="identity-owner" value={ownerId} onChange={event => setOwnerId(event.target.value)} disabled={kind !== 'team'} className={fieldClass}><option value="">بدون حساب مسؤول</option>{ownerId && !ownerCandidates.some(candidate => candidate.id === ownerId) && <option value={ownerId}>الحساب المسؤول الحالي (غير متاح للتعيين الجديد)</option>}{ownerCandidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.nickname} — {candidate.email}</option>)}</select><p className="mt-2 text-xs leading-6 text-muted-foreground">متاح لفرق الترجمة فقط. يمنح الحساب تعديل اسم الفريق ونبذته وشعاره من حسابه، دون صلاحيات إدارة أو تحرير أعمال. تعيين المسؤول يزيل تقييمه السابق للفريق.</p></div></>}
      <fieldset><legend className="mb-2 text-sm font-medium">الصورة الرمزية البديلة</legend><div className="flex flex-wrap gap-2">{VALID_AVATAR_SEEDS.map(value => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2"><input type="radio" name="avatarSeed" value={value} checked={seed === value} onChange={() => setSeed(value)} /><AccountAvatar seed={value} name={name} className="size-8" /><span className="text-xs">{AVATAR_SEED_LABELS[value]}</span></label>)}</div></fieldset>
      {!ownerMode && <p className="text-xs leading-6 text-muted-foreground">إيقاف الملف يخفي صفحته العامة ويوقف تنبيهات متابعيه.</p>}
      <Button type="submit" className="min-h-11">{pending ? 'جارٍ الحفظ…' : initial ? 'حفظ التغييرات' : 'إنشاء الملف'}</Button>
    </fieldset>
    {initial ? <IdentityAvatarEditor identityId={initial.id} version={version} avatarPath={avatarPath} seed={seed} name={name} disabled={pending || blocked || readOnly} onBusyChange={setPhotoBusy} onBlocked={() => setBlocked(true)} onSaved={(path, nextVersion) => { setAvatarPath(path); setVersion(nextVersion); }} /> : <p className="text-sm leading-7 text-muted-foreground">احفظ الملف أولًا، ثم يمكنك رفع الصورة وقصها من صفحة التعديل.</p>}
    {photoBusy && <p className="text-xs leading-6 text-muted-foreground">احفظ الصورة أو ألغِ اختيارها للمتابعة في تعديل بيانات الملف. تُحفظ تغييرات النص عند الضغط على حفظ التغييرات.</p>}
    {error && <p role="alert" className="text-sm leading-7 text-destructive">{error}</p>}
    {blocked && <div className="space-y-2"><p className="text-sm leading-7 text-muted-foreground">احتفظ بنسخة من أي نص لم تحفظه قبل تحميل البيانات الأخيرة.</p><Button type="button" variant="outline" className="min-h-11" onClick={() => window.location.reload()}>تحميل النسخة الأخيرة</Button></div>}
    <div className="flex flex-wrap gap-4"><Link href={ownerMode ? '/profile/teams' : '/admin/translators'} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">{ownerMode ? 'فرقي' : 'كل الملفات'}</Link>{initial?.status === 'active' && <Link href={`/translators/${initial.slug}`} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">معاينة الصفحة العامة</Link>}</div>
  </form>;
}
