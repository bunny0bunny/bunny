"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, type ReaderRequest } from "@/lib/content-requests/contracts";
import { requestMutation } from "./client";
import { requestField } from "./new-request-form";

/** Withdraw (with confirmation) or edit the reader's own request. */
export function MyRequestActions({ item }: { item: ReaderRequest }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "confirm" | "edit">("idle");
  const [title, setTitle] = useState(item.title);
  const [category, setCategory] = useState<string>(item.category);
  const [referenceUrl, setReferenceUrl] = useState(item.referenceUrl ?? "");
  const [message, setMessage] = useState(item.message ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!item.canWithdraw && !item.canEdit) return null;
  async function run(url: string, body: Record<string, unknown>, after: () => void) {
    setPending(true); setError("");
    const result = await requestMutation(url, { expectedVersion: item.version, ...body });
    setPending(false);
    if (!result.ok) { setError(result.error); return; }
    after();
  }
  const base = `/api/content-requests/${encodeURIComponent(item.id)}`;
  return (
    <section aria-label="إدارة الطلب" className="mt-6 space-y-3 rounded-xl border border-border p-5">
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          {item.canEdit && <Button type="button" variant="outline" className="min-h-11" onClick={() => setMode("edit")}>تعديل الطلب</Button>}
          {item.canWithdraw && <Button type="button" variant="ghost" className="min-h-11 text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setMode("confirm")}>سحب الطلب</Button>}
        </div>
      )}
      {mode === "confirm" && (
        <div role="alertdialog" aria-label="تأكيد سحب الطلب" className="space-y-3">
          <p className="text-sm leading-7">سيختفي الطلب من قائمتك ولن تصلك تحديثات عنه. يظل محسوبًا ضمن حد الطلبات اليومي. تقدر تطلب نفس العمل مرة أخرى لاحقًا.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" className="min-h-11" disabled={pending} onClick={() => void run(`${base}/withdraw`, {}, () => { router.push("/requests?withdrawn=1"); router.refresh(); })}>{pending ? "جارٍ السحب…" : "نعم، اسحب الطلب"}</Button>
            <Button type="button" variant="ghost" className="min-h-11" disabled={pending} onClick={() => setMode("idle")}>إلغاء</Button>
          </div>
        </div>
      )}
      {mode === "edit" && (
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void run(`${base}/edit`, { title, category, referenceUrl, message }, () => { setMode("idle"); router.refresh(); }); }}>
          <div><label htmlFor="edit-title" className="mb-2 block text-sm font-semibold">اسم العمل</label><input id="edit-title" className={requestField} required minLength={2} maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} dir="auto" /></div>
          <div><label htmlFor="edit-category" className="mb-2 block text-sm font-semibold">نوع العمل</label><select id="edit-category" className={requestField} value={category} onChange={(e) => setCategory(e.target.value)} disabled={pending}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><label htmlFor="edit-reference" className="mb-2 block text-sm font-semibold">رابط مرجعي (اختياري)</label><input id="edit-reference" type="url" pattern="https?://.*" maxLength={2048} className={requestField} value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} disabled={pending} dir="ltr" /></div>
          <div><label htmlFor="edit-message" className="mb-2 block text-sm font-semibold">رسالتك (اختياري)</label><textarea id="edit-message" rows={4} maxLength={1000} className={requestField} value={message} onChange={(e) => setMessage(e.target.value)} disabled={pending} dir="auto" /></div>
          <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ التعديل"}</Button><Button type="button" variant="ghost" className="min-h-11" disabled={pending} onClick={() => setMode("idle")}>إلغاء</Button></div>
        </form>
      )}
      {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm leading-7">{error}</p>}
    </section>
  );
}
