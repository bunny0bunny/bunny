"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { setUserRole } from "@/lib/actions";
import { ROLE_CAPABILITIES, ROLE_LABELS, type Role } from "@/lib/constants";
import { arabicError } from "@/lib/error-messages-ar";

const ORDER: Role[] = ["admin", "editor", "contributor", "reader"];

function consequences(from: Role, to: Role, assignmentCount: number): string[] {
  const lines = [ROLE_CAPABILITIES[to]];
  if (to === "reader" && assignmentCount > 0) {
    lines.push(`سيُزال من ${assignmentCount} ${assignmentCount === 1 ? "عمل معيّن" : "أعمال معيّنة"} نهائيًا، ولن تعود التعيينات تلقائيًا إذا رُقّي لاحقًا.`);
  } else if (to === "reader") {
    lines.push("سيفقد الوصول إلى لوحة الفريق.");
  }
  if (from === "editor" && to !== "editor") lines.push("ستُسحب منه صلاحيات النشر في كل الأعمال.");
  if (to === "admin") lines.push("سيتمكن من تغيير أدوار الآخرين، ومنهم أنت.");
  lines.push("سيُطلب منه تسجيل الدخول من جديد.");
  return lines;
}

/** Admin-only role switcher with an explicit confirmation step; the admin cannot demote themselves. */
export function RoleSelect({ profileId, role, isSelf, assignmentCount = 0 }: { profileId: string; role: Role; isSelf: boolean; assignmentCount?: number }) {
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const confirm = () => {
    if (!pendingRole) return;
    const next = pendingRole;
    setError("");
    startTransition(async () => {
      const res = await setUserRole(profileId, next);
      if (!res.ok) {
        setError(arabicError(res.error, "تعذّر تغيير الدور."));
        setPendingRole(null);
        return;
      }
      setPendingRole(null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        value={pendingRole ?? role}
        onValueChange={(v) => { setError(""); setPendingRole(v === role ? null : (v as Role)); }}
        disabled={pending || isSelf}
      >
        <SelectTrigger className="h-11 w-28 text-xs" aria-label={`الدور: ${ROLE_LABELS[pendingRole ?? role]}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORDER.map((r) => (
            <SelectItem key={r} value={r} disabled={isSelf && r !== "admin"}>
              {ROLE_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isSelf && <span className="text-[10px] text-muted-foreground">حسابك الحالي</span>}
      {pendingRole && (
        <div role="alertdialog" aria-label="تأكيد تغيير الدور" className="mt-1 w-64 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-start text-xs">
          <p className="font-semibold">تغيير الدور من «{ROLE_LABELS[role]}» إلى «{ROLE_LABELS[pendingRole]}»؟</p>
          <ul className="mt-1.5 list-disc space-y-1 ps-4 text-[11px] leading-5 text-muted-foreground">
            {consequences(role, pendingRole, assignmentCount).map((line) => <li key={line}>{line}</li>)}
          </ul>
          <div className="mt-2 flex gap-1.5">
            <Button type="button" size="sm" disabled={pending} onClick={confirm} className="h-9 px-3 text-[11px]">نعم، غيّر الدور</Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setPendingRole(null)} className="h-9 px-2 text-[11px]">إلغاء</Button>
          </div>
        </div>
      )}
      {error && <span role="alert" className="max-w-64 text-[11px] text-danger">{error}</span>}
    </div>
  );
}
