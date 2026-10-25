"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, UserPlus, Eye, EyeOff, CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeAccountDestination } from "@/lib/account-destination";
import { registerReader, resendVerification } from "@/lib/account-actions";
import { AccountShell } from "@/components/accounts/account-shell";

export function RegisterForm() {
  const params = useSearchParams();
  const rawTarget = params.get("next");
  const targetNext = safeAccountDestination(rawTarget, "/");

  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRegister = (e: React.FormEvent) => {
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
      const res = await registerReader({
        email: email.trim().toLowerCase(),
        nickname: nickname.trim(),
        password,
        next: targetNext,
      });

      if (!res.ok) {
        setError(res.error ?? "تعذّر إتمام التسجيل. يرجى مراجعة البيانات والمحاولة لاحقًا.");
        return;
      }

      setRegisteredEmail(email.trim().toLowerCase());
    });
  };

  const handleResend = () => {
    if (!registeredEmail) return;
    setResendStatus(null);
    startTransition(async () => {
      const res = await resendVerification({
        email: registeredEmail,
        next: targetNext,
      });

      if (res.ok) {
        setResendStatus(res.message ?? "إذا كان الحساب بانتظار التأكيد، ستصلك رسالة جديدة.");
      } else {
        setResendStatus(res.error ?? "تعذّر إرسال رابط التأكيد حاليًا.");
      }
    });
  };

  const loginHref = `/login?next=${encodeURIComponent(targetNext)}`;

  if (registeredEmail) {
    return (
      <AccountShell
        title="تأكيد البريد الإلكتروني"
        description="خطوة واحدة تفصلك عن تفعيل حسابك ومزامنة قراءتك."
        footer={
          <div className="space-y-3">
            <p>
              <Link href={loginHref} className="font-semibold text-primary hover:underline">
                الانتقال إلى صفحة تسجيل الدخول
              </Link>
            </p>
            <p>
              <Link href="/" className="text-muted-foreground transition hover:text-foreground">
                تصفح المكتبة كزائر
              </Link>
            </p>
          </div>
        }
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="size-6" aria-hidden />
          </div>

          <div className="rounded-xl border border-border/80 bg-secondary/30 p-4 text-xs leading-6 text-foreground/90">
            <p>
              إذا كان البريد متاحًا للتسجيل، ستصلك رسالة تأكيد على:
            </p>
            <p className="font-mono font-bold text-foreground" dir="ltr">
              {registeredEmail}
            </p>
            <p className="mt-2 text-muted-foreground">
              يرجى فتح الرابط المرفق بالرسالة لتأكيد الحساب ثم تسجيل الدخول. صلاحية الرابط ٢٤ ساعة.
            </p>
          </div>

          {resendStatus && (
            <p
              role="status"
              className="rounded-lg border border-border bg-card p-2 text-xs text-muted-foreground"
            >
              {resendStatus}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={handleResend}
            className="h-11 w-full gap-2 border-border"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />}
            إعادة إرسال رسالة التأكيد
          </Button>
        </div>
      </AccountShell>
    );
  }

  return (
    <AccountShell
      title="إنشاء حساب قارئ"
      description="أنشئ حسابك لحفظ أعمالك المفضلة ومتابعة قراءتك عبر أجهزتك."
      footer={
        <div className="space-y-3">
          <p>
            لديك حساب بالفعل؟{" "}
            <Link href={loginHref} className="font-semibold text-primary hover:underline">
              تسجيل الدخول
            </Link>
          </p>
          <p>
            <Link href="/" className="text-muted-foreground transition hover:text-foreground">
              تصفح كزائر دون تسجيل
            </Link>
          </p>
        </div>
      }
    >
      <form onSubmit={handleRegister} className="space-y-4" aria-label="نموذج إنشاء حساب">
        <div className="space-y-1.5">
          <Label htmlFor="reg-email">البريد الإلكتروني</Label>
          <Input
            id="reg-email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="reader@example.com"
            className="h-11 bg-card text-left"
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-name">الاسم الظاهر</Label>
          <Input
            id="reg-name"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="مثال: قارئ بانيورا"
            className="h-11 bg-card"
            autoComplete="nickname"
            minLength={2}
            maxLength={40}
            required
          />
          <p className="text-[11px] text-muted-foreground">بين حرفين و٤٠ حرفًا، يظهر في التعليقات ونشاط القراءة.</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="reg-password">كلمة المرور</Label>
            <span className="text-[11px] text-muted-foreground">١٢ حرفًا على الأقل</span>
          </div>
          <div className="relative">
            <Input
              id="reg-password"
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
          <Label htmlFor="reg-confirm">تأكيد كلمة المرور</Label>
          <Input
            id="reg-confirm"
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
          {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
          إنشاء الحساب
        </Button>
      </form>
    </AccountShell>
  );
}
