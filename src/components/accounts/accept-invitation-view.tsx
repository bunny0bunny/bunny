"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { Loader2, ShieldCheck, UserCheck, Eye, EyeOff, AlertTriangle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { acceptTeamInvitation } from "@/lib/account-actions";
import { AccountShell } from "@/components/accounts/account-shell";

export type InvitationData = {
  token: string;
  email: string;
  role: string;
  existingAccount: boolean;
};

export function AcceptInvitationView({
  invitation,
  currentSession,
}: {
  invitation: InvitationData | null;
  currentSession: { id: string; email?: string | null; name?: string | null } | null;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!invitation) {
    return (
      <AccountShell
        title="دعوة غير صالحة"
        description="رابط الدعوة غير صالح أو منتهي الصلاحية أو تم استخدامه مسبقًا."
        footer={
          <p>
            <Link href="/" className="text-muted-foreground transition hover:text-foreground">
              العودة للصفحة الرئيسية
            </Link>
          </p>
        }
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <AlertTriangle className="size-6" aria-hidden />
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            تنتهي صلاحية دعوات الفريق بعد ٧ أيام من إرسالها. يرجى التواصل مع مدير الموقع للحصول على دعوة جديدة.
          </p>

          <Button asChild className="h-11 w-full bg-primary font-bold text-primary-foreground hover:bg-primary/90">
            <Link href="/login">
              الانتقال لتسجيل الدخول
            </Link>
          </Button>
        </div>
      </AccountShell>
    );
  }

  const roleName = ROLE_LABELS[invitation.role as Role] ?? invitation.role;
  const isMatchingUser =
    Boolean(currentSession?.id) &&
    currentSession?.email?.toLowerCase() === invitation.email.toLowerCase();
  const isMismatchedUser =
    Boolean(currentSession?.id) && !isMatchingUser;

  const handleAcceptMatching = () => {
    setError(null);
    startTransition(async () => {
      const res = await acceptTeamInvitation({ token: invitation.token });
      if (!res.ok) {
        setError(res.error ?? "تعذّر قبول الدعوة. يرجى المحاولة لاحقًا.");
        return;
      }
      setSuccessMsg("تم قبول الدعوة. سجّل الدخول مجددًا لتفعيل صلاحياتك الجديدة.");
      setTimeout(() => {
        router.push(res.next || "/studio");
        router.refresh();
      }, 1000);
    });
  };

  const handleRegisterAndAccept = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (nickname.trim().length < 2 || nickname.trim().length > 40) {
      setError("الاسم الظاهر يجب أن يكون بين حرفين و٤٠ حرفًا.");
      return;
    }

    if (password.length < 12 || password.length > 128) {
      setError("كلمة المرور يجب أن تكون بين ١٢ و١٢٨ حرفًا.");
      return;
    }

    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    startTransition(async () => {
      const res = await acceptTeamInvitation({
        token: invitation.token,
        nickname: nickname.trim(),
        password,
      });

      if (!res.ok) {
        setError(res.error ?? "تعذّر قبول الدعوة. يرجى مراجعة البيانات.");
        return;
      }

      setSuccessMsg("تم إنشاء حسابك وقبول الدعوة بنجاح! جاري تحويلك...");
      setTimeout(() => {
        router.push(res.next || "/login");
        router.refresh();
      }, 1200);
    });
  };

  const loginToAcceptUrl = `/login?next=${encodeURIComponent(`/accept-invitation?token=${invitation.token}`)}`;

  if (successMsg) {
    return (
      <AccountShell title="مرحبًا بك في الفريق">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <UserCheck className="size-8" aria-hidden />
          </div>
          <p className="text-sm font-semibold text-foreground">{successMsg}</p>
        </div>
      </AccountShell>
    );
  }

  return (
    <AccountShell
      title="دعوة للانضمام إلى الفريق"
      description={`تمت دعوتك للانضمام إلى فريق عمل مكتبة بانيورا بصلاحية «${roleName}».`}
      footer={
        <p>
          <Link href="/" className="text-muted-foreground transition hover:text-foreground">
            تصفح المكتبة كزائر
          </Link>
        </p>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-border/80 bg-secondary/30 p-3.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">البريد المدعو:</span>
            <span className="font-mono font-semibold text-foreground" dir="ltr">
              {invitation.email}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2">
            <span className="text-muted-foreground">الدور الممنوح:</span>
            <span className="font-bold text-primary">{roleName}</span>
          </div>
        </div>

        {invitation.existingAccount ? (
          <div className="space-y-4">
            {!currentSession?.id ? (
              <div className="space-y-3 text-center">
                <p className="text-xs leading-5 text-muted-foreground">
                  هذا البريد مسجّل مسبقًا في مكتبة بانيورا. يرجى تسجيل الدخول بحسابك لتأكيد قبول الدعوة ومنحك صلاحية «{roleName}».
                </p>
                <Button asChild className="h-11 w-full bg-primary font-bold text-primary-foreground hover:bg-primary/90">
                  <Link href={loginToAcceptUrl}>
                    تسجيل الدخول لقبول الدعوة
                  </Link>
                </Button>
              </div>
            ) : isMatchingUser ? (
              <div className="space-y-4">
                <p className="text-xs leading-5 text-muted-foreground">
                  أنت مسجل الدخول بهذا الحساب. انقر أدناه لتأكيد قبول دور «{roleName}» والبدء بالعمل.
                </p>

                {error && (
                  <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                    {error}
                  </p>
                )}

                <Button
                  type="button"
                  disabled={isPending}
                  onClick={handleAcceptMatching}
                  className="h-11 w-full gap-2 bg-primary font-bold text-primary-foreground hover:bg-primary/90"
                >
                  {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
                  تأكيد قبول الدعوة
                </Button>
              </div>
            ) : isMismatchedUser ? (
              <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs">
                <p className="text-foreground">
                  أنت مسجّل الدخول حاليًا بحساب (<span dir="ltr" className="font-mono">{currentSession.email}</span>) بينما الدعوة موجهة لـ (<span dir="ltr" className="font-mono">{invitation.email}</span>).
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => signOut({ callbackUrl: loginToAcceptUrl })}
                  className="h-11 w-full gap-2 border-border text-foreground"
                >
                  <LogOut className="size-4" aria-hidden />
                  تبديل الحساب وتسجيل الدخول بالبريد المدعو
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <form onSubmit={handleRegisterAndAccept} className="space-y-4" aria-label="نموذج تفعيل حساب الدعوة">
            <p className="text-xs leading-5 text-muted-foreground">
              أدخل اسمك الظاهر وكلمة المرور لإكمال إنشاء حسابك والانضمام للفريق.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="inv-name">الاسم الظاهر</Label>
              <Input
                id="inv-name"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="اسمك في الفريق"
                className="h-11 bg-card"
                autoComplete="nickname"
                minLength={2}
                maxLength={40}
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="inv-password">كلمة المرور</Label>
                <span className="text-[11px] text-muted-foreground">١٢ حرفًا على الأقل</span>
              </div>
              <div className="relative">
                <Input
                  id="inv-password"
                  type={showPassword ? "text" : "password"}
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="h-11 bg-card pe-10 text-left"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground transition hover:text-foreground"
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-confirm">تأكيد كلمة المرور</Label>
              <Input
                id="inv-confirm"
                type={showPassword ? "text" : "password"}
                dir="ltr"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="h-11 bg-card text-left"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className="h-11 w-full gap-2 bg-primary font-bold text-primary-foreground hover:bg-primary/90"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserCheck className="size-4" aria-hidden />}
              إنشاء الحساب وقبول الدعوة
            </Button>
          </form>
        )}
      </div>
    </AccountShell>
  );
}
