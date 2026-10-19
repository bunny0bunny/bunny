import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleUpload, safeAssetKey, cleanupAsset, parseArgs } from './media-cleanup.mjs';

const now = new Date('2026-10-20T12:00:00Z');
const upload = { id: 'upload123', chapterId: 'chapter123', state: 'cancelled', expiresAt: new Date('2026-10-19T11:59:00Z') };
const asset = { id: 'asset123', uploadId: upload.id, chapterId: upload.chapterId, objectKey: 'media/prod/upload123/asset123.webp', mime: 'image/webp', createdAt: new Date('2026-10-19T12:00:00Z') };
test('active, ready and superseded uploads are retained; expiry grace is at least 24 hours', () => {
  for (const state of ['ready', 'superseded']) assert.equal(eligibleUpload({ ...upload, state }, now), false);
  assert.equal(eligibleUpload({ ...upload, state: 'uploading', expiresAt: new Date('2026-10-20T13:00:00Z') }, now), false);
  assert.equal(eligibleUpload({ ...upload, expiresAt: new Date('2026-10-19T12:01:00Z') }, now), false);
  assert.equal(eligibleUpload(upload, now), true);
  assert.equal(eligibleUpload({ ...upload, state: 'failed' }, now), true);
});
test('namespace must match both IDs, environment and MIME extension exactly', () => {
  assert.equal(safeAssetKey(asset, upload, 'prod'), true);
  for (const objectKey of ['media/other/upload123/asset123.webp', 'media/prod/wrong/asset123.webp', 'media/prod/upload123/other.webp', 'media/prod/upload123/asset123.pdf', '../asset123.webp']) assert.equal(safeAssetKey({ ...asset, objectKey }, upload, 'prod'), false);
});
function boundary({ referenced = false, failStorage = false, uploadValue = upload, assetValue = asset } = {}) {
  const calls = [];
  return { calls, io: { getUpload: async () => uploadValue, getAsset: async () => assetValue,
    isReferenced: async () => referenced, cancelAndDetach: async () => calls.push('cancel'),
    deleteObject: async () => { calls.push('storage'); if (failStorage) throw new Error('private signed URL must not escape'); },
    deleteRecord: async () => calls.push('record') } };
}
for (const location of ['published chapter', 'draft or historical revision']) test(`retains an asset referenced by ${location}`, async () => {
  const { calls, io } = boundary({ referenced: true });
  assert.equal(await cleanupAsset(io, asset.id, { now, prefix: 'prod', apply: true }), 'referenced');
  assert.deepEqual(calls, []);
});
test('dry-run performs no mutation, including no cancellation', async () => {
  const { calls, io } = boundary({ uploadValue: { ...upload, state: 'failed' } });
  assert.equal(await cleanupAsset(io, asset.id, { now, prefix: 'prod', apply: false }), 'candidate');
  assert.deepEqual(calls, []);
});
test('storage failure retains database record and successful rerun deletes storage before record', async () => {
  const failure = boundary({ failStorage: true });
  assert.equal(await cleanupAsset(failure.io, asset.id, { now, prefix: 'prod', apply: true }), 'storage_failed');
  assert.deepEqual(failure.calls, ['cancel', 'storage']);
  const retry = boundary();
  assert.equal(await cleanupAsset(retry.io, asset.id, { now, prefix: 'prod', apply: true }), 'deleted');
  assert.deepEqual(retry.calls, ['cancel', 'storage', 'record']);
});
test('a recently reserved object is retained even when upload was cancelled', async () => {
  const { calls, io } = boundary({ assetValue: { ...asset, createdAt: new Date('2026-10-20T11:59:00Z') } });
  assert.equal(await cleanupAsset(io, asset.id, { now, prefix: 'prod', apply: true }), 'in_flight');
  assert.deepEqual(calls, []);
});
test('an exact validated upload filter bounds an operator trial', () => {
  assert.deepEqual(parseArgs(['--upload-id', 'ownedUpload123', '--limit', '1']), { apply: false, limit: 1, uploadId: 'ownedUpload123' });
  for (const value of ['../upload', '', 'wild%card', 'upload/other']) assert.throws(() => parseArgs(['--upload-id', value]));
});
test('a candidate that became ready before the locked recheck is retained', async () => {
  const { calls, io } = boundary({ uploadValue: { ...upload, state: 'ready' } });
  assert.equal(await cleanupAsset(io, asset.id, { now, prefix: 'prod', apply: true }), 'retained');
  assert.deepEqual(calls, []);
});
