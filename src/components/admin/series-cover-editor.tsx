"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, BookImage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadRequest } from '@/lib/media/upload-request';
import { sniffPage, MAX_PAGE_PIXELS } from '@/lib/media/formats';

type Option = { revisionId: string; chapterTitle: string; chapterNumber: number; revisionNumber: number; imagePath: string };
type Props = { seriesId?: string; currentCover: string; disabled?: boolean; onPrepared(blob: Blob | null): void; onBusyChange(busy: boolean): void };

function checkImage(bytes: Uint8Array) {
  let width: number, height: number;
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    width = view.getUint32(16); height = view.getUint32(20);
  } else ({ width, height } = sniffPage(bytes));
  if (!width || !height || width > 16000 || height > 16000 || width * height > MAX_PAGE_PIXELS) throw new Error('أبعاد الصورة كبيرة جدًا. اختر صورة أصغر من 16 مليون بكسل.');
}

export async function uploadSeriesCover(seriesId: string, previous: string, blob: Blob) {
  return uploadRequest<{ ok: true; coverPath: string }>(`/api/series/${seriesId}/cover`, {
    method: 'POST', headers: { 'Content-Type': blob.type, 'X-Bunny-Upload': '1', 'X-Bunny-Cover-Previous': encodeURIComponent(previous), 'X-Bunny-Cover-Consent': 'public-cover' }, body: blob,
  }, { timeoutMs: 120000 });
}

