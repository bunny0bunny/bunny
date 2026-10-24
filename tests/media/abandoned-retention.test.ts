import { beforeEach, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
mock.module("../../src/lib/editorial", () => ({ withSerializableTx: () => { throw Error("unused"); }, checkStaffSeriesAccess: () => false }));
const now = new Date("2026-10-10");
function fixture() { return { id: "upload1", chapterId: "chapter1", state: "failed", expectedPages: 1, expiresAt: new Date("2026-10-08"), sourceSha256: "a".repeat(64), processingProfile: "balanced-v1" }; }
function assetFixture() { return { id: "asset1", uploadId: "upload1", chapterId: "chapter1", pageIndex: 0, objectKey: "media/test/upload1/asset1.webp", mime: "image/webp", createdAt: new Date("2026-10-08") }; }
let upload = fixture(), asset = assetFixture();
let currentRef = false, historicRef = false, coverRef = false, lockFails = false, storageFails = false, records = 1, detached = 0;
let storagePending: Promise<void> | undefined;
const deletes: string[] = [], locks: string[] = [];
const tx = {
  $executeRawUnsafe: async (sql: string) => { locks.push(sql); if (lockFails) throw Error("lock timeout"); },
  $queryRaw: async () => [{ retained: currentRef || historicRef || coverRef }],
  mediaAsset: { findUnique: async () => records ? asset : null, delete: async () => { records--; } },
  chapterUpload: { findUnique: async () => upload, update: async ({ data }: { data: object }) => { Object.assign(upload, data); } },
  chapterRevision: { count: async () => historicRef ? 1 : 0, updateMany: async () => { if (!detached) detached++; return { count: 1 }; } },
  chapterPage: { count: async () => currentRef ? 1 : 0 },
  series: { count: async () => coverRef ? 1 : 0 },
};
const db = {
  mediaAsset: { findMany: async ({ take }: { take: number }) => { expect(take).toBeLessThanOrEqual(3); return [{ id: asset.id }]; } },
  $transaction: async (work: (port: typeof tx) => Promise<unknown>) => work(tx),
};
mock.module("../../src/lib/db", () => ({ db }));
mock.module("../../src/lib/media/storage", () => ({ validateMediaKey: () => {}, getMediaStorage: async () => ({ deleteObject: async (key: string) => { deletes.push(key); if (asset.pageIndex >= -1) { expect(upload.state).toBe("cancelled"); expect(detached).toBe(1); } if (storageFails) throw Error("R2"); await storagePending; } }) }));
const retention = await import("../../src/lib/media/source-retention");
beforeEach(() => { upload = fixture(); asset = assetFixture(); currentRef = historicRef = coverRef = lockFails = storageFails = false; storagePending = undefined; records = 1; detached = 0; deletes.length = locks.length = 0; process.env.MEDIA_STORAGE_PREFIX = "test"; process.env.MEDIA_UPLOADS_ENABLED = "1"; });
test("new expired unreferenced objects are fenced before source storage deletion", async () => {
  expect(await retention.maintainAbandonedUploads({ now })).toEqual({ examined: 1, deleted: 1, skipped: 0, failed: 0 });
  expect(deletes).toEqual([asset.objectKey]); expect(records).toBe(0);
  expect(locks.some(sql => sql.includes('"Series"'))).toBe(true); expect(locks.some(sql => sql.includes("1500ms"))).toBe(true);
});
test("current pages, all historical revisions, and covers are protected", async () => {
  for (const type of ["current", "historic", "cover"]) {
    currentRef = type === "current"; historicRef = type === "historic"; coverRef = type === "cover";
    expect((await retention.maintainAbandonedUploads({ now })).skipped).toBe(1);
  }
  expect(deletes).toEqual([]); expect(records).toBe(1); expect(detached).toBe(0);
});
test("legacy, ready, young uploads, in-flight and future pages cannot be removed", async () => {
  for (const change of [{ sourceSha256: "" }, { processingProfile: "" }, { state: "ready" }, { expiresAt: now }]) {
    upload = Object.assign(fixture(), change); expect((await retention.maintainAbandonedUploads({ now })).skipped).toBe(1);
  }
  upload = fixture(); asset.createdAt = now; expect((await retention.maintainAbandonedUploads({ now })).skipped).toBe(1);
  asset = assetFixture(); asset.pageIndex = 1; expect((await retention.maintainAbandonedUploads({ now })).skipped).toBe(1);
  expect(deletes).toEqual([]);
});
test("lock failures and R2 failures retain metadata and fail closed", async () => {
  lockFails = true; expect((await retention.maintainAbandonedUploads({ now })).failed).toBe(1); expect(deletes).toEqual([]); expect(detached).toBe(0);
  lockFails = false; storageFails = true; expect((await retention.maintainAbandonedUploads({ now })).failed).toBe(1); expect(records).toBe(1); expect(upload.state).toBe("cancelled");
  storageFails = false; expect((await retention.maintainAbandonedUploads({ now })).deleted).toBe(1); expect(records).toBe(0);
});
test("storage timeout preserves a committed fence and metadata even after late completion", async () => {
  let finish!: () => void;
  storagePending = new Promise<void>(resolve => { finish = resolve; });
  expect((await retention.maintainAbandonedUploads({ now })).failed).toBe(1);
  expect(upload.state).toBe("cancelled"); expect(detached).toBe(1); expect(records).toBe(1);
  finish(); await Promise.resolve(); expect(records).toBe(1);
  storagePending = undefined;
  expect((await retention.maintainAbandonedUploads({ now })).deleted).toBe(1);
}, 10000);
test("ready upload garbage at negative indices is removed without cancelling its source or pages", async () => {
  upload.state = "ready"; upload.expiresAt = new Date("2027-01-01"); asset.pageIndex = -2;
  expect((await retention.maintainAbandonedUploads({ now })).deleted).toBe(1);
  expect(records).toBe(0); expect(upload.state).toBe("ready"); expect(detached).toBe(0);
  records = 1; asset.pageIndex = 0;
  expect((await retention.maintainAbandonedUploads({ now })).skipped).toBe(1);
  asset.pageIndex = -1; asset.mime = "application/pdf"; asset.objectKey = "media/test/upload1/asset1.pdf";
  expect((await retention.maintainAbandonedUploads({ now })).skipped).toBe(1);
  expect(deletes).toEqual(["media/test/upload1/asset1.webp"]);
});
test("negative reservation garbage retains references and legacy assets; superseded uploads expire safely", async () => {
  upload.state = "ready"; asset.pageIndex = -2; historicRef = true;
  expect((await retention.maintainAbandonedUploads({ now })).skipped).toBe(1);
  historicRef = false; upload.sourceSha256 = "";
  expect((await retention.maintainAbandonedUploads({ now })).skipped).toBe(1);
  expect(deletes).toEqual([]);
  upload = fixture(); upload.state = "superseded"; asset = assetFixture();
  expect((await retention.maintainAbandonedUploads({ now })).deleted).toBe(1);
  expect(upload.state).toBe("cancelled");
});
