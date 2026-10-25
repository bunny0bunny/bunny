"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, type CatalogWork } from "@/lib/content-requests/contracts";
import { createSubmission } from "./client";
export const requestField = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60";
export function NewRequestForm({ initialTitle = "" }: { initialTitle?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle.slice(0, 150));
  const [category, setCategory] = useState("manga");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<CatalogWork[]>([]);
  const [catalogState, setCatalogState] = useState("");
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const submission = useRef<ReturnType<typeof createSubmission> | null>(null);
  useEffect(() => {
    if (title.trim().length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setCatalogState("جارٍ البحث في المكتبة…");
      try {
        const response = await fetch(`/api/content-requests/catalog?q=${encodeURIComponent(title.trim())}`, { signal: abort.signal });
        const data = await response.json();
        if (abort.signal.aborted) return;
        if (!response.ok || !data.ok || !Array.isArray(data.items)) throw Error();
        setSuggestions(data.items); setCatalogState(data.items.length ? "قد تجد العمل في المكتبة بالفعل:" : "لا توجد أعمال مطابقة في المكتبة حاليًا.");
      } catch { if (!abort.signal.aborted) { setSuggestions([]); setCatalogState("تعذّر البحث في المكتبة. يمكنك إرسال الطلب أو المحاولة بعد تعديل العنوان."); } }
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [title]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    submission.current ??= createSubmission(crypto.randomUUID());
    const result = await submission.current({ title, category, referenceUrl, message });
    if (result.ok) { router.push(`/requests/${encodeURIComponent(result.id)}`); return; }
    setError(result.error); setUncertain(Boolean(result.uncertain)); busy.current = false; setPending(false);
  }
  return <form onSubmit={submit} className="space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-7">
    <div><label htmlFor="request-title" className="mb-2 block text-sm font-semibold">اسم العمل <span className="text-muted-foreground">(مطلوب)</span></label><input id="request-title" className={requestField} required minLength={2} maxLength={150} value={title} onChange={e => { setTitle(e.target.value); setSuggestions([]); setCatalogState(""); }} disabled={pending || uncertain} autoComplete="off" dir="auto" /></div>
    {title.trim().length >= 2 && <section aria-label="أعمال موجودة في المكتبة" className="space-y-2"><p role="status" className="text-sm text-muted-foreground">{catalogState}</p>{suggestions.length > 0 && <ul className="divide-y divide-border rounded-lg border border-border">{suggestions.map(work => <li key={work.id}><Link className="flex min-h-11 items-center px-3 py-2 text-sm text-primary underline-offset-4 hover:underline" href={work.href}><bdi>{work.title}</bdi></Link></li>)}</ul>}</section>}
    <div><label htmlFor="request-category" className="mb-2 block text-sm font-semibold">نوع العمل</label><select id="request-category" className={requestField} value={category} onChange={e => setCategory(e.target.value)} disabled={pending || uncertain}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <div><label htmlFor="request-reference" className="mb-2 block text-sm font-semibold">رابط مرجعي <span className="text-muted-foreground">(اختياري)</span></label><input id="request-reference" type="url" pattern="https?://.*" maxLength={2048} className={requestField} value={referenceUrl} onChange={e => setReferenceUrl(e.target.value)} disabled={pending || uncertain} dir="ltr" placeholder="https://" /><p className="mt-2 text-xs text-muted-foreground">رابط يبدأ بـ http أو https يساعد الإدارة على تحديد العمل.</p></div>
    <div><label htmlFor="request-message" className="mb-2 block text-sm font-semibold">رسالتك للإدارة <span className="text-muted-foreground">(اختياري)</span></label><textarea id="request-message" rows={5} maxLength={1000} className={requestField} value={message} onChange={e => setMessage(e.target.value)} disabled={pending || uncertain} dir="auto" /><p className="mt-1 text-xs text-muted-foreground">{message.length} / 1000</p></div>
    {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm leading-7">{error}{uncertain && <span className="block">احتفظنا بالنص كما أُرسل. أعد محاولة الإرسال لتأكيد نتيجته قبل إجراء أي تعديل.</span>}</p>}
    <div className="flex flex-wrap items-center gap-3"><Button type="submit" className="min-h-11" disabled={pending}>{pending ? "جارٍ إرسال الطلب…" : error ? "إعادة محاولة الإرسال" : "إرسال الطلب"}</Button><Link className="inline-flex min-h-11 items-center px-3 text-sm text-muted-foreground hover:text-foreground" href="/requests">طلباتي</Link></div>
  </form>;
}
