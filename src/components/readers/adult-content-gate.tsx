"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasAdultConsent, rememberAdultConsent } from "@/lib/adult-consent";
import { AdultBadge } from "@/components/library/adult-badge";

const consentEvent = "bunyora-adult-consent";
function subscribe(notify: () => void) {
  window.addEventListener(consentEvent, notify);
  return () => window.removeEventListener(consentEvent, notify);
}
const serverConsent = () => false;

/** A content warning, not identity/age verification. Reader effects mount only after consent. */
export function AdultContentGate({ isAdult, seriesId, seriesSlug, seriesTitle, children }: {
  isAdult: boolean; seriesId: string; seriesSlug: string; seriesTitle: string; children: ReactNode;
}) {
  const remembered = useSyncExternalStore(subscribe, () => hasAdultConsent(seriesId), serverConsent);
  const [accepted, setAccepted] = useState(false);
  function continueReading() {
    rememberAdultConsent(seriesId);
    setAccepted(true);
    window.dispatchEvent(new Event(consentEvent));
  }
  if (!isAdult || accepted || remembered) return children;
  return <main dir="rtl" className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
    <section aria-labelledby="adult-warning-title" className="w-full max-w-lg space-y-5 rounded-2xl border border-red-500/40 bg-card p-6 text-center sm:p-8">
      <ShieldAlert className="mx-auto size-12 text-red-700 dark:text-red-300" aria-hidden />
      <AdultBadge />
      <h1 id="adult-warning-title" className="text-xl font-bold">محتوى مخصص للبالغين</h1>
      <p className="break-words font-semibold"><bdi>{seriesTitle}</bdi></p>
      <p className="text-sm leading-7 text-muted-foreground">هذا العمل مصنف للبالغين بعمر 18 عامًا أو أكثر، وقد يحتوي على مشاهد أو موضوعات لا تناسب الأصغر سنًا. يمكنك متابعة القراءة أو الرجوع إلى صفحة العمل.</p>
      <div className="flex flex-col gap-3"><Button type="button" className="min-h-11 h-auto whitespace-normal bg-red-700 py-3 text-white hover:bg-red-800" onClick={continueReading}>عمري 18 عامًا أو أكثر — متابعة القراءة</Button><Button asChild variant="outline" className="min-h-11"><Link href={`/series/${seriesSlug}`}>الرجوع إلى صفحة العمل</Link></Button></div>
      <p className="text-xs leading-6 text-muted-foreground">يُحفظ اختيار المتابعة لهذا العمل داخل تبويب المتصفح الحالي فقط.</p>
    </section>
  </main>;
}
