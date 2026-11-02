"use client";
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setIdentityRating } from '@/lib/public-identities/actions';
import { identityError } from './follow-controls';

export function RatingSummary({ average, count }: { average: number | null; count: number }) {
  return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Star className="size-4 text-gold" aria-hidden />{count && average !== null ? <><span className="font-semibold text-foreground">{average.toLocaleString('ar-EG', { maximumFractionDigits: 1 })} / ٥</span><span>({count.toLocaleString('ar-EG')} تقييم)</span></> : 'لم يُقيّم بعد'}</p>;
}
export function RatingControls({ identityId, initialValue, canRate, signedIn, isOwner, average, count, returnTo }: { identityId: string; initialValue: number | null; canRate: boolean; signedIn: boolean; isOwner: boolean; average: number | null; count: number; returnTo: string }) {
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [summary, setSummary] = useState({ average, count });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  function save(next: number | null) {
    setMessage(''); setError('');
    startTransition(async () => {
      try {
        const result = await setIdentityRating({ identityId, value: next });
        if (!result.ok) { setError(identityError(result.error)); return; }
        if (result.rating) { setSummary({ average: result.rating.average, count: result.rating.count }); setValue(result.rating.value); setSavedValue(result.rating.value); }
        setMessage(next === null ? 'تم حذف تقييمك.' : 'تم حفظ تقييمك. يمكنك تعديله أو حذفه.');
      } catch { setError('تعذر تأكيد التقييم. حدّث الصفحة لمراجعة تقييمك قبل المحاولة مجددًا.'); }
    });
  }
  return <section aria-label="تقييم الفريق" aria-busy={pending} className="mt-5 space-y-3 rounded-xl border border-border bg-card p-4 sm:max-w-lg">
    <RatingSummary average={summary.average} count={summary.count} />
    {canRate ? <><fieldset disabled={pending}><legend className="mb-2 text-sm font-medium">تقييمك للفريق</legend><div className="flex flex-wrap gap-1" role="radiogroup" aria-label="اختر تقييمًا من نجمة إلى خمس نجوم" dir="ltr">{[1,2,3,4,5].map(star => <label key={star} className="relative flex size-11 cursor-pointer items-center justify-center rounded-lg focus-within:outline-2 focus-within:outline-primary"><input type="radio" name={`rating-${identityId}`} value={star} checked={value === star} onChange={() => { setValue(star); setMessage(''); }} className="sr-only" aria-label={`${star} من 5`} /><Star aria-hidden className={`size-7 ${value !== null && star <= value ? 'fill-gold text-gold' : 'text-muted-foreground'}`} /></label>)}</div></fieldset>
    <p className="text-xs text-muted-foreground">{value === null ? 'اختر عدد النجوم ثم احفظ تقييمك.' : `اختيارك الحالي: ${value} من 5`}</p>
    <div className="flex flex-wrap gap-2"><Button type="button" disabled={pending || value === null || value === savedValue} onClick={() => save(value)} className="min-h-11">{pending ? 'جارٍ الحفظ…' : 'حفظ التقييم'}</Button>{savedValue !== null && <Button type="button" variant="outline" disabled={pending} onClick={() => save(null)} className="min-h-11">حذف تقييمي</Button>}</div></> : !signedIn ? <Link className="inline-flex min-h-11 items-center text-sm text-primary hover:underline" href={`/login?next=${encodeURIComponent(returnTo)}`}>سجّل الدخول بحساب مفعّل لتقييم الفريق</Link> : <p className="text-sm text-muted-foreground">{isOwner ? 'التقييم متاح للقراء الآخرين' : 'التقييم غير متاح لهذا الحساب حاليًا.'}</p>}
    {message && <p role="status" className="text-sm text-success">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
