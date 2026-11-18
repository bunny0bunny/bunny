"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  UsersRound,
  UserPlus,
  Mail,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  RotateCcw,
  Loader2,
  MailCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoleSelect } from "@/components/admin/role-select";
import { AccountAvatar } from "@/components/accounts/account-avatar";
import { ROLE_CAPABILITIES, ROLE_LABELS, type Role } from "@/lib/constants";
import { arabicError } from "@/lib/error-messages-ar";
import {
  createTeamInvitation,
  cancelTeamInvitation,
  setAccountEnabled,
} from "@/lib/account-actions";

export type AdminUserItem = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  avatarSeed?: string | null;
  createdAt: string;
  emailVerifiedAt?: string | null;
  disabledAt?: string | null;
  _count: {
    libraryItems: number;
    comments: number;
    readingProgress: number;
    assignments?: number;
  };
};

export type AdminInvitationItem = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  status: "pending" | "consumed" | "expired" | "revoked";
};

const ROLE_BADGE: Record<string, string> = {
  admin: "border-primary/40 bg-primary/10 text-primary",
  editor: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  contributor: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  reader: "border-border bg-secondary text-muted-foreground",
};

const INVITATION_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "بانتظار القبول", className: "border-primary/40 bg-primary/10 text-primary" },
  consumed: { label: "مقبولة", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  expired: { label: "منتهية", className: "border-border bg-secondary text-muted-foreground" },
  revoked: { label: "ملغاة", className: "border-danger/40 bg-danger/10 text-danger" },
};

