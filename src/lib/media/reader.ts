export type ReaderMediaAsset = { id: string; chapterId: string; objectKey: string; readyAt: Date | null; mime: string; pageIndex: number };
type Dependencies = { findAssets(ids: string[]): Promise<ReaderMediaAsset[]>; getStorage(): Promise<{ signGet(key: string, options?: { expiresIn?: number }): Promise<string> }> };
function assetId(imagePath: string): string | undefined {
  return /^\/api\/media\/([A-Za-z0-9][A-Za-z0-9-]{0,127})$/.exec(imagePath)?.[1];
}

/** Caller supplies pages from the currently published chapter, never a revision snapshot. */
export async function resolveReaderPageImages<T extends { imagePath: string }>(chapterId: string, pages: T[], dependencies: Dependencies): Promise<(T & { fallbackImagePath?: string })[]> {
  const ids = [...new Set(pages.flatMap(page => { const id = assetId(page.imagePath); return id ? [id] : []; }))];
  if (!ids.length) return pages;
  const requested = new Set(ids);
  const assets = (await dependencies.findAssets(ids)).filter(asset => requested.has(asset.id)
    && asset.chapterId === chapterId && asset.readyAt !== null && asset.pageIndex >= 0
    && (asset.mime === "image/webp" || asset.mime === "image/jpeg"));
  if (!assets.length) return pages;
  let storage: Awaited<ReturnType<Dependencies["getStorage"]>>;
  try { storage = await dependencies.getStorage(); }
  catch { return pages; } // The authorized gateway remains available for image retries.
  const signed = new Map<string, string>();
  await Promise.all(assets.map(async asset => {
    try { signed.set(asset.id, await storage.signGet(asset.objectKey, { expiresIn: 3600 })); }
    catch { /* Leave this image on its stable authorized gateway. */ }
  }));
  return pages.map(page => {
    const id = assetId(page.imagePath);
    const imagePath = id ? signed.get(id) : undefined;
    return imagePath ? { ...page, imagePath, fallbackImagePath: page.imagePath } : page;
  });
}
