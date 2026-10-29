"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { prepareChapterDownload } from "@/lib/downloads/browser";

const errors: Record<string, string> = {
  forbidden: "تنزيل هذا الفصل غير متاح حاليًا.",
  not_found: "الفصل غير متاح حاليًا.",
  unsupported_browser: "هذا المتصفح لا يدعم تجهيز PDF. جرّب متصفحًا حديثًا.",
  busy: "يجري تجهيز فصل آخر. انتظر اكتماله ثم أعد المحاولة.",
  too_large: "حجم الفصل أكبر من الحد المتاح للتنزيل (٦٤ ميجابايت).",
  too_many_pages: "هذا الفصل يتجاوز الحد المتاح حاليًا للتنزيل (٢٠٠ صورة).",
  invalid_image: "إحدى صفحات الفصل تالفة أو غير مدعومة. تعذّر تجهيز الملف.",
  conflict: "تغيّر محتوى الفصل أثناء التجهيز. أعد المحاولة.",
  unavailable: "تعذّر تحميل صفحات الفصل حاليًا. أعد المحاولة لاحقًا.",
  rate_limited: "طلبات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
};

export function ChapterDownloadButton({ chapterId }: { chapterId: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "preparing" | "ready" | "error">("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<{ url: string; filename: string } | null>(null);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);

  function dispose() {
    controller.current?.abort();
    controller.current = null;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  }

  useEffect(() => () => {
    controller.current?.abort();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  function changeOpen(value: boolean) {
    if (!value) { dispose(); setResult(null); setStatus("idle"); }
    setOpen(value);
  }

  async function start() {
    if (controller.current) return;
    dispose();
    setResult(null);
    setError("");
    setProgress({ current: 0, total: 0 });
    setStatus("preparing");
    const active = new AbortController();
    controller.current = active;
    try {
      const prepared = await prepareChapterDownload(chapterId, {
        signal: active.signal,
        onProgress: (current, total) => { if (!active.signal.aborted) setProgress({ current, total }); },
      });
      if (active.signal.aborted) return;
      const url = URL.createObjectURL(prepared.blob);
      objectUrl.current = url;
      setResult({ url, filename: prepared.filename });
      setStatus("ready");
    } catch (cause) {
      if (active.signal.aborted) return;
      const code = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : cause instanceof Error ? cause.message : "";
      setError(errors[code] ?? "تعذّر تجهيز الفصل. تحقق من الاتصال ومساحة الجهاز ثم أعد المحاولة.");
      setStatus("error");
    } finally {
      if (controller.current === active) controller.current = null;
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="تنزيل الفصل PDF"><Download className="size-4" aria-hidden /></Button></DialogTrigger>
    <DialogContent dir="rtl">
      <DialogHeader><DialogTitle>تنزيل الفصل PDF</DialogTitle><DialogDescription className="leading-7">يُجهّز ملف PDF محسّن للقراءة على جهازك. لا تُشارك الملفات الأصلية، ولا تُنشأ نسخة دائمة إضافية على الخادم. قد تُقسّم الصفحات الطويلة إلى عدة صفحات PDF. قد يستغرق التجهيز وقتًا حسب طول الفصل وجهازك.</DialogDescription></DialogHeader>
      <div aria-live="polite" aria-atomic="true" className="text-sm leading-7">
        {status === "preparing" && <p className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" aria-hidden />جارٍ التجهيز: {progress.current} / {progress.total || "…"}</p>}
        {status === "error" && <p className="text-destructive">{error}</p>}
        {status === "ready" && <p>الملف جاهز. اضغط لحفظه على جهازك.</p>}
      </div>
      {status === "preparing" ? <Button type="button" variant="outline" onClick={() => { dispose(); setStatus("idle"); }}>إلغاء التجهيز</Button>
        : result ? <Button asChild><a href={result.url} download={result.filename}>حفظ ملف PDF</a></Button>
        : <Button type="button" onClick={() => void start()}>{status === "error" ? "إعادة المحاولة" : "تجهيز ملف PDF"}</Button>}
    </DialogContent>
  </Dialog>;
}
