"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureError } from "@/lib/analytics";

/**
 * Route-level error boundary (Release C). Arabic-first, on-brand, with retry.
 * Error reporting is a no-op placeholder today — one-step Sentry activation
 * documented in src/lib/analytics.ts.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { digest: error.digest ?? null });
  }, [error]);

  return (
    <main className="bg-library-glow flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      <span className="grid size-16 place-items-center rounded-2xl border border-border bg-card text-danger">
        <AlertTriangle className="size-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-foreground">انقطع الخيط مؤقتًا</h1>
      <p className="mt-2 max-w-sm text-sm leading-7 text-muted-foreground">
        تعذّر تجهيز الصفحة. جرّب إعادة المحاولة أو ارجع للرئيسية. لو استمر الخطأ، حاول لاحقًا.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground/70" dir="ltr">
          code: {error.digest}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <Button onClick={reset} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
          <RefreshCw className="size-4" aria-hidden />
          إعادة المحاولة
        </Button>
        <Button asChild variant="outline" className="border-border">
          <Link href="/" className="gap-2">
            <Home className="size-4" aria-hidden />
            الرئيسية
          </Link>
        </Button>
      </div>
    </main>
  );
}
