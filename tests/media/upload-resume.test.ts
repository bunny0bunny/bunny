import { beforeEach, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
let upload: any, writes: any[], actor: any, access: boolean, parts: any[], storageHash: string | undefined, retired: any[];
const tx: any = {
  chapterUpload: { findUnique: async () => upload, findMany: async () => [], count: async () => 0,
    update: async ({ data }: any) => { writes.push(data); Object.assign(upload, data); return upload; },
    create: async ({ data }: any) => { writes.push(data); return { ...data, id: "new" }; } },
  chapterRevision: { findFirst: async () => ({ id: upload.revisionId }), updateMany: async () => ({ count: 1 }), update: async ({ data }: any) => ({ ...upload.revision, version: upload.revision.version + 1, ...data }) },
  mediaAsset: { findMany: async () => parts, findUnique: async ({ where }: any) => where.id ? parts.find(p => p.id === where.id) ?? null : null, aggregate: async () => ({ _min: { pageIndex: -1 } }), updateMany: async ({ where, data }: any) => { retired.push(where.id); Object.assign(parts.find(p => p.id === where.id), data); return { count: 1 }; }, create: async ({ data }: any) => ({ ...data, id: "asset" }), update: async () => ({}) },
  accountRateLimit: { findUnique: async () => null, upsert: async () => ({}) },
  chapterEditorialEvent: { create: async () => ({}) },
};
mock.module("@/lib/db", () => ({ withDatabaseScope: async (work: any) => work() }));
mock.module("@/lib/editorial", () => ({
  withSerializableTx: async (work: any) => work(tx, actor),
  checkStaffSeriesAccess: async () => access,
  editableRevision: async () => ({ revision: { ...upload.revision, chapter: { series: { format: "manga" } } } }),
}));
mock.module("@/lib/account-mail", () => ({ getTrustedAppOrigin: () => "https://bunny.test" }));
mock.module("@/lib/media/storage", () => ({ getMediaStorage: async () => ({ putSource: async (_key: any, body: any, size: number, hash: string) => { storageHash = hash; await new Response(body).arrayBuffer(); return { bytes: size }; }, putPage: async () => ({ bytes: 1 }) }) }));
const actual = await import("../../src/lib/media/uploads");
const digest = "a".repeat(64);
const input = () => ({ expectedVersion: 5, sourceSha256: digest, sourceBytes: 100, pageCount: 3, processingProfile: "balanced-v1" as const });
beforeEach(() => {
  process.env.MEDIA_UPLOADS_ENABLED = "1"; process.env.MEDIA_STORAGE_PREFIX = "test";
  actor = { id: "creator", role: "contributor" }; access = true; writes = []; storageHash = undefined; retired = [];
  upload = { id: "upload", revisionId: "revision", chapterId: "chapter", createdById: "creator", state: "failed", sourceName: "a.pdf", sourceBytes: 100, expectedPages: 3, sourceSha256: digest, processingProfile: "balanced-v1", revisionVersion: 5, reservedBytes: 0, keepSource: false, errorCode: "storage_failed", expiresAt: new Date(Date.now() + 60000), revision: { id: "revision", version: 5, pendingUploadId: "upload", chapter: { seriesId: "series" } } };
  parts = [{ pageIndex: -1, readyAt: new Date(), bytes: 100 }, { pageIndex: 0, readyAt: new Date(), bytes: 30 }, { pageIndex: 2, readyAt: new Date(), bytes: 45 }];
});
test("resume reuses only verified complete parts and resets known failure without creating another upload", async () => {
  const result = await actual.resumeUpload("upload", input());
  expect(result.ok).toBe(true); const status = (result.data as any).status;
  expect(status.readyPageIndices).toEqual([0, 2]); expect(status.pageBytes).toBe(75); expect(status.sourceReady).toBe(true);
  expect(writes).toHaveLength(1); expect(writes[0].state).toBe("uploading"); expect(upload.revision.version).toBe(5);
});
test("different file, bytes, page count, profile and stale version never resume", async () => {
  for (const patch of [{ sourceSha256: "b".repeat(64) }, { sourceBytes: 99 }, { pageCount: 2 }, { processingProfile: "high-v1" }, { expectedVersion: 4 }]) {
    expect((await actual.resumeUpload("upload", { ...input(), ...patch } as any)).ok).toBe(false);
  } expect(writes).toHaveLength(0);
});
test("unassigned staff, another creator and legacy unidentified uploads cannot resume", async () => {
  access = false; expect((await actual.resumeUpload("upload", input())).ok).toBe(false);
  access = true; actor.id = "other"; expect((await actual.resumeUpload("upload", input())).ok).toBe(false);
  actor.id = "creator"; upload.sourceSha256 = null; expect((await actual.resumeUpload("upload", input())).ok).toBe(false);
  expect(writes).toHaveLength(0);
});
test("expired and no-longer-owned revisions cannot resume", async () => {
  upload.expiresAt = new Date(0); expect((await actual.resumeUpload("upload", input())).ok).toBe(false);
  upload.expiresAt = new Date(Date.now() + 60000); upload.revision.pendingUploadId = "other";
  expect((await actual.resumeUpload("upload", input())).ok).toBe(false);
});
test("new start validates complete identity and preserves permanent legacy default", async () => {
  const start = { revisionId: "revision", expectedVersion: 5, sourceName: "test.pdf", sourceBytes: 100, pageCount: 3 };
  expect((await actual.startUpload({ ...start, keepSource: false } as any)).ok).toBe(false);
  const result = await actual.startUpload({ ...start, sourceSha256: digest, processingProfile: "balanced-v1", keepSource: false });
  expect(result.ok).toBe(true); expect(writes.some(data => data.sourceSha256 === digest && data.keepSource === false)).toBe(true);
});
test("source writer receives the server-pinned digest", async () => {
  upload.state = "uploading"; upload.sourceBytes = 8;
  const result = await actual.writeUploadAsset("upload", -1, new Request("https://bunny.test", { method: "PUT", headers: { "content-length": "8", "content-type": "application/pdf" }, body: "%PDF-1.7" }));
  expect(storageHash).toBe(digest); // Final transaction fixture may reject readiness, but identity must reach storage.
});
test("resume retires only the exact known failed reservation, preserving genuinely in-flight parts", async () => {
  upload.errorCode = "storage_failed:failedpart";
  parts.push({ id: "failedpart", uploadId: "upload", pageIndex: 1, readyAt: null, bytes: 20 });
  parts.push({ id: "inflight", uploadId: "upload", pageIndex: 3, readyAt: null, bytes: 20 });
  expect((await actual.resumeUpload("upload", input())).ok).toBe(true);
  expect(retired).toEqual(["failedpart"]);
  expect(parts.find(p => p.id === "failedpart").pageIndex).toBeLessThan(-1);
  expect(parts.find(p => p.id === "inflight").pageIndex).toBe(3);
});
