import { Suspense } from "react";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/accounts/forgot-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "استعادة كلمة المرور — مكتبة بانيورا",
};

export default function ForgotPasswordPage() {
  return (
    <main className="bg-library-glow flex min-h-screen items-center justify-center px-4 py-10">
      <Suspense fallback={<div className="size-9 animate-pulse rounded-full bg-accent" />}>
        <ForgotPasswordForm />
      </Suspense>
    </main>
  );
}
