"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getTrashPreview, moveToTrash, restoreTrash, requestPermanentDelete } from "@/lib/content-trash/actions";
import type { TrashItem, TrashKind, TrashPreview } from "@/lib/content-trash/contracts";

const uncertain = "تعذر تأكيد النتيجة. حدّث الصفحة وتحقق من الحالة قبل المحاولة مجددًا.";
export function trashErrorMessage(code?: string | null) {
  switch (code) {
    case "forbidden": case "unauthorized": case "unauthenticated": return "لا تملك صلاحية تنفيذ هذه العملية. حدّث الصفحة للتحقق من حسابك.";
    case "conflict": case "stale_version": case "stale_content": return "تغير المحتوى أو حالته. حدّث الصفحة وافتح معاينة جديدة.";
    case "shared_reference": return "ملف مستخدم في محتوى آخر؛ عدّل المرجع أو الغلاف هناك قبل إعادة المحاولة.";
    case "unsafe_object": return "تعذر التحقق من ملكية أحد الملفات. لم يُحذف المحتوى؛ يحتاج الملف إلى مراجعة الإدارة.";
    case "target_changed": return "حالة المحتوى لا تطابق سجل الحذف؛ توقفت العملية لحماية الملفات. راجع المحتوى من الإدارة.";
    case "storage_failed": case "storage_unavailable": return "تعذر حذف بعض الملفات. بقيت العملية محفوظة ويمكن استئنافها بعد تحديث الحالة.";
    case "cleanup_in_progress": return "تجري معالجة ملفات المصدر حاليًا. انتظر اكتمالها ثم حدّث الصفحة وحاول النقل مجددًا.";
    case "listing_unavailable": case "invalid_listing": return "تعذر التحقق من قائمة الملفات. بقي المحتوى محفوظًا؛ حدّث الحالة لإعادة المحاولة.";
    case "invalid_input": return "تعذر التحقق من بيانات الطلب. حدّث الصفحة وافتح معاينة جديدة.";
    case "invalid_confirmation": case "confirmation_mismatch": return "نص التأكيد لا يطابق النص المطلوب.";
    case "not_found": return "المحتوى غير متاح بهذه الحالة. حدّث الصفحة للتحقق.";
    case "parent_unavailable": return "استعد العمل الأب أولًا ثم أعد محاولة استعادة الفصل.";
    case "purging": case "already_purging": return "بدأ الحذف النهائي ولا يمكن استعادة المحتوى. حدّث الحالة لمتابعة التقدم.";
    default: return "تعذر تنفيذ العملية. حدّث الصفحة للتحقق من الحالة قبل المحاولة مجددًا.";
  }
}
function trashDate(value: string) { return new Date(value).toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'}); }
function bytesLabel(bytes: number) { return `${(bytes / 1024 / 1024).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} MB`; }

export function MoveToTrashButton({ kind, id, returnTo, disabled = false }: { kind: TrashKind; id: string; returnTo?: string; disabled?: boolean }) {
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<TrashPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function load() {
    setOpen(true); setPreview(null); setConfirmation(""); setError("");
    startTransition(async () => {
      try { const result = await getTrashPreview(kind, id); setPreview(result.data); if (!result.ok || !result.data) setError(`${trashErrorMessage(result.error)} أغلق النافذة وحدّث الصفحة.`); }
      catch { setError("تعذر تحميل المعاينة. أغلق النافذة وحدّث الصفحة ثم افتح معاينة جديدة."); }
    });
  }
  function submit() {
    if (!preview) return;
    startTransition(async () => {
      try {
        const result = await moveToTrash({ kind, id, expectedUpdatedAt: preview.updatedAt, confirmation });
        if (!result.ok) { setError(`${trashErrorMessage(result.error)} افتح معاينة جديدة بعد تحديث الصفحة.`); setPreview(null); return; }
        setOpen(false);
        if (returnTo) router.push(returnTo);
        router.refresh();
      } catch { setPreview(null); setError(uncertain); }
    });
  }
  return <>
    <Button type="button" variant="outline" className="min-h-11 border-danger/40 text-danger" disabled={disabled || pending} onClick={load}>نقل إلى السلة</Button>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}><DialogContent className="max-h-[90dvh] overflow-y-auto" showCloseButton={!pending}>
      <DialogHeader><DialogTitle>نقل {kind === "series" ? "العمل" : "الفصل"} إلى السلة</DialogTitle><DialogDescription>يختفي المحتوى من المكتبة فورًا، ويمكن استعادته كمسودة خلال 30 يومًا. بعدها يبدأ الحذف النهائي للملفات والمحتوى. سيتم إيقاف الرفع الجاري ومنع إرفاق ملفات جديدة بالمحتوى بعد نقله.</DialogDescription></DialogHeader>
      {pending && !preview && <p role="status">جارٍ تحميل المعاينة…</p>}
      {preview && <><p className="break-words font-semibold"><bdi>{preview.title}</bdi></p><p className="text-sm leading-7">الفصول: {preview.chapterCount} · المنشورة: {preview.publishedCount} · عمليات الرفع: {preview.uploadCount} · حجم المرفوعات المسجل: <bdi>{bytesLabel(preview.bytes)}</bdi></p><p className="text-sm leading-7">استعادة العمل تشمل الفصول المنقولة معه فقط؛ الفصول الموجودة سابقًا في السلة تبقى فيها.</p><label htmlFor={fieldId} className="text-sm">للتأكيد، اكتب: <bdi className="font-bold select-all">{preview.confirmation}</bdi></label><Input id={fieldId} autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={pending} className="min-h-11" /></>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <DialogFooter><Button variant="outline" className="min-h-11" disabled={pending} onClick={() => setOpen(false)}>إلغاء</Button><Button className="min-h-11 bg-danger text-white hover:bg-danger/90" disabled={pending || !preview || confirmation !== preview.confirmation} onClick={submit}>{pending ? "جارٍ النقل…" : "تأكيد النقل إلى السلة"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}

export function TrashList({ items }: { items: TrashItem[] }) {
  const active = items.filter(item => item.state === 'trashed' || item.state === 'purging');
  const history = items.filter(item => item.state === 'restored' || item.state === 'purged');
  return <div className="space-y-4"><Button className="min-h-11" variant="outline" onClick={() => window.location.reload()}>تحديث الحالة</Button>{active.length === 0 && <p className="rounded-xl border p-8 text-center text-muted-foreground">السلة فارغة.</p>}{active.map(item => <TrashRow key={`${item.id}:${item.version}`} item={item} />)}{history.length > 0 && <details className="rounded-xl border p-4"><summary className="min-h-11 cursor-pointer font-semibold">سجل العمليات الأخيرة</summary><ul className="space-y-3">{history.map(item => <li key={item.id} className="border-t pt-3 text-sm"><bdi className="font-semibold">{item.title}</bdi><p>{item.state === 'restored' ? 'تمت الاستعادة كمسودة' : 'اكتمل الحذف النهائي'}{item.lastActionByName ? ` — ${item.lastActionByName}` : ''} · {trashDate(item.restoredAt ?? item.purgedAt ?? item.deletedAt)}</p></li>)}</ul></details>}</div>;
}
function TrashRow({ item }: { item: TrashItem }) {
  const router = useRouter();
  const inputId = useId();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  function perform(permanent: boolean) {
    setError("");
    startTransition(async () => {
      try {
        const result = permanent ? await requestPermanentDelete({ id: item.id, expectedVersion: item.version, confirmation }) : await restoreTrash({ id: item.id, expectedVersion: item.version });
        if (!result.ok) { setError(`${trashErrorMessage(result.error)} حدّث الحالة قبل المحاولة مجددًا.`); setBlocked(true); return; }
        setOpen(false); setBlocked(true); router.refresh();
      } catch { setError(uncertain); setBlocked(true); }
    });
  }
  const purging = item.state === "purging";
  return <article className="space-y-3 rounded-2xl border border-border bg-card p-5">
    <h2 className="break-words text-lg font-semibold"><bdi>{item.title}</bdi></h2><p className="text-sm text-muted-foreground">{item.kind === "series" ? "عمل" : "فصل"} · {item.chapterCount} فصل · حجم المرفوعات المسجل: <bdi>{bytesLabel(item.bytes)}</bdi></p>
    {item.deletedByName && <p className="text-sm text-muted-foreground">نقله إلى السلة: {item.deletedByName}</p>}
    <p className="text-sm">نُقل في {trashDate(item.deletedAt)} · موعد الحذف: {trashDate(item.purgeAfter)}</p>
    {purging && <p role="status" className="text-sm text-danger">الحذف النهائي قيد التنفيذ ولا يمكن الاستعادة. تبقى السجلات حتى اكتمال حذف الملفات. حدّث الحالة لمتابعة النتيجة.</p>}
    {purging && Boolean(item.filesTotal) && <p className="text-sm">تم حذف {item.filesDeleted ?? 0} من {item.filesTotal} ملف مفهرس.</p>}
    {purging && item.purgeNotBefore && <p className="text-sm text-muted-foreground">لحماية عمليات الرفع الحديثة، لن يبدأ حذف الملفات قبل {trashDate(item.purgeNotBefore)}.</p>}
    {item.errorCode && <p role="status" className="text-sm text-danger">{trashErrorMessage(item.errorCode)}</p>}
    {item.parentUnavailable && <p className="text-sm text-muted-foreground">استعد العمل الأب أولًا، ثم استعد هذا الفصل بشكل مستقل.</p>}
    <div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="outline" disabled={pending || blocked || purging || item.parentUnavailable} onClick={() => perform(false)}>استعادة كمسودة</Button><Button className="min-h-11 border-danger/40 text-danger" variant="outline" disabled={pending || blocked} onClick={() => { setConfirmation(""); setOpen(true); }}>{purging ? "استئناف الحذف النهائي" : "حذف نهائي الآن"}</Button></div>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}><DialogContent showCloseButton={!pending}><DialogHeader><DialogTitle>حذف نهائي لا يمكن التراجع عنه</DialogTitle><DialogDescription>سيتم حذف الملفات والمحتوى نهائيًا. لا يمكن استعادته بعد بدء العملية.</DialogDescription></DialogHeader><label htmlFor={inputId} className="text-sm">اكتب العنوان كاملًا: <bdi className="font-bold select-all">{item.title}</bdi></label><Input id={inputId} className="min-h-11" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={pending} autoComplete="off" /><DialogFooter><Button className="min-h-11" variant="outline" disabled={pending} onClick={() => setOpen(false)}>إلغاء</Button><Button className="min-h-11 bg-danger text-white hover:bg-danger/90" disabled={pending || blocked || confirmation !== item.title} onClick={() => perform(true)}>{pending ? "جارٍ الطلب…" : "تأكيد الحذف النهائي"}</Button></DialogFooter>{error && <p role="alert" className="text-sm text-danger">{error}</p>}</DialogContent></Dialog>
  </article>;
}
