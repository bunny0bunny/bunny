import { expect, test } from "bun:test";
import { resolveReaderPageImages, type ReaderMediaAsset } from "../../src/lib/media/reader";

const page = { id: "page1", imagePath: "/api/media/asset1", pageIndex: 0, width: 1440, height: 2160 };
const asset: ReaderMediaAsset = { id: "asset1", chapterId: "chapter1", objectKey: "media/test/upload1/asset1.webp", readyAt: new Date(), mime: "image/webp", pageIndex: 0 };
function fixture(assets: ReaderMediaAsset[]) {
  const lookedUp: string[][] = [];
  const signed: string[] = [];
  let initialized = 0;
  return {
    lookedUp, signed, initialized: () => initialized,
    dependencies: {
      async findAssets(ids: string[]) { lookedUp.push(ids); return assets; },
      async getStorage() {
        initialized++;
        return { async signGet(key: string, options?: { expiresIn?: number }) { signed.push(key); expect(options?.expiresIn).toBe(3600); return "https://r2.example/signed"; } };
      },
    },
  };
}
test("legacy pages preserve their values and avoid media queries/storage initialization", async () => {
  const legacy = { ...page, imagePath: "/series/book/page.jpg" };
  const setup = fixture([]);
  const result = await resolveReaderPageImages("chapter1", [legacy], setup.dependencies);
  expect(result[0]).toBe(legacy);
  expect(setup.lookedUp).toEqual([]);
  expect(setup.initialized()).toBe(0);
});
test("batch-resolves current ready pages once and retains stable fallback and dimensions", async () => {
  const setup = fixture([asset]);
  const result = await resolveReaderPageImages("chapter1", [page, { ...page, id: "page2" }], setup.dependencies);
  expect(setup.lookedUp).toEqual([["asset1"]]);
  expect(setup.initialized()).toBe(1);
  expect(setup.signed).toEqual([asset.objectKey]);
  expect(result[0]).toEqual({ ...page, imagePath: "https://r2.example/signed", fallbackImagePath: page.imagePath });
});
test("missing, foreign-chapter, not-ready, original and non-image assets are never signed", async () => {
  for (const assets of [[], [{ ...asset, chapterId: "foreign" }], [{ ...asset, readyAt: null }], [{ ...asset, pageIndex: -1 }], [{ ...asset, mime: "application/pdf" }], [{ ...asset, id: "unreferenced" }]]) {
    const setup = fixture(assets);
    expect((await resolveReaderPageImages("chapter1", [page], setup.dependencies))[0]).toBe(page);
    expect(setup.signed).toEqual([]);
    expect(setup.initialized()).toBe(0);
  }
});
test("published current membership remains readable after its upload state changes", async () => {
  const setup = fixture([{ ...asset, upload: { state: "superseded" } } as ReaderMediaAsset]);
  expect((await resolveReaderPageImages("chapter1", [page], setup.dependencies))[0].imagePath).toBe("https://r2.example/signed");
});
test("malformed and external lookalike gateway paths are not resolved", async () => {
  const setup = fixture([asset]);
  const pages = ["https://example.com/api/media/asset1", "/api/media/asset1?extra=1", "/api/media/../asset1", "/api/media/%2e%2e"].map(imagePath => ({ ...page, imagePath }));
  expect(await resolveReaderPageImages("chapter1", pages, setup.dependencies)).toEqual(pages);
  expect(setup.lookedUp).toEqual([]);
});
test("signing failure preserves the authorized gateway for ordinary image retry", async () => {
  const setup = fixture([asset]);
  const result = await resolveReaderPageImages("chapter1", [page], {
    ...setup.dependencies,
    async getStorage() { return { async signGet() { throw new Error("signer unavailable"); } }; },
  });
  expect(result[0]).toBe(page);
});
