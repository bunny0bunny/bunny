#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const graceMs = 24 * 60 * 60 * 1000;
const reserveMs = 5 * 60 * 1000;
export function eligibleUpload(upload, now) {
  return !!upload && ['cancelled', 'uploading', 'failed'].includes(upload.state)
    && new Date(upload.expiresAt).getTime() <= now.getTime() - graceMs;
}
export function safeAssetKey(asset, upload, prefix) {
  const id = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/;
  const extension = { 'application/pdf': 'pdf', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[asset.mime];
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(prefix) && id.test(upload.id) && id.test(asset.id)
    && asset.uploadId === upload.id && asset.chapterId === upload.chapterId && !!extension
    && asset.objectKey === `media/${prefix}/${upload.id}/${asset.id}.${extension}`;
}

// The CLI supplies an adapter inside a database transaction with write locks.
export async function cleanupAsset(io, assetId, { now, prefix, apply }) {
  const asset = await io.getAsset(assetId);
  if (!asset) return 'already_removed';
  const upload = await io.getUpload(asset.uploadId);
  if (!eligibleUpload(upload, now)) return 'retained';
  if (new Date(asset.createdAt).getTime() > now.getTime() - reserveMs) return 'in_flight';
  if (!safeAssetKey(asset, upload, prefix)) return 'invalid_key';
  if (await io.isReferenced(asset.id)) return 'referenced';
  if (!apply) return 'candidate';
  await io.cancelAndDetach(upload);
  try { await io.deleteObject(asset.objectKey); }
  catch { return 'storage_failed'; }
  await io.deleteRecord(asset.id);
  return 'deleted';
}

export function parseArgs(args) {
  let apply = false, limit = 25, uploadId;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true;
    else if (args[i] === '--limit') {
      const raw = args[++i];
      if (!raw || !/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 25) throw new Error('Invalid limit');
      limit = Number(raw);
    } else if (args[i] === '--upload-id') {
      uploadId = args[++i];
      if (!uploadId || !/^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/.test(uploadId)) throw new Error('Invalid upload ID');
    } else throw new Error('Unknown argument');
  }
  return { apply, limit, ...(uploadId ? { uploadId } : {}) };
}

async function main() {
  const { apply, limit, uploadId } = parseArgs(process.argv.slice(2));
  const prefix = process.env.MEDIA_STORAGE_PREFIX || 'prod';
  if (!process.env.DATABASE_URL || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(prefix)) throw new Error('Missing database or invalid prefix');
  let deleteObject;
  if (apply) {
    for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) {
      if (!process.env[name]) throw new Error('Missing storage configuration');
    }
    if (!/^[a-f0-9]{32}$/.test(process.env.R2_ACCOUNT_ID) || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(process.env.R2_BUCKET_NAME)) throw new Error('Invalid storage configuration');
    const { AwsClient } = await import('aws4fetch');
    const client = new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto', retries: 0 });
    deleteObject = async (key) => {
      const url = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME}/${key}`;
      const response = await client.fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(3000) });
      await response.body?.cancel();
      if (!response.ok && response.status !== 404) throw new Error('Storage deletion failed');
    };
  }
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ log: [] });
  const counts = {};
  const now = new Date();
  try {
    // A batch is bounded by object count, including retained candidates.
    const assets = await db.mediaAsset.findMany({
      where: { ...(uploadId ? { uploadId } : {}), upload: { state: { in: ['cancelled', 'uploading', 'failed'] }, expiresAt: { lte: new Date(now.getTime() - graceMs) } } },
      orderBy: { createdAt: 'asc' }, take: limit, select: { id: true },
    });
    for (const { id } of assets) {
      let result;
      try {
        result = await db.$transaction(async (tx) => {
          if (apply) {
            // These short maintenance locks prevent new published/draft references
            // between the reference check and external deletion. Fail closed when busy.
            await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1500ms'");
            await tx.$executeRawUnsafe('LOCK TABLE "ChapterUpload", "MediaAsset", "ChapterPage", "ChapterRevision" IN SHARE ROW EXCLUSIVE MODE');
          }
          return cleanupAsset({
            getAsset: (assetId) => tx.mediaAsset.findUnique({ where: { id: assetId } }),
            getUpload: (uploadId) => tx.chapterUpload.findUnique({ where: { id: uploadId } }),
            isReferenced: async (assetId) => {
              const path = `/api/media/${assetId}`;
              const [reference] = await tx.$queryRaw`
                SELECT EXISTS(SELECT 1 FROM "ChapterPage" WHERE strpos("imagePath", ${path}) > 0)
                  OR EXISTS(SELECT 1 FROM "ChapterRevision" WHERE strpos("pagesJson"::text, ${path}) > 0) AS retained`;
              return reference.retained;
            },
            cancelAndDetach: async (upload) => {
              await tx.chapterUpload.update({ where: { id: upload.id }, data: { state: 'cancelled', errorCode: upload.state === 'cancelled' ? upload.errorCode : 'expired' } });
              await tx.chapterRevision.updateMany({ where: { pendingUploadId: upload.id }, data: { pendingUploadId: null, version: { increment: 1 } } });
            },
            deleteObject,
            deleteRecord: (assetId) => tx.mediaAsset.delete({ where: { id: assetId } }),
          }, id, { now, prefix, apply });
        }, { isolationLevel: 'ReadCommitted', maxWait: 2000, timeout: 8000 });
      } catch { result = 'transaction_failed'; }
      counts[result] = (counts[result] || 0) + 1;
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', scanned: assets.length, counts }));
    if (counts.storage_failed || counts.transaction_failed || counts.invalid_key) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Media cleanup stopped safely. Check arguments, database access and storage configuration; no secret details logged.'); process.exitCode = 1; });
}
