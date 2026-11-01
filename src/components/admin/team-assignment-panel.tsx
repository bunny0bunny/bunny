"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { setSeriesAssignment, setSeriesPublishingPermission } from "@/lib/actions";
import { ROLE_LABELS, type Role } from "@/lib/constants";

export type StaffMember = { id: string; nickname: string; email: string; role: Role };

export function TeamAssignmentPanel({ seriesId, staff, assignedProfileIds, publishingProfileIds }: {
  seriesId: string;
  staff: StaffMember[];
  assignedProfileIds: string[];
  publishingProfileIds: string[];
}) {
  const [assignedSet, setAssignedSet] = useState(() => new Set(assignedProfileIds));
  const [publishingSet, setPublishingSet] = useState(() => new Set(publishingProfileIds));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggleAssignment(profileId: string, assigned: boolean) {
    setError(""); setNotice("");
    startTransition(async () => {
      try {
        const result = await setSeriesAssignment({ seriesId, profileId, assigned });
        if (!result.ok) { setError("تعذر تحديث إسناد العمل. أعد تحميل الصفحة وتحقق من صلاحياتك."); return; }
        setAssignedSet(previous => { const next = new Set(previous); if (assigned) next.add(profileId); else next.delete(profileId); return next; });
        if (!assigned) setPublishingSet(previous => { const next = new Set(previous); next.delete(profileId); return next; });
        setNotice(assigned ? "تم إسناد العمل. صلاحية النشر تحتاج تفعيلًا مستقلًا للمحرر." : "أُلغي الإسناد وصلاحية النشر لهذا العمل.");
        router.refresh();
      } catch { setError("تعذر تأكيد الحفظ. أعد تحميل الصفحة قبل المحاولة مجددًا."); }
    });
  }

  function togglePublishing(profileId: string, canPublish: boolean) {
    setError(""); setNotice("");
    startTransition(async () => {
      try {
        const result = await setSeriesPublishingPermission({ seriesId, profileId, canPublish });
        if (!result.ok) { setError("تعذر تغيير صلاحية النشر. تأكد أن الحساب محرر مفعّل وموثّق ومسند لهذا العمل."); return; }
        setPublishingSet(previous => { const next = new Set(previous); if (canPublish) next.add(profileId); else next.delete(profileId); return next; });
        setNotice(canPublish ? "تم السماح بالنشر الفوري لهذا العمل فقط." : "تم إلغاء صلاحية النشر الفوري لهذا العمل.");
        router.refresh();
      } catch { setError("تعذر تأكيد الحفظ. أعد تحميل الصفحة قبل المحاولة مجددًا."); }
    });
  }

  if (!staff.length) return <div className="rounded-xl border border-border/60 bg-card p-4 text-xs text-muted-foreground">لا يوجد أعضاء فريق مؤهلون للإسناد (مساهمون أو محررون).</div>;

  return <div className="space-y-4 rounded-xl border border-border/60 bg-card p-5">
    <div>
      <h3 className="text-sm font-semibold text-foreground">إسناد العمل للفريق</h3>
      <p className="mt-1 text-xs leading-6 text-muted-foreground">الإسناد يتيح إعداد فصول هذا العمل ومراجعتها. يمكنك منح محرر مسند صلاحية النشر الفوري لهذا العمل فقط؛ الجدولة والسحب والحذف للإدارة. ملف المترجم العام لا يمنح صلاحيات للحساب.</p>
    </div>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    <p role="status" aria-live="polite" className="text-xs text-primary">{isPending ? "جارٍ الحفظ…" : notice}</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {staff.map(member => {
        const assigned = assignedSet.has(member.id);
        return <div key={member.id} className={`rounded-lg border p-3 ${assigned ? "border-primary/40 bg-primary/10" : "border-border/60 bg-card/60"}`}>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={assigned} disabled={isPending} onCheckedChange={checked => toggleAssignment(member.id, checked === true)} aria-label={`إسناد العمل إلى ${member.nickname}`} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-foreground">{member.nickname}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{ROLE_LABELS[member.role] ?? member.role}</span>
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">{member.email}</span>
            </span>
          </label>
          {member.role === "editor" && assigned && <div className="mt-2 border-t border-border/50 pt-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-xs">
              <Checkbox checked={publishingSet.has(member.id)} disabled={isPending} onCheckedChange={checked => togglePublishing(member.id, checked === true)} aria-label={`السماح بالنشر الفوري لـ${member.nickname} في هذا العمل`} />
              السماح بالنشر الفوري
            </label>
            <p className="text-[11px] leading-5 text-muted-foreground">يتيح الاعتماد والنشر الآن بعد إرسال الفصل للمراجعة، دون انتظار الإدارة. لا يتيح الجدولة أو تغيير إعدادات العمل.</p>
          </div>}
        </div>;
      })}
    </div>
  </div>;
}