export function SeriesCoverEditor({ seriesId, currentCover, disabled, onPrepared, onBusyChange }: Props) {
  const id = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [preview, setPreview] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState<Option[] | null>(null);
  const [selected, setSelected] = useState('');
  const [position, setPosition] = useState({ x: 50, y: 50, zoom: 1 });
  const [consent, setConsent] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; bitmapRef.current?.close(); }; }, []);
  useEffect(() => { return () => { if (preview) URL.revokeObjectURL(preview); }; }, [preview]);
  useEffect(() => {
    if (!bitmap || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    const scale = Math.max(800 / bitmap.width, 1200 / bitmap.height) * position.zoom;
    const width = bitmap.width * scale, height = bitmap.height * scale;
    context.fillStyle = '#191c25'; context.fillRect(0, 0, 800, 1200);
    context.drawImage(bitmap, -(width - 800) * position.x / 100, -(height - 1200) * position.y / 100, width, height);
  }, [bitmap, position]);

  async function choose(blob: Blob) {
    setProcessing(true); onBusyChange(true); setError('');
    try {
      if (!blob.size || blob.size > 6 * 1024 * 1024) throw new Error('اختر صورة JPG أو PNG أو WebP بحجم حتى 6 ميجابايت.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      checkImage(bytes);
      const image = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      if (!mounted.current) { image.close(); return; }
      bitmapRef.current?.close(); bitmapRef.current = image;
      setBitmap(image); setPosition({ x: 50, y: 50, zoom: 1 }); setConsent(false);
    } catch (cause) {
      setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : 'تعذّر فتح الصورة. اختر صورة JPG أو PNG أو WebP صالحة.'); onBusyChange(Boolean(bitmapRef.current));
    } finally { if (mounted.current) setProcessing(false); }
  }
  function discard() { bitmapRef.current?.close(); bitmapRef.current = null; setBitmap(null); setConsent(false); setError(''); onBusyChange(false); }
  async function prepare() {
    if (!consent || !canvas.current) return;
    setProcessing(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(value => value ? resolve(value) : reject(new Error('تعذّر تجهيز الغلاف. حاول مرة أخرى.')), 'image/jpeg', 0.88));
      if (blob.size > 2 * 1024 * 1024) throw new Error('الصورة الناتجة كبيرة. جرّب صورة أبسط.');
      if (!mounted.current) return;
      setPreview(URL.createObjectURL(blob)); onPrepared(blob); discard();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذّر تجهيز الغلاف.'); }
    finally { if (mounted.current) setProcessing(false); }
  }
  async function loadOptions() {
    setProcessing(true); setError('');
    try { const result = await uploadRequest<{ ok: true; options: Option[] }>(`/api/series/${seriesId}/cover-options`, {}, { timeoutMs: 30000 }); setOptions(result.options); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذّر تحميل الفصول.'); }
    finally { setProcessing(false); }
  }
  async function chooseFirstPage() {
    const option = options?.find(item => item.revisionId === selected); if (!option) return;
    setProcessing(true); onBusyChange(true); setError('');
    try {
      const response = await fetch(option.imagePath, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
      if (!response.ok) throw new Error('تعذّر تحميل الصفحة الخاصة. أعد اختيار النسخة أو سجّل الدخول من جديد.');
      await choose(await response.blob());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذّر تحميل الصفحة.'); onBusyChange(Boolean(bitmapRef.current)); }
    finally { setProcessing(false); }
  }
  const locked = disabled || processing;
  return <section id="series-cover" aria-labelledby={`${id}-title`} className="space-y-4">
    <div><h2 id={`${id}-title`} className="text-lg font-semibold">غلاف العمل</h2><p className="mt-1 text-sm leading-7 text-muted-foreground">صورة مستقلة للعمل. تقدر تضيفها دلوقتي أو تكمل من غير غلاف مؤقتًا.</p></div>
    {bitmap ? <div className="space-y-3">
      <canvas ref={canvas} width={800} height={1200} role="img" aria-label="معاينة قص الغلاف" className="mx-auto aspect-[2/3] w-full max-w-60 rounded-xl border border-border" />
      {(['x', 'y', 'zoom'] as const).map(axis => <div key={axis} className="space-y-1"><label htmlFor={`${id}-${axis}`} className="text-sm">{axis === 'x' ? 'موضع أفقي' : axis === 'y' ? 'موضع رأسي' : 'تكبير الصورة'}</label><input id={`${id}-${axis}`} type="range" min={axis === 'zoom' ? 1 : 0} max={axis === 'zoom' ? 3 : 100} step={axis === 'zoom' ? 0.05 : 1} value={position[axis]} onChange={event => setPosition(value => ({ ...value, [axis]: Number(event.target.value) }))} disabled={locked} className="block min-h-11 w-full accent-primary" /></div>)}
      <label className="flex items-start gap-2 text-sm leading-7"><input type="checkbox" checked={consent} disabled={locked} onChange={event => setConsent(event.target.checked)} className="mt-2 size-4 shrink-0 accent-primary" />أوافق على إتاحة الصورة المختارة كغلاف عام مستقل، حتى لو الفصل لسه مسودة.</label>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={locked || !consent} onClick={prepare}>اعتماد القص</Button><Button type="button" variant="outline" disabled={locked} onClick={discard}>إلغاء القص</Button></div>
      <p className="text-xs leading-6 text-muted-foreground">اعتماد القص يجهّز الصورة؛ حفظ بيانات العمل هو اللي يحفظ الغلاف على الموقع.</p>
    </div> : <div className="space-y-3">
      <div className="mx-auto flex aspect-[2/3] w-full max-w-48 items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary">
        {preview || currentCover ? /* The chosen blob/current same-origin gateway is intentional; no Next optimizer caching. */ <img src={preview || currentCover} alt="معاينة غلاف العمل" className="h-full w-full object-cover" /> : <div className="p-5 text-center text-muted-foreground"><BookImage className="mx-auto mb-3 size-10" aria-hidden="true" /><span className="text-sm">مفيش غلاف لسه</span></div>}
      </div>
      {preview && <p role="status" className="text-sm text-primary">الغلاف جاهز للحفظ مع بيانات العمل.</p>}
      <input ref={input} id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void choose(file); }} />
      <Button type="button" variant="outline" disabled={locked} onClick={() => input.current?.click()} aria-controls={`${id}-file`} className="min-h-11 w-full gap-2"><ImagePlus className="size-4" aria-hidden="true" />اختيار صورة الغلاف</Button>
      {preview && <Button type="button" variant="ghost" disabled={locked} onClick={() => { setPreview(''); onPrepared(null); }} className="min-h-11 w-full">تجاهل الغلاف الجديد</Button>}
    </div>}
    {seriesId && !bitmap && <div className="space-y-2 border-t border-border pt-4">
      <Button type="button" variant="ghost" disabled={locked} onClick={loadOptions} className="min-h-11 w-full whitespace-normal">اختيار الصفحة الأولى من فصل مرفوع</Button>
      {options && (options.length ? <><label htmlFor={`${id}-revision`} className="block text-sm">الفصل والنسخة</label><select id={`${id}-revision`} value={selected} disabled={locked} onChange={event => setSelected(event.target.value)} className="min-h-11 w-full rounded-lg border border-input bg-card p-2 text-sm"><option value="">اختر نسخة للمعاينة</option>{options.map(option => <option key={option.revisionId} value={option.revisionId}>الفصل {option.chapterNumber} — {option.chapterTitle} — نسخة {option.revisionNumber}</option>)}</select><Button type="button" variant="outline" disabled={locked || !selected} onClick={chooseFirstPage} className="min-h-11 w-full">معاينة الصفحة وقصها</Button></> : <p className="text-sm leading-7 text-muted-foreground">مفيش صفحات PDF جاهزة للاختيار. ارفع فصلًا وافتح المعاينة الخاصة الأول.</p>)}
    </div>}
    {processing && <p role="status" className="text-sm text-muted-foreground">جارٍ تجهيز المعاينة…</p>}
    {error && <p role="alert" className="text-sm leading-7 text-danger">{error}</p>}
  </section>;
}
