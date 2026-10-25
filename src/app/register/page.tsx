import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterForm } from "@/components/accounts/register-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "إنشاء حساب قارئ — مكتبة بانيورا",
};

export default function RegisterPage() {
  return (
    <main className="bg-library-glow flex min-h-screen items-center justify-center px-4 py-10">
      <Suspense fallback={<div className="size-9 animate-pulse rounded-full bg-accent" />}>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
