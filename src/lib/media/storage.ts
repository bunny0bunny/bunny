import "server-only";
import { createHash } from "node:crypto";
import { AwsClient } from "aws4fetch";
import { sniffPage, validatePdfPrefix, validateSourceLength, type PageMime } from "./formats";

export type SignGetOptions = { expiresIn?: number; downloadName?: string };
export interface MediaStorage {
  putPage(key: string, bytes: Uint8Array, mime: PageMime): Promise<{ bytes: number }>;
  putSource(key: string, body: ReadableStream<Uint8Array>, expectedBytes: number, expectedSha256?: string): Promise<{ bytes: number }>;
  signGet(key: string, options?: SignGetOptions): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
type HttpMetadata = { contentType: string; cacheControl: string; contentDisposition?: string };
export interface MediaBinding {
  put(key: string, value: Uint8Array | ReadableStream<Uint8Array>, options: { onlyIf: { etagDoesNotMatch: string }; httpMetadata: HttpMetadata }): Promise<unknown | null>;
  delete(key: string): Promise<void>;
}
type BytePipe = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
type FixedLengthFactory = (bytes: number) => BytePipe;
export type S3MediaConfig = { accountId: string; accessKeyId: string; secretAccessKey: string; bucketName: string };
type Fetch = (request: Request, init?: RequestInit) => Promise<Response>;

export function validateMediaKey(key: string): void {
  if (!/^media\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/[A-Za-z0-9][A-Za-z0-9-]{0,127}\/[A-Za-z0-9][A-Za-z0-9-]{0,127}\.(webp|jpg|pdf)$/.test(key)) {
    throw new Error("Invalid media object key");
  }
}
function validatePage(key: string, bytes: Uint8Array, mime: PageMime) {
  validateMediaKey(key);
  const image = sniffPage(bytes);
  if (image.mime !== mime || !key.endsWith(image.mime === "image/webp" ? ".webp" : ".jpg")) throw new Error("Page MIME or object extension does not match its bytes");
}
function attachment(name: string): string {
  const safe = name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0,180) || "source.pdf";
  const ascii = safe.replace(/[^A-Za-z0-9._ -]/g, "_");
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
function metadata(mime: string): HttpMetadata {
  return { contentType: mime, cacheControl: "private, no-store", ...(mime === "application/pdf" ? { contentDisposition: attachment("source.pdf") } : {}) };
}

function pdfValidation(expectedBytes: number, expectedSha256?: string): TransformStream<Uint8Array, Uint8Array> {
  const hash = expectedSha256 ? createHash("sha256") : null;
  let total = 0;
  let prefixBytes = 0;
  const prefix = new Uint8Array(5);
  return new TransformStream({
    transform(chunk, controller) {
      hash?.update(chunk);
      total += chunk.byteLength;
      if (total > expectedBytes) throw new Error("PDF source exceeds its declared size");
      let consumed = 0;
      if (prefixBytes < 5) {
        consumed = Math.min(5-prefixBytes, chunk.byteLength);
        prefix.set(chunk.subarray(0,consumed), prefixBytes);
        prefixBytes += consumed;
        if (prefixBytes < 5) return;
        validatePdfPrefix(prefix);
        controller.enqueue(prefix);
      }
      if (consumed < chunk.byteLength) controller.enqueue(chunk.subarray(consumed));
    },
    flush() {
      if (total !== expectedBytes || prefixBytes !== 5) throw new Error("PDF source is shorter than its declared size");
      if (hash && hash.digest("hex") !== expectedSha256) throw new Error("PDF source identity mismatch");
    },
  });
}

/** Start producer and consumer together; abort both sides on validation/storage failure. */
async function streamSource(key: string, body: ReadableStream<Uint8Array>, expectedBytes: number, pipe: BytePipe, store: (readable: ReadableStream<Uint8Array>, signal: AbortSignal) => Promise<void>, expectedSha256?: string) {
  validateMediaKey(key);
  if (!key.endsWith(".pdf")) throw new Error("PDF source requires a PDF object key");
  validateSourceLength(expectedBytes);
  if (expectedSha256 !== undefined && !/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error("Invalid source identity");
  const abort = new AbortController();
  const piping = body.pipeThrough(pdfValidation(expectedBytes, expectedSha256)).pipeTo(pipe.writable, { signal: abort.signal });
  const storing = Promise.resolve().then(() => store(pipe.readable, abort.signal));
  try {
    await Promise.all([piping, storing]);
    return { bytes: expectedBytes };
  } catch (error) {
    // A failed precondition may return before the consumer acquires a reader.
    // Cancel that readable explicitly to release a backpressured pending write.
    const cancelling = pipe.readable.cancel(error).catch(() => {});
    abort.abort(error);
    await Promise.allSettled([piping, storing, cancelling]);
    throw error;
  }
}

export function createBindingStorage(binding: MediaBinding, signGet: MediaStorage["signGet"], fixedLength: FixedLengthFactory): MediaStorage {
  return {
    async putPage(key, bytes, mime) {
      validatePage(key, bytes, mime);
      const object = await binding.put(key, bytes, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: metadata(mime) });
      if (object === null) throw new Error("Media object already exists");
      return { bytes: bytes.byteLength };
    },
    async putSource(key, body, expectedBytes, expectedSha256) {
      validateMediaKey(key);
      validateSourceLength(expectedBytes);
      return streamSource(key, body, expectedBytes, fixedLength(expectedBytes), async (readable) => {
        const object = await binding.put(key, readable, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: metadata("application/pdf") });
        if (object === null) throw new Error("Media object already exists");
      }, expectedSha256);
    },
    async signGet(key, options) { validateMediaKey(key); return signGet(key, options); },
    async deleteObject(key) { validateMediaKey(key); await binding.delete(key); },
  };
}

