"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Trash2, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteComment, moderateComment } from "@/lib/actions";
import { arabicError } from "@/lib/error-messages-ar";

type Result = { ok: boolean; error?: string } | undefined | void;

/** Moderation controls: hide/restore or permanently delete a comment. */
export function ModerateActions({ commentId, status }: { commentId: string; status: "flagged" | "hidden" }) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const run = (fn: () => Promise<Result>) => {
    setError("");
    startTransition(async () => {
      const res = await fn();
      if (res && !res.ok) {
        setError(arabicError(res.error, "تعذّر تنفيذ الإجراء."));
        return;
      }
      setConfirmDelete(false);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "flagged" ? (
          <Button size="sm" disabled={pending} variant="outline" className="h-11 gap-1.5 border-success/40 text-success hover:bg-success/10" onClick={() => run(() => moderateComment({ commentId, status: "visible" }))}>
            <Eye className="size-3.5" aria-hidden /> إبقاء ظاهرًا (تجاهل البلاغ)
          </Button>
        ) : (
          <Button size="sm" disabled={pending} variant="outline" className="h-11 gap-1.5 border-success/40 text-success hover:bg-success/10" onClick={() => run(() => moderateComment({ commentId, status: "visible" }))}>
            <Eye className="size-3.5" aria-hidden /> إعادة الظهور
          </Button>
        )}
        {status === "flagged" && (
          <Button size="sm" disabled={pending} variant="outline" className="h-11 gap-1.5 border-gold/40 text-gold hover:bg-gold/10" onClick={() => run(() => moderateComment({ commentId, status: "hidden" }))}>
            <EyeOff className="size-3.5" aria-hidden /> إخفاء
          </Button>
        )}
        {!confirmDelete && (
          <Button size="sm" disabled={pending} variant="outline" className="h-11 gap-1.5 border-danger/40 text-danger hover:bg-danger/10" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-3.5" aria-hidden /> حذف نهائي
          </Button>
        )}
      </div>
      {confirmDelete && (
        <div role="alertdialog" aria-label="تأكيد الحذف النهائي" className="flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-2 text-xs">
          <span className="font-semibold text-danger">سيُحذف التعليق نهائيًا ولا يمكن استرجاعه. الإخفاء بديل قابل للتراجع.</span>
          <Button size="sm" variant="destructive" disabled={pending} className="h-9 px-3" onClick={() => run(() => deleteComment({ commentId }))}>نعم، احذف نهائيًا</Button>
          <Button size="sm" variant="ghost" disabled={pending} className="h-9 px-2" onClick={() => setConfirmDelete(false)}>إلغاء</Button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
