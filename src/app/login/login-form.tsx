"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2, LogIn, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeAccountDestination } from "@/lib/account-destination";
import { AccountShell } from "@/components/accounts/account-shell";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  // Middleware sets callbackUrl; public links use next.
  const rawTarget = params.get("next") || params.get("callbackUrl");
  const targetNext = safeAccountDestination(rawTarget, "/");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResendPrompt, setShowResendPrompt] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    setShowResendPrompt(false);

    const res = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });
    setLoading(false);

    if (res?.error === "EMAIL_NOT_VERIFIED") {
      setError("بريدك لم يُفعَّل بعد. افتح رسالة التأكيد التي أرسلناها، أو اطلب رسالة جديدة.");
      setShowResendPrompt(true);
      return;
    }
    if (res?.error) {
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة، أو أن الحساب معطّل.");
      setShowResendPrompt(false);
      return;
    }

    // Always route via /welcome so server can check onboarding status safely
    const welcomeUrl = rawTarget ? `/welcome?next=${encodeURIComponent(targetNext)}` : "/welcome";
    router.push(welcomeUrl);
    router.refresh();
  }

  const registerHref = `/register?next=${encodeURIComponent(targetNext)}`;
  const forgotHref = `/forgot-password`;
  const resendParams = new URLSearchParams({ next: targetNext });
  if (email) resendParams.set("email", email);
  const resendHref = `/verify-email?${resendParams.toString()}`;

  return (
    <AccountShell
      title="تسجيل الدخول"
      description="سجّل الدخول لمزامنة تقدم قراءتك ومكتبتك عبر جميع أجهزتك."
      footer={
        <div className="space-y-3">
          <p>
            ليس لديك حساب؟{" "}
            <Link href={registerHref} className="font-semibold text-primary hover:underline">
              إنشاء حساب جديد
            </Link>
          </p>
          <p>
            <Link href="/" className="text-muted-foreground transition hover:text-foreground">
              تصفح كزائر دون تسجيل دخول
            </Link>
          </p>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4" aria-label="نموذج تسجيل الدخول">
        <div className="space-y-1.5">
          <Label htmlFor="login-email">البريد الإلكتروني</Label>
          <Input
            id="login-email"
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
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">كلمة المرور</Label>
            <Link href={forgotHref} className="text-[11px] text-primary hover:underline">
              نسيت كلمة المرور؟
            </Link>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="h-11 bg-card pe-10 text-left"
              autoComplete="current-password"
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

        {error && (
          <div role="alert" className="space-y-1.5 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
            <p>{error}</p>
            {showResendPrompt && (
              <p className="pt-1 text-[11px] text-foreground/80">
                لم تتلقَّ رسالة تأكيد الحساب؟{" "}
                <Link href={resendHref} className="font-semibold text-primary underline">
                  إعادة إرسال رابط التأكيد
                </Link>
              </p>
            )}
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full gap-2 bg-primary font-bold text-primary-foreground hover:bg-primary/90"
        >
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogIn className="size-4" aria-hidden />}
          تسجيل الدخول
        </Button>
      </form>
    </AccountShell>
  );
}
