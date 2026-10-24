import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
const deleted: string[] = [];
mock.module("@/lib/media/storage", () => ({
  validateMediaKey: (key: string) => { if (!/^media\/test\//.test(key)) throw Error("unsafe"); },
  getMediaStorage: async () => ({
    putSource: async (_key: string, stream: ReadableStream, bytes: number, digest: string) => {
      const data = new Uint8Array(await new Response(stream).arrayBuffer());
      if (createHash("sha256").update(data).digest("hex") !== digest) throw Error("identity mismatch");
      return { bytes };
    },
    putPage: async (_key: string, bytes: Uint8Array) => ({ bytes: bytes.length }),
    deleteObject: async (key: string) => { deleted.push(key); },
  }),
}));
const { db, setActor } = await import("./session-fixture");
const uploads = await import("../../src/lib/media/uploads");
const retention = await import("../../src/lib/media/source-retention");
let seriesId: string, chapterId: string, revisionId: string;
const source = "%PDF-1.7 synthetic original";
const sourceSha256 = createHash("sha256").update(source).digest("hex");
const page = Buffer.from("UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAMAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=", "base64");
const request = (body: string | Uint8Array, mime: string) => new Request("https://bunny.test", { method: "PUT", headers: { "content-type": mime, "content-length": String(typeof body === "string" ? Buffer.byteLength(body) : body.length) }, body: body as BodyInit });
beforeAll(async () => {
  const admin = await db.profile.findUniqueOrThrow({ where: { email: "admin@bunny.demo" } });setActor(admin.id);
  const s = await db.series.create({ data: { slug: "pdf-system-local-integration", titleAr: "QA", synopsisAr: "QA", author: "QA", format: "manga", coverPath: "" } });seriesId = s.id;
  const chapter = await db.chapter.create({ data: { seriesId, number: 35, titleAr: "QA" } });chapterId = chapter.id;
  revisionId = (await db.chapterRevision.create({ data: { chapterId, revisionNumber: 1, titleAr: "QA" } })).id;
});
afterAll(async () => { setActor(null);if (seriesId) await db.series.delete({ where: { id: seriesId } });await db.$disconnect(); });
test("real transactions preserve identity across failed resume, source review, retention and orphan cleanup", async () => {
  const result = await uploads.startUpload({ revisionId, expectedVersion: 1, sourceName: "35.pdf", sourceBytes: Buffer.byteLength(source), pageCount: 2, sourceSha256, processingProfile: "balanced-v1", keepSource: false });
  expect(result.ok).toBe(true);const { uploadId, revisionVersion } = result.data as any;
  // Same length, different source: never ready; failed immutable reservation is safely retired.
  expect((await uploads.writeUploadAsset(uploadId, -1, request(source.replace("original", "changed!"), "application/pdf"))).ok).toBe(false);
  expect((await db.chapterUpload.findUniqueOrThrow({ where: { id: uploadId } })).state).toBe("failed");
  const identity = { expectedVersion: revisionVersion, sourceSha256, sourceBytes: Buffer.byteLength(source), pageCount: 2, processingProfile: "balanced-v1" as const };
  expect((await uploads.resumeUpload(uploadId, identity)).ok).toBe(true);
  expect((await uploads.writeUploadAsset(uploadId, -1, request(source, "application/pdf"))).ok).toBe(true);
  expect((await uploads.writeUploadAsset(uploadId, 0, request(page, "image/webp"))).ok).toBe(true);
  expect((await uploads.resumeUpload(uploadId, { ...identity, sourceSha256: "b".repeat(64) })).error).toBe("file_mismatch");
  const resumed = await uploads.resumeUpload(uploadId, identity);expect(resumed.ok).toBe(true);
  expect((resumed.data as any).status.readyPageIndices).toEqual([0]);expect((resumed.data as any).status.sourceReady).toBe(true);
  expect((await uploads.writeUploadAsset(uploadId, 1, request(page, "image/webp"))).ok).toBe(true);
  expect((await uploads.completeUpload(uploadId, revisionVersion)).ok).toBe(true);
  const imported = await db.chapterUpload.findUniqueOrThrow({ where: { id: uploadId } });
  expect(imported.keepSource).toBe(false);expect(imported.sourceReviewedAt).toBeNull();expect(imported.sourceDeleteAfter!.getTime() - imported.completedAt!.getTime()).toBe(7 * 86400000);
  const now = new Date(imported.completedAt!.getTime() + 8 * 86400000);
  expect((await retention.maintainCompletedSources({ now })).deleted).toBe(0);
  expect((await retention.changeSourcePolicy(uploadId, { keepSource: true, reviewed: true })).ok).toBe(true);
  expect((await retention.maintainCompletedSources({ now })).deleted).toBe(0);
  expect((await retention.changeSourcePolicy(uploadId, { keepSource: false })).ok).toBe(true);
  expect((await retention.maintainCompletedSources({ now })).deleted).toBe(1);
  expect(await db.mediaAsset.count({ where: { uploadId, pageIndex: { gte: 0 } } })).toBe(2);
  expect((await db.chapterRevision.findUniqueOrThrow({ where: { id: revisionId } })).pagesJson).toHaveLength(2);
  expect((await db.chapter.findUniqueOrThrow({ where: { id: chapterId } })).workflow).toBe("draft");
  expect((await retention.maintainAbandonedUploads({ now })).deleted).toBe(1);
  expect(await db.mediaAsset.count({ where: { uploadId, pageIndex: { lt: -1 } } })).toBe(0);
  expect(deleted).toHaveLength(2);
});
test("migration leaves the pre-existing upload untouched", async () => {
  const legacy = await db.chapterUpload.findUniqueOrThrow({ where: { id: "legacy-upload" } });
  expect(legacy.keepSource).toBe(true);expect(legacy.sourceDeleteAfter).toBeNull();expect(legacy.completedAt).toBeNull();
  expect(await db.mediaAsset.count({ where: { uploadId: legacy.id } })).toBe(1);
});
