import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
mock.module("server-only", () => ({}));
const { createBindingStorage, createS3Storage, validateMediaKey } = await import("../../src/lib/media/storage");
const key = "media/test/upload123/asset123.pdf";
const pdf = new TextEncoder().encode("%PDF-1.7\nsynthetic");
test("streaming PDF identity is verified before a ready source can be returned", async () => {
  const digest = createHash("sha256").update(pdf).digest("hex");
  expect(await fixture().db.putSource(key, stream(pdf.slice(0, 3), pdf.slice(3)), pdf.length, digest)).toEqual({ bytes: pdf.length });
  await expect(fixture().db.putSource(key, stream(pdf), pdf.length, "0".repeat(64))).rejects.toThrow();
  await expect(fixture().db.putSource(key, stream(pdf), pdf.length, "not-a-digest")).rejects.toThrow();
});
function stream(...parts: Uint8Array[]) { return new ReadableStream<Uint8Array>({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); } }); }
function fixture(conflict = false) {
  const writes: { key: string; options: unknown; bytes: Uint8Array }[] = [];
  const deleted: string[] = [];
  const binding = {
    async put(objectKey: string, body: Uint8Array | ReadableStream<Uint8Array>, options: unknown) {
      if (conflict) return null;
      const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
      writes.push({ key: objectKey, options, bytes });
      return { key: objectKey };
    },
    async delete(objectKey: string) { deleted.push(objectKey); },
  };
  const db = createBindingStorage(binding, async () => "signed-url", () => new TransformStream<Uint8Array,Uint8Array>());
  return { db, writes, deleted };
}

