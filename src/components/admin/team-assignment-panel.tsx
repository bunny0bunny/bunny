"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { setSeriesAssignment } from "@/lib/actions";
import { ROLE_LABELS, type Role } from "@/lib/constants";

export type StaffMember = {
  id: string;
  nickname: string;
  email: string;
  role: Role;
};

export function TeamAssignmentPanel({
  seriesId,
  staff,
  assignedProfileIds,
}: {
  seriesId: string;
  staff: StaffMember[];
  assignedProfileIds: string[];
}) {
  const [assignedSet, setAssignedSet] = useState<Set<string>>(new Set(assignedProfileIds));
  const [error, setError] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const toggleAssignment = (profileId: string, willAssign: boolean) => {
    setError("");
    startTransition(async () => {
      const res = await setSeriesAssignment({
        seriesId,
        profileId,
        assigned: willAssign,
      });

      if (!res.ok) {
        setError(res.error === "forbidden" ? "لا تملك صلاحية الإسناد" : "تعذر تحديث إسناد العمل");
        return;
      }

      setAssignedSet((prev) => {
        const next = new Set(prev);
        if (willAssign) next.add(profileId);
        else next.delete(profileId);
        return next;
      });

      router.refresh();
    });
  };

  if (staff.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4 text-xs text-muted-foreground">
        لا يوجد أعضاء فريق مؤهلون للإسناد (مساهمون أو محررون).
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">إسناد العمل للفريق</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            حدد المساهمين والمحررين المصرح لهم بإعداد ومراجعة فصول هذا العمل.
            إسناد الحساب يتيح العمل على الفصول؛ إضافة اسم في ملفات المترجمين لا تمنح صلاحيات. الاعتماد والنشر للإدارة فقط.
          </p>
        </div>
        {isPending && <span className="text-xs text-primary animate-pulse">جاري الحفظ…</span>}
      </div>

      {error && <div role="alert" className="text-xs text-danger">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {staff.map((member) => {
          const isAssigned = assignedSet.has(member.id);
          return (
            <label
              key={member.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer select-none ${
                isAssigned
                  ? "border-primary/40 bg-primary/10"
                  : "border-border/60 bg-card/60 hover:border-border"
              } ${isPending ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <Checkbox
                checked={isAssigned}
                disabled={isPending}
                onCheckedChange={(checked) => toggleAssignment(member.id, Boolean(checked))}
                aria-label={`إسناد العمل إلى ${member.nickname}`}
              />
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground truncate">{member.nickname}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                    {ROLE_LABELS[member.role] ?? member.role}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground/80 truncate">{member.email}</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
