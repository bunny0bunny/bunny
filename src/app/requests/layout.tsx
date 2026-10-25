import { SiteHeader, SiteFooter, BottomNav } from "@/components/library/chrome";
export const dynamic = "force-dynamic";
export const metadata = { title: "طلبات الأعمال — مكتبة بانيورا", robots: { index: false, follow: false } };
export default function RequestsLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-background text-foreground"><SiteHeader /><main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 pb-24 sm:px-6">{children}</main><SiteFooter /><BottomNav /></div>;
}
