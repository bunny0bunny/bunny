'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { setIdentityFollow, setIdentityAlerts } from '@/lib/public-identities/actions';
import type { FollowView, IdentityResult } from '@/lib/public-identities/contracts';

export function identityError(error?: string) {
  return ({ forbidden: 'لا تملك صلاحية هذا الإجراء.', unauthenticated: 'سجّل الدخول بحساب مفعّل ثم حاول مجددًا.', conflict: 'تغيرت البيانات. تم تحديث الصفحة؛ راجع النسخة الأخيرة قبل الحفظ.', slug_taken: 'هذا الرابط مستخدم بالفعل. اختر رابطًا آخر.', invalid_input: 'راجع الحقول المدخلة وحاول مجددًا.', not_found: 'لم يعد هذا الملف متاحًا.' } as Record<string, string>)[error ?? ''] ?? 'تعذر إتمام العملية. حدّث الصفحة وراجع الحالة قبل المحاولة مجددًا.';
}
export function FollowControls({ identityId, initialFollow, canFollow, returnTo, suspended = false }: { identityId: string; initialFollow: FollowView; canFollow: boolean; returnTo: string; suspended?: boolean }) {
  const router = useRouter();
  const [follow, setFollow] = useState(initialFollow);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  function mutate(action: () => Promise<IdentityResult>) {
    setError('');
    startTransition(async () => {
      try { const result = await action(); if (!result.ok) setError(identityError(result.error)); else if (result.follow) setFollow(result.follow); router.refresh(); }
      catch { setError('تعذر تأكيد النتيجة. حدّث الصفحة وراجع حالة المتابعة قبل المحاولة مجددًا.'); router.refresh(); }
    });
  }
  if (!canFollow) return <Button asChild variant="outline" className="mt-4 min-h-11"><Link href={`/login?next=${encodeURIComponent(returnTo)}`}>سجّل الدخول للمتابعة</Link></Button>;
  return <div className="mt-4 space-y-2" aria-busy={pending}>
    <div className="flex flex-wrap gap-2"><Button disabled={pending || (suspended && !follow.following)} variant={follow.following ? 'outline' : 'default'} className="min-h-11" onClick={() => mutate(() => setIdentityFollow({ identityId, following: !follow.following }))}>{pending ? 'جارٍ التحديث…' : follow.following ? 'إلغاء المتابعة' : 'متابعة'}</Button>
    {follow.following && !suspended && <Button disabled={pending} className="min-h-11" variant="outline" onClick={() => mutate(() => setIdentityAlerts({ identityId, enabled: !follow.alertsEnabled }))}>{follow.alertsEnabled ? 'كتم تنبيهات النشر' : 'تفعيل تنبيهات النشر'}</Button>}</div>
    <p role="status" className="text-xs text-muted-foreground">{follow.following ? suspended ? 'الملف غير متاح؛ يمكنك إلغاء متابعته.' : follow.alertsEnabled ? 'تتابع هذا الملف وتنبيهات النشر مفعّلة.' : 'تتابع هذا الملف وتنبيهات النشر مكتومة.' : 'تابع المترجم لتصلك تنبيهات إصداراته الجديدة.'}</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
