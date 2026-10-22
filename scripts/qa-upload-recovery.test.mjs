import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadRequest, UploadRequestError, boundedWait } from '../src/lib/media/upload-request.ts';
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });
for (const [status, fragment] of [[401, 'تسجيل الدخول'], [413, 'الحجم'], [503, 'الخادم']]) test(`HTML HTTP ${status} preserves status with actionable Arabic and no HTML`, async () => {
  globalThis.fetch = async () => new Response('<html>PRIVATE ERROR PAGE</html>', { status });
  await assert.rejects(uploadRequest('/api/uploads', { method: 'POST' }), e => {
    assert.ok(e instanceof UploadRequestError); assert.equal(e.status, status); assert.match(e.message, new RegExp(fragment)); assert.doesNotMatch(e.message, /PRIVATE|html|تعذّر الاتصال/); assert.equal(e.ambiguous, status === 503); return true;
  });
});
test('timeout bounds a fetch ignoring abort and uncertain POST is not retried', async () => {
  let count = 0;
  globalThis.fetch = async () => { count++; return new Promise(() => {}); };
  const started = Date.now();
  await assert.rejects(uploadRequest('/api/uploads', { method: 'POST' }, { timeoutMs: 20 }), e => e instanceof UploadRequestError && e.kind === 'timeout' && e.ambiguous);
  assert.ok(Date.now() - started < 1000); assert.equal(count, 1);
});
test('abort bounds a fetch ignoring signal and preserves cancellation classification', async () => {
  const abort = new AbortController();
  globalThis.fetch = async () => new Promise(() => {});
  const pending = uploadRequest('/api/uploads/id/pages/0', { method: 'PUT', signal: abort.signal }, { timeoutMs: 100 });
  abort.abort();
  await assert.rejects(pending, e => e instanceof UploadRequestError && e.kind === 'aborted');
});
test('an already aborted request never dispatches a mutation', async () => {
  const abort = new AbortController();
  abort.abort();
  let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ ok: true }); };
  let failure;
  await assert.rejects(uploadRequest('/api/uploads', { method: 'POST', signal: abort.signal }), error => { failure = error; return error instanceof UploadRequestError && error.kind === 'aborted'; });
  assert.equal(requests, 0);
  assert.equal(failure.ambiguous, false);
});
test('a hanging response body has a deadline too', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
  await assert.rejects(uploadRequest('/api/uploads/id/complete', { method: 'POST' }, { timeoutMs: 20 }), e => e.kind === 'timeout' && e.ambiguous);
});
test('known conflict code is retained without replaying completion', async () => {
  globalThis.fetch = async () => Response.json({ ok: false, code: 'conflict', error: '<html>unsafe</html>' }, { status: 409 });
  await assert.rejects(uploadRequest('/api/uploads/id/complete', { method: 'POST' }), e => e.status === 409 && e.code === 'conflict' && !e.ambiguous && !e.message.includes('html'));
});
test('waiting for another task has a finite bound without cancelling that task', async () => {
  await assert.rejects(boundedWait(new Promise(() => {}), 10), /مهلة/);
});

test('disabled upload code is distinguished from an absent session',async()=>{globalThis.fetch=async()=>Response.json({ok:false,code:'disabled'},{status:404});await assert.rejects(uploadRequest('/api/uploads',{method:'POST'}),e=>e.code==='disabled'&&e.message.includes('غير متاح'));});