export function AdminUsersView({
  users,
  invitations,
  currentAdminId,
  isLocalMailboxAvailable,
}: {
  users: AdminUserItem[];
  invitations: AdminInvitationItem[];
  currentAdminId: string;
  isLocalMailboxAvailable: boolean;
}) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"contributor" | "editor" | "admin">("contributor");
  const [inviteMsg, setInviteMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [confirmDisableId, setConfirmDisableId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCreateInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteMsg(null);

    const emailToUse = inviteEmail.trim().toLowerCase();
    if (!emailToUse) return;

    startTransition(async () => {
      const res = await createTeamInvitation({
        email: emailToUse,
        role: inviteRole,
      });

      if (!res.ok) {
        setInviteMsg({
          type: "error",
          text: arabicError(res.error, "تعذّر إرسال الدعوة. يرجى مراجعة البيانات والمحاولة لاحقًا."),
        });
        return;
      }

      setInviteMsg({
        type: "success",
        text: "تم إرسال دعوة الانضمام بنجاح (صلاحيتها ٧ أيام).",
      });
      setInviteEmail("");
      router.refresh();
    });
  };

  const handleCancelInvite = (invitationId: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await cancelTeamInvitation({ invitationId });
      if (!res.ok) {
        setActionError(arabicError(res.error, "تعذّر إلغاء الدعوة."));
        return;
      }
      router.refresh();
    });
  };

  const handleToggleEnabled = (profileId: string, currentDisabled: boolean) => {
    setActionError(null);
    setConfirmDisableId(null);

    startTransition(async () => {
      const res = await setAccountEnabled({
        profileId,
        enabled: currentDisabled, // if currently disabled, we enable it; if enabled, we disable it
      });

      if (!res.ok) {
        setActionError(arabicError(res.error, "تعذّر تغيير حالة الحساب."));
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      {/* Header controls & mailbox link if local */}
      {isLocalMailboxAvailable && (
        <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <div className="flex items-center gap-3">
            <Mail className="size-5 text-primary" aria-hidden />
            <div>
              <p className="text-xs font-bold text-foreground">صندوق البريد التجريبي المحلي نشط</p>
              <p className="text-[11px] text-muted-foreground">
                في بيئة المعاينة المحلية، تُلتقط الرسائل محليًا ولا تُرسل لخدمات البريد الخارجية.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="h-11 border-primary/40 bg-card text-xs font-semibold text-primary">
            <a href="/admin/mailbox">فتح صندوق البريد المحلي</a>
          </Button>
        </div>
      )}

      {actionError && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          {actionError}
        </p>
      )}

      {/* Staff Invitation Card */}
      <section aria-labelledby="invite-section-title" className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs">
        <div className="mb-4">
          <h2 id="invite-section-title" className="flex items-center gap-2 text-base font-bold text-foreground">
            <UserPlus className="size-5 text-primary" aria-hidden />
            دعوة عضو جديد لفريق العمل
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            تقتصر الدعوات على أدوار الفريق (مساهم، محرر، مدير). يتلقى المدعو رابطًا آمنًا لتعيين حسابه أو ترقية حسابه القائم.
          </p>
        </div>

        <form onSubmit={handleCreateInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="invite-email" className="text-xs">البريد الإلكتروني للعضو</Label>
            <Input
              id="invite-email"
              type="email"
              dir="ltr"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              className="h-11 bg-background text-left text-xs"
              required
            />
          </div>

          <div className="w-full sm:w-40 space-y-1.5">
            <Label htmlFor="invite-role" className="text-xs">الدور الممنوح</Label>
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "contributor" | "editor" | "admin")}>
              <SelectTrigger id="invite-role" className="h-11 bg-background text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contributor">مساهم</SelectItem>
                <SelectItem value="editor">محرر</SelectItem>
                <SelectItem value="admin">مدير</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-5 text-muted-foreground">{ROLE_CAPABILITIES[inviteRole]}</p>
          </div>

          <Button
            type="submit"
            disabled={isPending || !inviteEmail.trim()}
            className="h-11 gap-2 bg-primary font-bold text-primary-foreground hover:bg-primary/90"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MailCheck className="size-4" aria-hidden />}
            إرسال الدعوة
          </Button>
        </form>

        {inviteMsg && (
          <p
            role="status"
            className={`mt-3 rounded-xl border p-3 text-xs ${
              inviteMsg.type === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-danger/40 bg-danger/10 text-danger"
            }`}
          >
            {inviteMsg.text}
          </p>
        )}
      </section>

      {/* Invitations History / Pending */}
      {invitations.length > 0 && (
        <section aria-labelledby="invitations-history-title" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="invitations-history-title" className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              سجل دعوات الفريق ({invitations.length})
            </h2>
          </div>

          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">
            {invitations.map((inv) => {
              const statusCfg = INVITATION_STATUS_BADGE[inv.status] ?? INVITATION_STATUS_BADGE.pending;
              const roleLabel = ROLE_LABELS[inv.role as Role] ?? inv.role;

              return (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-foreground" dir="ltr">
                        {inv.email}
                      </span>
                      <Badge variant="secondary" className="border-border text-[10px]">
                        {roleLabel}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${statusCfg.className}`}>
                        {statusCfg.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      تنتهي: {new Date(inv.expiresAt).toLocaleDateString("ar-EG")}
                    </p>
                  </div>

                  {inv.status === "pending" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => handleCancelInvite(inv.id)}
                      className="h-9 text-xs text-danger hover:bg-danger/10 hover:text-danger"
                    >
                      إلغاء الدعوة
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Accounts List */}
      <section aria-labelledby="users-list-title" className="space-y-3">
        <h2 id="users-list-title" className="flex items-center gap-2 text-sm font-bold text-foreground">
          <UsersRound className="size-4 text-muted-foreground" aria-hidden />
          الحسابات المسجلة ({users.length})
        </h2>

        <ul className="space-y-3">
          {users.map((u) => {
            const isSelf = u.id === currentAdminId;
            const isDisabled = Boolean(u.disabledAt);
            const isVerified = Boolean(u.emailVerifiedAt);

            return (
              <li
                key={u.id}
                className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                  isDisabled
                    ? "border-danger/30 bg-card/60 opacity-80"
                    : "border-border/70 bg-card"
                }`}
              >
                <div className="flex items-center gap-3">
                  <AccountAvatar
                    seed={u.avatarSeed}
                    name={u.nickname}
                    className="size-11 border border-border"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{u.nickname}</span>
                      <Badge variant="secondary" className={ROLE_BADGE[u.role] ?? ""}>
                        {ROLE_LABELS[u.role as Role] ?? u.role}
                      </Badge>
                      {isDisabled ? (
                        <Badge variant="destructive" className="gap-1 text-[10px]">
                          <Ban className="size-3" aria-hidden />
                          معطّل
                        </Badge>
                      ) : isVerified ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                          <CheckCircle2 className="size-3 me-1" aria-hidden />
                          مفعّل
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px]">
                          <Clock className="size-3 me-1" aria-hidden />
                          بانتظار التأكيد
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground font-mono" dir="ltr">
                      {u.email}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {u._count.libraryItems} في المكتبة · {u._count.comments} تعليق · {u._count.readingProgress} تقدم قراءة
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 self-end sm:self-auto">
                  {/* Role select */}
                  <RoleSelect profileId={u.id} role={u.role as Role} isSelf={isSelf} assignmentCount={u._count?.assignments ?? 0} />

                  {/* Disable / Enable Action */}
                  {isSelf ? (
                    <span className="text-[10px] text-muted-foreground">لا يمكن تعطيل حسابك</span>
                  ) : isDisabled ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handleToggleEnabled(u.id, true)}
                      className="h-8 gap-1.5 border-emerald-500/40 text-xs text-emerald-400 hover:bg-emerald-500/10"
                    >
                      <RotateCcw className="size-3" aria-hidden />
                      إعادة التفعيل
                    </Button>
                  ) : confirmDisableId === u.id ? (
                    <div className="flex items-center gap-1.5 rounded-xl border border-danger/40 bg-danger/10 p-1.5 text-xs">
                      <span className="text-[10px] text-danger font-semibold">تأكيد التعطيل؟</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => handleToggleEnabled(u.id, false)}
                        className="h-7 px-2 text-[11px]"
                      >
                        نعم، تعطيل
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDisableId(null)}
                        className="h-7 px-1.5 text-[11px]"
                      >
                        إلغاء
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDisableId(u.id)}
                      className="h-8 gap-1.5 text-xs text-danger hover:bg-danger/10 hover:text-danger"
                    >
                      <Ban className="size-3" aria-hidden />
                      تعطيل الحساب
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
