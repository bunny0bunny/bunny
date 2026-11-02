"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { sniffPage, MAX_PAGE_PIXELS } from '@/lib/media/formats';
import { IdentityAvatar } from './identity-avatar';
import { identityError } from './follow-controls';

type Props = { identityId: string; version: number; avatarPath: string | null; seed: string; name: string; disabled: boolean; onBusyChange(busy: boolean): void; onSaved(path: string | null, version: number): void; onBlocked(): void };
export function IdentityAvatarEditor({ identityId, version, avatarPath, seed, name, disabled, onBusyChange, onSaved, onBlocked }: Props) {
  const id = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const mounted = useRef(true);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [position, setPosition] = useState({ x: 50, y: 50, zoom: 1 });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; bitmapRef.current?.close(); }; }, []);
  useEffect(() => {
    if (!bitmap || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    const scale = Math.max(512 / bitmap.width, 512 / bitmap.height) * position.zoom;
    const width = bitmap.width * scale, height = bitmap.height * scale;
    context.clearRect(0, 0, 512, 512);
    context.drawImage(bitmap, -(width - 512) * position.x / 100, -(height - 512) * position.y / 100, width, height);
  }, [bitmap, position]);
  function discard() { bitmapRef.current?.close(); bitmapRef.current = null; setBitmap(null); onBusyChange(false); }
  async function choose(file: File) {
    setError(''); setMessage(''); setProcessing(true); onBusyChange(true);
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 6 * 1024 * 1024) throw new Error('اختر صورة PNG أو JPEG أو WebP بحجم حتى 6 ميجابايت.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      let width: number, height: number;
      if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); width = view.getUint32(16); height = view.getUint32(20);
      } else ({ width, height } = sniffPage(bytes));
      if (!width || !height || width > 16000 || height > 16000 || width * height > MAX_PAGE_PIXELS) throw new Error('أبعاد الصورة كبيرة جدًا. اختر صورة أصغر من 16 مليون بكسل.');
      const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (!mounted.current) { image.close(); return; }
      bitmapRef.current?.close(); bitmapRef.current = image; setBitmap(image); setPosition({ x: 50, y: 50, zoom: 1 });
    } catch (cause) { setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : 'تعذر فتح الصورة. اختر صورة صالحة.'); onBusyChange(Boolean(bitmapRef.current)); }
    finally { if (mounted.current) setProcessing(false); }
  }
  async function save(remove = false) {
    setProcessing(true); onBusyChange(true); setError(''); setMessage('');
    let requestStarted = false;
    let requestAnswered = false;
    try {
      let blob: Blob | undefined;
      if (!remove) {
        if (!canvas.current || !bitmap) throw new Error('اختر الصورة وراجع القص أولًا.');
        for (const quality of [0.9, 0.8, 0.65, 0.5]) {
          blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(value => value ? resolve(value) : reject(new Error('تعذر تجهيز الصورة.')), 'image/webp', quality));
          if (blob.type !== 'image/webp') throw new Error('المتصفح لا يدعم حفظ WebP. جرّب متصفحًا أحدث.');
          if (blob.size <= 256 * 1024) break;
        }
        if (!blob || blob.size > 256 * 1024) throw new Error('الصورة الناتجة أكبر من 256 كيلوبايت. اختر صورة أبسط.');
      }
      requestStarted = true;
      const response = await fetch(`/api/public-identities/${encodeURIComponent(identityId)}/avatar`, { method: remove ? 'DELETE' : 'POST', headers: { 'x-identity-avatar': '1', 'x-identity-version': String(version), ...(!remove ? { 'content-type': 'image/webp' } : {}) }, body: blob, signal: AbortSignal.timeout(60000) });
      const result = await response.json() as { ok: boolean; error?: string; avatarPath?: string | null; version?: number };
      requestAnswered = true;
      if (!response.ok || !result.ok) {
        if (result.error === 'conflict' || result.error === 'forbidden' || response.status === 403 || response.status === 409) onBlocked();
        throw new Error(identityError(result.error));
      }
      if (typeof result.version !== 'number' || !(typeof result.avatarPath === 'string' || result.avatarPath === null)) { onBlocked(); throw new Error('تعذر تأكيد الحفظ. حمّل النسخة الأخيرة قبل المتابعة.'); }
      onSaved(result.avatarPath, result.version); discard(); setMessage(remove ? 'تم حذف الصورة. ستظهر الصورة الرمزية البديلة.' : 'تم حفظ شعار الفريق.');
    } catch (cause) { if (requestStarted && !requestAnswered) onBlocked(); setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : 'تعذر تأكيد حفظ الصورة. حمّل النسخة الأخيرة وراجع الشعار قبل المحاولة مجددًا.'); }
    finally { if (mounted.current) { setProcessing(false); onBusyChange(Boolean(bitmapRef.current)); } }
  }
  const locked = disabled || processing;
  return <section aria-labelledby={`${id}-title`} aria-busy={processing} className="space-y-4 border-t border-border pt-5">
    <h2 id={`${id}-title`} className="font-semibold">شعار الفريق</h2>
    <p className="text-xs leading-6 text-muted-foreground">راجع القص المربع ثم احفظ الصورة. تُضغط على جهازك إلى WebP حتى 512 × 512 بكسل و256 كيلوبايت مع الحفاظ على الشفافية.</p>
    <IdentityAvatar avatarPath={avatarPath} seed={seed} name={name} className="size-20 text-2xl" />
    <label htmlFor={`${id}-file`} className="block text-sm">اختيار صورة PNG أو JPEG أو WebP</label><input id={`${id}-file`} type="file" accept="image/png,image/jpeg,image/webp" disabled={locked} className="block max-w-full text-sm file:me-3 file:min-h-11 file:rounded-lg file:border file:border-border file:bg-secondary file:px-3" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void choose(file); }} />
    {bitmap && <div className="space-y-3"><canvas ref={canvas} width={512} height={512} role="img" aria-label="معاينة القص المربع لشعار الفريق" className="aspect-square w-56 max-w-full rounded-xl border border-border bg-secondary" />{([{ key: 'x', label: 'الموضع الأفقي', min: 0, max: 100, step: 1 }, { key: 'y', label: 'الموضع الرأسي', min: 0, max: 100, step: 1 }, { key: 'zoom', label: 'تكبير الصورة', min: 1, max: 3, step: 0.05 }] as const).map(control => <label key={control.key} className="block max-w-sm text-sm">{control.label}<input aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={position[control.key]} disabled={locked} onChange={event => setPosition({ ...position, [control.key]: Number(event.target.value) })} className="mt-2 block min-h-11 w-full" /></label>)}<div className="flex flex-wrap gap-2"><Button type="button" disabled={locked} onClick={() => void save()} className="min-h-11">حفظ الصورة والقص</Button><Button type="button" variant="outline" disabled={locked} onClick={discard} className="min-h-11">إلغاء الصورة الجديدة</Button></div></div>}
    {avatarPath && !bitmap && <Button type="button" variant="outline" disabled={locked} onClick={() => void save(true)} className="min-h-11">إزالة الصورة الحالية</Button>}
    {processing && <p role="status" className="text-sm text-muted-foreground">جارٍ تجهيز الصورة أو حفظها…</p>}{message && <p role="status" className="text-sm text-success">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
