import Link from "next/link";
import { getWorkTitle } from '@/lib/work-title';
import { GalleryVerticalEnd, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole, getAdminCollections, getAdminSeries } from "@/lib/queries";
import { CollectionForm } from "@/components/admin/collection-form";
import { parseJsonArray } from "@/lib/queries";

export const dynamic = "force-dynamic";

const THEME_BADGE: Record<string, string> = {
  violet: "border-primary/40 bg-primary/10 text-primary",
  gold: "border-gold/40 bg-gold/10 text-gold",
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  rose: "border-rose-500/40 bg-rose-500/10 text-rose-400",
};

export default async function AdminCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireRole(["admin"]);
  const { edit } = await searchParams;
  const [collections, seriesRows] = await Promise.all([
    getAdminCollections(),
    getAdminSeries({}),
  ]);
  const seriesOptions = seriesRows.map((s) => ({ slug: s.slug, titleAr: getWorkTitle(s) }));
  const editing = edit ? collections.find((c) => c.id === edit) ?? null : null;

  return (
    <main className="mx-auto max-w-5xl p-4 pt-6 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <GalleryVerticalEnd className="size-6 text-primary" aria-hidden />
            المجموعات التحريرية
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تظهر المجموعات المميزة على الصفحة الرئيسية مباشرة بعد الحفظ.
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href="/admin/collections">
            <Plus className="size-4" /> مجموعة جديدة
          </Link>
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <ul className="space-y-3">
          {collections.map((c) => (
            <li key={c.id} className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{c.titleAr}</span>
                    <Badge variant="secondary" className={THEME_BADGE[c.theme] ?? ""}>
                      {c.theme}
                    </Badge>
                    {c.isFeatured && (
                      <Badge variant="secondary" className="border border-success/40 bg-success/10 text-success">
                        مميزة على الرئيسية
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">{c.descriptionAr}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {parseJsonArray(c.seriesSlugsJson).length} عمل · ترتيب {c.displayOrder} ·{" "}
                    <span dir="ltr">{c.slug}</span>
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 border-border text-xs">
                  <Link href={`/admin/collections?edit=${c.id}`}>
                    <Pencil className="size-3.5" /> تحرير
                  </Link>
                </Button>
              </div>
            </li>
          ))}
          {collections.length === 0 && (
            <li className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
              لا مجموعات بعد.
            </li>
          )}
        </ul>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <CollectionForm
            key={editing?.id ?? "new"}
            seriesOptions={seriesOptions}
            initial={
              editing
                ? {
                    id: editing.id,
                    slug: editing.slug,
                    titleAr: editing.titleAr,
                    descriptionAr: editing.descriptionAr,
                    theme: editing.theme as "violet",
                    displayOrder: editing.displayOrder,
                    isFeatured: editing.isFeatured,
                    seriesSlugs: parseJsonArray(editing.seriesSlugsJson),
                  }
                : null
            }
          />
        </aside>
      </div>
    </main>
  );
}
