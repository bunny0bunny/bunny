import Link from "next/link";
import { BookX } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Nonce-based CSP (src/middleware.ts) requires dynamically rendered documents;
 * a prerendered 404 HTML cannot carry the per-request nonce. If Next.js does
 * not honor this export for not-found, the middleware QA (scripts/qa-nonce-csp.sh)
 * will show zero nonced scripts on 404s — escalate to a dynamic catch-all route.
 */
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <main className="bg-library-glow flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl border border-border bg-card text-muted-foreground">
        <BookX className="size-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-foreground">هذا الرفّ فارغ</h1>
      <p className="mt-2 max-w-sm text-sm leading-7 text-muted-foreground">
        الصفحة التي تبحث عنها غير موجودة — ربما انتقل العمل إلى رفٍّ آخر، أو أن الرابط القديم لم يعد صالحًا.
      </p>
      <div className="mt-6 flex gap-2.5">
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href="/">الرئيسية</Link>
        </Button>
        <Button asChild variant="outline" className="border-border">
          <Link href="/explore">استكشف المكتبة</Link>
        </Button>
      </div>
    </main>
  );
}
