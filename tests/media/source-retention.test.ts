import { beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const now = new Date("2026-10-09T00:00:00Z");
const completedAt = new Date("2026-10-01T00:00:00Z");
const source = { id: "source1", uploadId: "upload1", chapterId: "chapter1", pageIndex: -1, mime: "application/pdf", bytes: 8, readyAt: completedAt, objectKey: "media/test/upload1/source1.pdf", width: null, height: null };
const page = { ...source, id: "page1", pageIndex: 0, mime: "image/webp", bytes: 4, width: 800, height: 1200, objectKey: "media/test/upload1/page1.webp" };
function fixture() { return {
  id: "upload1", revisionId: "revision1", chapterId: "chapter1", createdById: "creator", state: "ready", sourceName: "test.pdf", sourceBytes: 8,
  sourceSha256: "a".repeat(64), processingProfile: "balanced-v1", keepSource: false, sourceReviewedAt: completedAt,
  sourceDeleteAfter: new Date("2026-10-08T00:00:00Z"), sourceDeletedAt: null as Date | null, sourceDeletingAt: null as Date | null, completedAt,
  expectedPages: 1, revisionVersion: 2, expiresAt: now, errorCode: null,
  revision: { version: 3, chapter: { seriesId: "series1" } }, assets: [{ ...source }, { ...page }],
}; }
let upload = fixture();
let actor = { id: "creator", role: "contributor", nickname: "Test" };
let assigned = true, authenticated = true, referenced = false, storageFails = false, loseCAS = false;
let deleteHook: (() => Promise<void>) | undefined;
const deleted: string[] = [];
const txOptions: { system?: boolean; invalidate?: boolean }[] = [];
const tx = {
  chapterUpload: {
    findUnique: async () => upload,
    findUniqueOrThrow: async () => upload,
    findFirst: async () => upload,
    findMany: async () => [{ id: upload.id }],
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (loseCAS || ("keepSource" in where && where.keepSource !== upload.keepSource) || ("sourceDeletingAt" in where && where.sourceDeletingAt !== upload.sourceDeletingAt) || ("sourceDeletedAt" in where && where.sourceDeletedAt !== upload.sourceDeletedAt)) return { count: 0 };
      Object.assign(upload, data); return { count: 1 };
    },
    update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(upload, data); return upload; },
  },
  mediaAsset: {
    findUnique: async ({ where }: { where: { id: string } }) => upload.assets.find(a => a.id === where.id) ?? null,
    delete: async ({ where }: { where: { id: string } }) => { upload.assets = upload.assets.filter(a => a.id !== where.id); },
  },
  chapterPage: { count: async () => referenced ? 1 : 0 },
  chapterRevision: { count: async () => referenced ? 1 : 0, findUnique: async () => ({ id: "revision1", chapter: { seriesId: "series1" } }) },
  series: { count: async () => referenced ? 1 : 0 },
};
mock.module("../../src/lib/editorial", () => ({
  withSerializableTx: async (work: (db: unknown, identity: unknown) => Promise<unknown>, options: { system?: boolean; invalidate?: boolean } = {}) => {
    txOptions.push(options);
    return options.system || authenticated ? work(tx, actor) : { ok: false, error: "unauthenticated" };
  },
  checkStaffSeriesAccess: async () => actor.role === "admin" || assigned,
}));
mock.module("../../src/lib/media/storage", () => ({
  validateMediaKey: (key: string) => { if (!/^media\/test\/upload1\/[a-z0-9]+\.pdf$/.test(key)) throw Error("bad key"); },
  getMediaStorage: async () => ({ deleteObject: async (key: string) => { deleted.push(key); await deleteHook?.(); if (storageFails) throw Error("R2 unavailable"); } }),
}));
const { maintainCompletedSources, changeSourcePolicy, latestRevisionUpload } = await import("../../src/lib/media/source-retention");
beforeEach(() => {
  upload = fixture(); actor = { id: "creator", role: "contributor", nickname: "Test" }; assigned = true; authenticated = true; referenced = false; storageFails = false; loseCAS = false; deleteHook = undefined; deleted.length = 0; txOptions.length = 0; process.env.MEDIA_UPLOADS_ENABLED = "1";
});
test("deletes only the exact source and preserves all page assets", async () => {
  expect(await maintainCompletedSources({ now })).toEqual({ examined: 1, deleted: 1, failed: 0, skipped: 0 });
  expect(deleted).toEqual([source.objectKey]); expect(upload.assets).toEqual([page]); expect(upload.sourceDeletedAt).toEqual(now);
  expect(txOptions.every(o => o.system === true && o.invalidate === false)).toBe(true);
  expect((await changeSourcePolicy(upload.id, { keepSource: true })).error).toBe("conflict");
});
test("failed storage deletion keeps its claim, retries idempotently, then finalizes", async () => {
  storageFails = true;
  expect((await maintainCompletedSources({ now })).failed).toBe(1);
  expect(upload.sourceDeletingAt).toEqual(now); expect(upload.sourceDeletedAt).toBeNull(); expect(upload.assets.length).toBe(2);
  expect((await changeSourcePolicy(upload.id, { keepSource: true })).error).toBe("conflict");
  storageFails = false;
  expect((await maintainCompletedSources({ now })).deleted).toBe(1);
  expect(deleted).toEqual([source.objectKey, source.objectKey]);
  expect((await maintainCompletedSources({ now })).skipped).toBe(1);
});
test("review, seven days, completion, identity, and permanent retention are required", async () => {
  for (const change of [{ keepSource: true }, { sourceReviewedAt: null }, { completedAt: null }, { sourceSha256: null }, { processingProfile: null }, { sourceDeleteAfter: new Date("2027-01-01") }, { state: "failed" }]) {
    upload = Object.assign(fixture(), change);
    expect((await maintainCompletedSources({ now })).skipped).toBe(1);
  }
  expect(deleted).toEqual([]);
});
test("referenced source, incomplete images, or a forged source key cannot be deleted", async () => {
  referenced = true; expect((await maintainCompletedSources({ now })).skipped).toBe(1);
  referenced = false; upload.assets[1].readyAt = null as unknown as Date; expect((await maintainCompletedSources({ now })).skipped).toBe(1);
  upload = fixture(); upload.assets[0].objectKey = page.objectKey; expect((await maintainCompletedSources({ now })).skipped).toBe(1);
  expect(deleted).toEqual([]);
});
test("policy is authorized by current actor and series assignment, creator or admin", async () => {
  authenticated = false; expect((await changeSourcePolicy(upload.id, { keepSource: true })).error).toBe("unauthenticated");
  authenticated = true; assigned = false; expect((await changeSourcePolicy(upload.id, { keepSource: true })).error).toBe("forbidden");
  assigned = true; actor.id = "other"; expect((await changeSourcePolicy(upload.id, { keepSource: true })).error).toBe("forbidden");
  actor.role = "admin"; expect((await changeSourcePolicy(upload.id, { keepSource: true })).ok).toBe(true);
  expect(upload.keepSource).toBe(true); expect(upload.sourceDeleteAfter).toBeNull();
});
test("policy CAS loses to claim; successful permanent retention prevents maintenance", async () => {
  loseCAS = true; expect((await changeSourcePolicy(upload.id, { keepSource: true })).error).toBe("conflict");
  loseCAS = false; expect((await changeSourcePolicy(upload.id, { keepSource: true })).ok).toBe(true);
  expect((await maintainCompletedSources({ now })).skipped).toBe(1); expect(deleted).toEqual([]);
});
test("deletion claim blocks a permanent-retention request during external storage deletion", async () => {
  deleteHook = async () => { expect((await changeSourcePolicy(upload.id, { keepSource: true })).error).toBe("conflict"); };
  expect((await maintainCompletedSources({ now })).deleted).toBe(1);
});
test("legacy sources cannot be enrolled; explicit review is completion-only", async () => {
  upload.sourceSha256 = null as unknown as string; expect((await changeSourcePolicy(upload.id, { keepSource: false })).error).toBe("conflict");
  upload = fixture(); upload.state = "uploading"; expect((await changeSourcePolicy(upload.id, { keepSource: false, reviewed: true })).error).toBe("incomplete");
  upload = fixture(); upload.sourceReviewedAt = null as unknown as Date;
  expect((await changeSourcePolicy(upload.id, { keepSource: false, reviewed: true })).ok).toBe(true);
  expect(upload.sourceReviewedAt).toBeInstanceOf(Date); expect(upload.sourceDeleteAfter.toISOString()).toBe("2026-10-08T00:00:00.000Z");
});
test("status reads authorize and do not change retention or session expiry", async () => {
  const initial = JSON.stringify(upload);
  const result = await latestRevisionUpload("revision1"); expect(result.ok).toBe(true); expect(JSON.stringify(upload)).toBe(initial);
  expect((result.data as { upload: { readyPageIndices: number[] } }).upload.readyPageIndices).toEqual([0]);
  assigned = false; expect((await latestRevisionUpload("revision1")).error).toBe("forbidden");
});