test("restricts every operation to registered media-shaped keys", async () => {
  for (const invalid of ["https://x/a.pdf", "media/test/../a.pdf", "media/test/a/b.svg", "media/test/a/b.pdf?x=1", "media/test/a/b/c.pdf", "media//a/b.pdf", "media/test/a/%2e.pdf"]) {
    expect(() => validateMediaKey(invalid)).toThrow();
  }
  expect(() => validateMediaKey(key)).not.toThrow();
  const { db, deleted } = fixture();
  await expect(db.deleteObject("other/test/a/b.pdf")).rejects.toThrow();
  expect(deleted).toEqual([]);
});
test("streams split PDF prefixes and counts exact bytes with atomic private writes", async () => {
  const { db, writes } = fixture();
  expect(await db.putSource(key, stream(pdf.slice(0,2), pdf.slice(2)), pdf.length)).toEqual({ bytes: pdf.length });
  expect(writes[0].bytes).toEqual(pdf);
  expect(writes[0].options).toMatchObject({ onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/pdf", cacheControl: "private, no-store" } });
});
test("rejects short, long and non-PDF source bodies without a ready result", async () => {
  for (const [body, length] of [[pdf, pdf.length+1], [pdf, pdf.length-1], [new TextEncoder().encode("<html>bad"),9]] as const) {
    await expect(fixture().db.putSource(key, stream(body), length)).rejects.toThrow();
  }
});
test("failed binding preconditions reject without hanging a pending source stream", async () => {
  await expect(fixture(true).db.putSource(key, stream(pdf), pdf.length)).rejects.toThrow();
});
test("pages are sniffed server-side and MIME/extension mismatches fail before put", async () => {
  const { db, writes } = fixture();
  const webp = Buffer.from("UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAMAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=", "base64");
  await expect(db.putPage("media/test/a/b.jpg", webp, "image/jpeg")).rejects.toThrow();
  await expect(db.putPage("media/test/a/b.jpg", webp, "image/webp")).rejects.toThrow();
  await expect(db.putPage("media/test/a/b.jpg", new TextEncoder().encode("<svg/>"), "image/jpeg")).rejects.toThrow();
  expect(writes).toHaveLength(0);
  expect(await db.putPage("media/test/a/b.webp", webp, "image/webp")).toEqual({ bytes: webp.length });
  expect(writes[0].bytes).toEqual(webp);
  await expect(fixture(true).db.putPage("media/test/a/b.webp", webp, "image/webp")).rejects.toThrow();
});
test("S3 signer uses only configured R2 origin, signs bounded TTL and safe attachment name", async () => {
  const db = createS3Storage({ accountId: "a".repeat(32), accessKeyId: "test-access", secretAccessKey: "test-secret", bucketName: "private-media" }, async () => { throw new Error("network forbidden"); });
  const signed = new URL(await db.signGet(key, { expiresIn: 60, downloadName: "chapter\r\nX-Evil: yes.pdf" }));
  expect(signed.origin).toBe(`https://${"a".repeat(32)}.r2.cloudflarestorage.com`);
  expect(signed.pathname).toBe(`/private-media/${key}`);
  expect(signed.searchParams.get("X-Amz-Expires")).toBe("60");
  expect(signed.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  expect(signed.searchParams.get("response-content-disposition")).toStartWith("attachment;");
  expect(signed.searchParams.get("response-content-disposition")).not.toMatch(/[\r\n]/);
  for (const expiresIn of [0,3601,NaN,1.2]) await expect(db.signGet(key, { expiresIn })).rejects.toThrow();
});
test("Node streamed source uses create-once signed condition and declared content length", async () => {
  let request: Request | undefined;
  const db = createS3Storage({ accountId: "a".repeat(32), accessKeyId: "test-access", secretAccessKey: "test-secret", bucketName: "private-media" }, async (input) => {
    request = input as Request;
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(pdf);
    return new Response(null, { status: 200 });
  });
  expect(await db.putSource(key, stream(pdf), pdf.length)).toEqual({ bytes: pdf.length });
  expect(request?.headers.get("if-none-match")).toBe("*");
  expect(request?.headers.get("content-length")).toBe(String(pdf.length));
  expect(request?.headers.get("authorization")).toContain("if-none-match");
});
test("Node early 412 responses reject and cancel the streamed producer", async () => {
  const db = createS3Storage({ accountId: "a".repeat(32), accessKeyId: "test-access", secretAccessKey: "test-secret", bucketName: "private-media" }, async () => new Response(null, { status: 412 }));
  await expect(db.putSource(key, stream(pdf), pdf.length)).rejects.toThrow("already exists");
});
test("S3 cover listing signs scoped pagination and refuses incomplete manifests", async () => {
  const prefix = "media/test/covers-series123/";
  let xml = '<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>media/test/covers-series123/old.webp</Key></Contents><NextContinuationToken>a&amp;b</NextContinuationToken></ListBucketResult>';
  const storage = createS3Storage({ accountId: "a".repeat(32), accessKeyId: "test-access", secretAccessKey: "test-secret", bucketName: "private-media" }, async input => {
    const request = input as Request, url = new URL(request.url);
    expect(request.method).toBe("GET"); expect(url.searchParams.get("prefix")).toBe(prefix);
    expect(url.searchParams.get("continuation-token")).toBe("previous");
    expect(request.headers.get("authorization")).toContain("AWS4-HMAC-SHA256");
    return new Response(xml);
  });
  expect(await storage.listObjects!(prefix, "previous")).toEqual({ keys: [prefix + "old.webp"], cursor: "a&b" });
  for (const invalid of ['<Error/>', '<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>', '<ListBucketResult/>']) {
    xml = invalid; await expect(storage.listObjects!(prefix, "previous")).rejects.toThrow("Invalid storage listing");
  }
  await expect(storage.listObjects!("media/test/", "previous")).rejects.toThrow();
});

test("binding cover listing cannot silently truncate its manifest", async () => {
  const prefix = "media/test/covers-series123/";
  const storage = createBindingStorage({ put: async () => null, delete: async () => {}, list: async () => ({ objects: [], truncated: true }) }, async () => "signed-url");
  await expect(storage.listObjects!(prefix)).rejects.toThrow("Invalid storage listing");
});
