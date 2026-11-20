"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GENRES } from "@/lib/constants";
import { updatePreferredGenres } from "@/lib/account-actions";
import { arabicError } from "@/lib/error-messages-ar";

/** Chips for the genres the reader likes; they shape the "for you" rail on the home page. */
export function PreferredGenresEditor({ initial }: { initial: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initial);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const changed = selected.length !== initial.length || selected.some((g) => !initial.includes(g));
  return (
    <div className="space-y-3">
      <p className="text-xs leading-6 text-muted-foreground">اختر ما تحب قراءته، وسنقترح عليك أعمالًا منه في الصفحة الرئيسية.</p>
      <div className="flex flex-wrap gap-2">
        {GENRES.map((g) => {
          const active = selected.includes(g);
          return (
            <button key={g} type="button" aria-pressed={active} onClick={() => { setMessage(""); setSelected((prev) => (active ? prev.filter((x) => x !== g) : [...prev, g])); }}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${active ? "border-primary/60 bg-primary/20 text-primary" : "border-border/70 bg-card text-muted-foreground hover:text-foreground"}`}>
              {active && <Check className="size-3.5" aria-hidden />}{g}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" disabled={pending || !changed} className="h-11 text-xs" onClick={() => start(async () => {
          const res = await updatePreferredGenres({ genres: selected });
          setMessage(res.ok ? "تم حفظ اختياراتك ✓" : arabicError(res.error, "تعذّر الحفظ."));
          if (res.ok) router.refresh();
        })}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}حفظ الأنواع</Button>
        {message && <span aria-live="polite" className="text-xs text-muted-foreground">{message}</span>}
      </div>
    </div>
  );
}
