import { db } from "@/lib/db";
import { withSerializableTx, checkStaffSeriesAccess } from "@/lib/editorial";
import { getMediaStorage } from "@/lib/media/storage";
import { uploadResponse } from "@/lib/media/uploads";

export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  if (!/^[a-z0-9]+$/.test(assetId)) return uploadResponse({ ok: false, error: "not_found" });
  try {
    const asset = await db.mediaAsset.findUnique({ where: { id: assetId }, include: { chapter: true, upload: true } });
    if (!asset?.readyAt || asset.pageIndex < -1) return uploadResponse({ ok: false, error: "not_found" });
    let authorized = false;
    // Public access follows current projection membership, never historical snapshots.
    if (asset.pageIndex >= 0 && !asset.chapter.isPremiumDemo && asset.chapter.workflow === "published" && (!asset.chapter.scheduledFor || asset.chapter.scheduledFor <= new Date())) {
      authorized = Boolean(await db.chapterPage.findFirst({ where: { chapterId: asset.chapterId, imagePath: `/api/media/${asset.id}`, chapter: { workflow: "published", isPremiumDemo: false, OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }] } }, select: { id: true } }));
    }
    if (!authorized) {
      const result = await withSerializableTx(async (tx, actor) => {
        const current = await tx.mediaAsset.findUnique({ where: { id: assetId }, include: { chapter: true } });
        return { ok: Boolean(current?.readyAt && await checkStaffSeriesAccess(tx, actor, current.chapter.seriesId)) };
      }, { invalidate: false });
      if (!result.ok) return uploadResponse({ ok: false, error: "forbidden" });
    }
    const url = await (await getMediaStorage()).signGet(asset.objectKey, { expiresIn: 3600, ...(asset.pageIndex === -1 ? { downloadName: asset.upload.sourceName } : {}) });
    return new Response(null, { status: 307, headers: { Location: url, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...(asset.pageIndex === -1 ? { "Content-Disposition": "attachment" } : {}) } });
  } catch { return uploadResponse({ ok: false, error: "unavailable" }); }
}
