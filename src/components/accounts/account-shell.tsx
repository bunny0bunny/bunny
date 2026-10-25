import Link from "next/link";
import { BrandMark } from "@/components/library/brand-mark";

export function AccountShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card/90 p-6 shadow-xl sm:p-8">
      <div className="mb-6 text-center">
        <Link
          href="/"
          className="mx-auto inline-flex min-h-11 items-center justify-center rounded-xl p-1 transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="مكتبة بانيورا — الصفحة الرئيسية"
        >
          <BrandMark className="size-16" alt="مكتبة بانيورا" resolution={256} />
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
        )}
      </div>

      {children}

      {footer && <div className="mt-6 border-t border-border/50 pt-5 text-center text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}