export function createS3Storage(config: S3MediaConfig, fetchRequest: Fetch = fetch): MediaStorage {
  if (!/^[a-f0-9]{32}$/i.test(config.accountId) || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucketName) || !config.accessKeyId || !config.secretAccessKey) {
    throw new Error("R2 storage configuration is missing or invalid");
  }
  const client = new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: "s3", region: "auto", retries: 0 });
  const objectUrl = (key: string) => { validateMediaKey(key); return new URL(`https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}/${key}`); };
  async function put(key: string, body: Uint8Array | ReadableStream<Uint8Array>, bytes: number, mime: string, signal?: AbortSignal) {
    const meta = metadata(mime);
    const signed = await client.sign(objectUrl(key), {
      method: "PUT", body: body as BodyInit,
      headers: { "If-None-Match": "*", "Content-Length": String(bytes), "Content-Type": meta.contentType, "Cache-Control": meta.cacheControl, "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD", ...(meta.contentDisposition ? { "Content-Disposition": meta.contentDisposition } : {}) },
    });
    const response = await fetchRequest(signed, { signal });
    await response.body?.cancel();
    if (!response.ok) throw new Error(response.status === 412 ? "Media object already exists" : "Media storage write failed");
  }
  return {
    async putPage(key, bytes, mime) { validatePage(key, bytes, mime); await put(key, bytes, bytes.byteLength, mime); return { bytes: bytes.byteLength }; },
    async putSource(key, body, expectedBytes, expectedSha256) {
      return streamSource(key, body, expectedBytes, new TransformStream<Uint8Array,Uint8Array>(), (readable, signal) => put(key, readable, expectedBytes, "application/pdf", signal), expectedSha256);
    },
    async signGet(key, options = {}) {
      const url = objectUrl(key);
      const expires = options.expiresIn ?? 3600;
      if (!Number.isSafeInteger(expires) || expires < 1 || expires > 3600) throw new Error("Signed media URL expiry must be between 1 and 3600 seconds");
      url.searchParams.set("X-Amz-Expires", String(expires));
      url.searchParams.set("response-cache-control", "private, no-store");
      if (key.endsWith(".pdf") || options.downloadName !== undefined) url.searchParams.set("response-content-disposition", attachment(options.downloadName ?? "source.pdf"));
      return (await client.sign(url, { method: "GET", aws: { signQuery: true } })).url;
    },
    async deleteObject(key) {
      const response = await fetchRequest(await client.sign(objectUrl(key), { method: "DELETE" }));
      await response.body?.cancel();
      if (!response.ok) throw new Error("Media storage deletion failed");
    },
  };
}

type RuntimeEnv = Record<string, unknown> & { MEDIA?: MediaBinding };
function signingStorage(env: RuntimeEnv) {
  const value = (name: string) => typeof env[name] === "string" ? env[name] as string : "";
  return createS3Storage({ accountId: value("R2_ACCOUNT_ID"), accessKeyId: value("R2_ACCESS_KEY_ID"), secretAccessKey: value("R2_SECRET_ACCESS_KEY"), bucketName: value("R2_BUCKET_NAME") });
}
/** Lazy and request-local: binding writes need no S3 credentials; only signing does. */
export async function getMediaStorage(): Promise<MediaStorage> {
  if (process.env.BUNNY_RUNTIME === "cloudflare") {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = getCloudflareContext().env as unknown as RuntimeEnv;
    if (!env.MEDIA) throw new Error("MEDIA storage binding is unavailable");
    let signer: MediaStorage | undefined;
    return createBindingStorage(env.MEDIA, (key, options) => (signer ??= signingStorage(env)).signGet(key, options), (bytes) => {
      const FixedLength = (globalThis as unknown as { FixedLengthStream?: new (length: number) => BytePipe }).FixedLengthStream;
      if (!FixedLength) throw new Error("FixedLengthStream is unavailable");
      return new FixedLength(bytes);
    });
  }
  return signingStorage(process.env);
}
