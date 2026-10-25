import { getSeriesBySlug } from "@/lib/queries";
import { DEFAULT_SHARE_CARD_PATH, resolveShareCardPath, toShareCardData } from "@/lib/share-card-data";
import manifest from "../../../../public/share/manifest.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "مكتبة بانيورا";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let series: Awaited<ReturnType<typeof getSeriesBySlug>> = null;
  try {
    series = await getSeriesBySlug(slug);
  } catch {
    // Preserve the brand-card fallback when the database is unavailable.
  }
  if (process.env.BUNNY_RUNTIME === "cloudflare") {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = getCloudflareContext();
    const assets = (env as unknown as { ASSETS: { fetch(request: Request): Promise<Response> } }).ASSETS;
    // Scheduled-only and draft-only works must never select a prepared series card.
    const assetPath = resolveShareCardPath(series?.publishedChapters.length ? slug : null, manifest);
    let response = await assets.fetch(new Request(new URL(assetPath, "https://assets.internal")));
    if (!response.ok && assetPath !== DEFAULT_SHARE_CARD_PATH) {
      response = await assets.fetch(new Request(new URL(DEFAULT_SHARE_CARD_PATH, "https://assets.internal")));
    }
    if (!response.ok) throw new Error("Prepared share card is unavailable");
    return new Response(response.body, {
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  } else {
    // Keep the renderer (including next/og and its WASM) outside the Worker graph.
    const { renderShareCard } = await import("@/lib/share-card-renderer");
    return renderShareCard(series ? toShareCardData(series) : null);
  }
}
