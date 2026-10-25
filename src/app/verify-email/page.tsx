import { Suspense } from "react";
import type { Metadata } from "next";
import { VerifyEmailContent } from "@/components/accounts/verify-email-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تأكيد البريد الإلكتروني — مكتبة بانيورا",
};

export default function VerifyEmailPage() {
  return (
    <main className="bg-library-glow flex min-h-screen items-center justify-center px-4 py-10">
      <Suspense fallback={<div className="size-9 animate-pulse rounded-full bg-accent" />}>
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
