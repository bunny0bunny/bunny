"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { arabicError } from "@/lib/error-messages-ar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { upsertCollection, deleteCollection } from "@/lib/actions";

type CollectionDraft = {
  id?: string;
  slug: string;
  titleAr: string;
  descriptionAr: string;
  theme: "violet" | "gold" | "emerald" | "rose";
  displayOrder: number;
  isFeatured: boolean;
  seriesSlugs: string[];
};

const THEME_LABELS: Record<CollectionDraft["theme"], string> = {
  violet: "بنفسجي",
  gold: "ذهبي",
  emerald: "زمردي",
  rose: "وردي",
};

/** Collections CRUD form (editor+). Featured collections render on the homepage. */
export function CollectionForm({
  seriesOptions,
  initial,
}: {
  seriesOptions: { slug: string; titleAr: string }[];
  initial: CollectionDraft | null;
}) {
  const [d, setD] = useState<CollectionDraft>(
    initial ?? { slug: "", titleAr: "", descriptionAr: "", theme: "violet", displayOrder: 10, isFeatured: true, seriesSlugs: [] }
  );
  const [msg, setMsg] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const set = <K extends keyof CollectionDraft>(k: K, v: CollectionDraft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  const toggleSlug = (slug: string) =>
    setD((prev) => ({
      ...prev,
      seriesSlugs: prev.seriesSlugs.includes(slug)
        ? prev.seriesSlugs.filter((s) => s !== slug)
        : [...prev.seriesSlugs, slug],
    }));

  const save = () => {
    setMsg("");
    startTransition(async () => {
      const res = await upsertCollection(d);
      setMsg(res.ok ? "تم الحفظ ✓" : arabicError(res.error, "تعذّر الحفظ"));
      if (res.ok) router.refresh();
    });
  };

  const remove = () => {
    if (!d.id) return;
    startTransition(async () => {
      const res = await deleteCollection(d.id!);
      if (res.ok) {
        router.push("/admin/collections");
        router.refresh();
      } else {
        setMsg(arabicError(res.error, "تعذّر الحذف"));
        setConfirmRemove(false);
      }
    });
  };

  return (
    <div className="space-y-3.5 rounded-2xl border border-border/60 bg-card p-4">
      <h2 className="text-sm font-bold">{d.id ? "تحرير مجموعة" : "مجموعة جديدة"}</h2>

      <div>
        <Label htmlFor="col-title" className="text-xs text-muted-foreground">العنوان (عربي)</Label>
        <Input id="col-title" value={d.titleAr} onChange={(e) => set("titleAr", e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="col-desc" className="text-xs text-muted-foreground">الوصف</Label>
        <Textarea id="col-desc" value={d.descriptionAr} onChange={(e) => set("descriptionAr", e.target.value)} rows={2} className="mt-1 resize-none" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="col-slug" className="text-xs text-muted-foreground">المعرّف</Label>
          <Input id="col-slug" value={d.slug} onChange={(e) => set("slug", e.target.value)} dir="ltr" className="mt-1" disabled={Boolean(d.id)} />
        </div>
        <div>
          <Label htmlFor="col-order" className="text-xs text-muted-foreground">الترتيب</Label>
          <Input
            id="col-order"
            type="number"
            min={0}
            max={99}
            value={d.displayOrder}
            onChange={(e) => set("displayOrder", Number(e.target.value))}
            className="mt-1"
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">اللون</Label>
        <Select value={d.theme} onValueChange={(v) => set("theme", v as CollectionDraft["theme"])}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(THEME_LABELS) as CollectionDraft["theme"][]).map((t) => (
              <SelectItem key={t} value={t}>{THEME_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="col-featured" className="text-xs text-muted-foreground">مميزة على الرئيسية</Label>
        <Switch id="col-featured" checked={d.isFeatured} onCheckedChange={(v) => set("isFeatured", v)} />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs text-muted-foreground">الأعمال ({d.seriesSlugs.length} مختارة)</legend>
        <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-border/50 p-2.5">
          {seriesOptions.map((s) => (
            <label key={s.slug} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-accent/40">
              <Checkbox checked={d.seriesSlugs.includes(s.slug)} onCheckedChange={() => toggleSlug(s.slug)} />
              <span className="truncate">{s.titleAr}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {msg && <p className="text-xs text-muted-foreground" aria-live="polite">{msg}</p>}

      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={save} className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
          <Save className="size-3.5" /> حفظ
        </Button>
        {d.id && !confirmRemove && (
          <Button size="sm" disabled={pending} variant="outline" className="gap-1.5 border-danger/40 text-danger hover:bg-danger/10" onClick={() => setConfirmRemove(true)}>
            <Trash2 className="size-3.5" /> حذف
          </Button>
        )}
      </div>
      {d.id && confirmRemove && (
        <div role="alertdialog" aria-label="تأكيد حذف المجموعة" className="flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-2 text-xs">
          <span className="font-semibold text-danger">حذف هذه المجموعة نهائيًا؟ الأعمال نفسها لن تُحذف.</span>
          <Button size="sm" variant="destructive" disabled={pending} onClick={remove} className="h-9 px-3">نعم، احذف</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmRemove(false)} className="h-9 px-2">إلغاء</Button>
        </div>
      )}
    </div>
  );
}
