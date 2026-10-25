import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/accounts/reset-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تعيين كلمة المرور — مكتبة بانيورا",
};

export default function ResetPasswordPage() {
  return (
    <main className="bg-library-glow flex min-h-screen items-center justify-center px-4 py-10">
      <Suspense fallback={<div className="size-9 animate-pulse rounded-full bg-accent" />}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
