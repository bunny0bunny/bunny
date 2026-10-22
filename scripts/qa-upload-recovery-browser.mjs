// Actual panel + actual request boundary; PDF rendering and network are local fixtures.
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const root = process.cwd(), folder = path.join(root, '.local-preview/upload-recovery-browser');
await mkdir(folder, { recursive: true });
const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{PdfUploadPanel}from'${path.join(root, 'src/components/studio/pdf-upload-panel.tsx').replaceAll('\\', '/')}';
window.events={started:0,busy:false};function App(){const[pending,setPending]=useState(location.search.includes('pending')?'known':null);const[version,setVersion]=useState(1);const[unsaved,setUnsaved]=useState(location.search.includes('unsaved'));return <PdfUploadPanel revisionId="revision" version={version} pendingUploadId={pending} uploadsEnabled disabled={false} unsaved={unsaved} onSaveDraft={()=>setUnsaved(false)} onBusyChange={value=>window.events.busy=value} onStarted={(id,v)=>{window.events.started++;setPending(id);setVersion(v)}} onRevision={r=>{setPending(r.pendingUploadId);setVersion(r.version)}}/>}createRoot(document.getElementById('root')).render(<App/>);`;
await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: root }, bundle: true, splitting: true, format: 'esm', platform: 'browser', jsx: 'automatic', outdir: folder, logLevel: 'silent', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'fixture-pdf', setup(b) {
  b.onResolve({ filter: /\/media\/pdf-client$/ }, () => ({ path: 'pdf', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export async function openPdf(){return{pageCount:2,renderPage:async()=>new Blob(["fixture"],{type:"image/webp"}),destroy:async()=>{}}}', loader: 'js' }));
} }] });
const server = createServer(async (req, res) => { try {
  if (req.url.split('?')[0] === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end('<html lang="ar" dir="rtl"><div id="root"></div><script type="module" src="/stdin.js"></script></html>'); return; }
  const file = path.resolve(folder, '.' + req.url);
  if (!file.startsWith(folder + path.sep)) throw Error('path');
  res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(file));
} catch { res.statusCode = 404; res.end(); } });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const browser = await chromium.launch(), origin = `http://127.0.0.1:${server.address().port}`;
const checks = [];
const uploadButton = page => page.getByRole('button', { name: 'رفع الملف كاملًا وتجهيز المعاينة', exact: true });
async function select(page) { await expect(page.locator('input[type=file]')).toBeEnabled(); await page.locator('input[type=file]').setInputFiles({ name: 'fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') }); }
const status = (state = 'failed') => ({ ok: true, status: { uploadId: 'known', state, expectedPages: 2, readyPages: state === 'ready' ? 2 : 1, sourceReady: true, revisionVersion: 2, errorCode: null, expiresAt: '2026-12-01T12:00:00Z' } });
try {
  {
    const page = await browser.newPage(); let posts = 0;
    await page.route('**/api/uploads', async route => { posts++; await route.fulfill({ status: 503, contentType: 'text/html', body: '<html>PRIVATE PLATFORM ERROR</html>' }); });
    await page.goto(origin); await select(page); await uploadButton(page).click();
    await expect(page.getByRole('alert')).toContainText('الخادم');
    await expect(page.getByText('قد يكون الخادم قد بدأ الرفع', { exact: false })).toBeVisible();
    await expect(page.getByText('جارٍ التحقق من ملف PDF…', { exact: true })).toHaveCount(0);
    await expect(uploadButton(page)).toBeDisabled(); assert.equal(posts, 1);
    await expect(page.getByText('PRIVATE PLATFORM ERROR')).toHaveCount(0);
    checks.push('ambiguous start locks recovery without replay or stale working message'); await page.close();
  }
  {
    const page = await browser.newPage(); let gets = 0, posts = 0;
    await page.route('**/api/uploads**', async route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() === 'GET') { gets++; await route.fulfill({ json: status() }); }
      else if (url.pathname === '/api/uploads') { posts++; await route.fulfill({ json: { ok: true, uploadId: 'known', revisionVersion: 2 } }); }
      else await route.fulfill({ status: 503, contentType: 'text/html', body: 'platform failure' });
    });
    await page.goto(origin); await select(page); await uploadButton(page).click();
    await expect(page.getByText('الصفحات المستلمة:', { exact: false })).toContainText('1 من 2');
    await expect(page.getByText('جارٍ رفع ملف PDF الأصلي الخاص…', { exact: true })).toHaveCount(0);
    assert.equal(gets, 1); assert.equal(posts, 1);
    await expect(page.getByRole('button', { name: 'إلغاء الرفع لإعادة المحاولة', exact: true })).toBeEnabled();
    checks.push('known-ID failure reads authoritative progress and exposes cancellation'); await page.close();
  }
  {
    const page = await browser.newPage(); let gets = 0;
    await page.route('**/api/uploads/known', async route => { gets++; await route.fulfill({ json: status('ready') }); });
    await page.goto(origin + '/?pending');
    await expect(page.getByText('اكتمل إرفاق الصفحات على الخادم.', { exact: false })).toBeVisible();
    assert.equal(await page.evaluate(() => window.events.started), 0); assert.equal(gets, 1);
    await expect(page.getByText('يوجد رفع غير مكتمل.', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'إعادة تحميل حالة النسخة من الخادم', exact: true })).toBeEnabled();
    checks.push('ready server state never calls onStarted and requires authoritative reload'); await page.close();
  }
  {
    const page = await browser.newPage(); let completed = 0;
    await page.route('**/api/uploads**', async route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() === 'GET') await route.fulfill({ json: status('ready') });
      else if (url.pathname === '/api/uploads') await route.fulfill({ json: { ok: true, uploadId: 'known', revisionVersion: 2 } });
      else if (url.pathname.endsWith('/complete')) { completed++; await route.fulfill({ status: 503, body: 'unknown completion result' }); }
      else await route.fulfill({ json: { ok: true } });
    });
    await page.goto(origin); await select(page); await uploadButton(page).click();
    await expect(page.getByText('اكتمل إرفاق الصفحات على الخادم.', { exact: false })).toBeVisible();
    await expect(page.getByText('الصفحات المستلمة:', { exact: false })).toContainText('2 من 2');
    assert.equal(completed, 1); assert.equal(await page.evaluate(() => window.events.started), 1);
    await expect(page.getByText('جارٍ إرفاق الصفحات بالمسودة…', { exact: true })).toHaveCount(0);
    checks.push('uncertain completion reconciles ready state without repeating completion'); await page.close();
  }
  {
    const page = await browser.newPage(); let gets = 0, cancelled = 0;
    await page.route('**/api/uploads/known**', async route => {
      if (route.request().method() === 'GET') { gets++; await route.fulfill({ json: status(gets === 1 ? 'failed' : 'ready') }); }
      else { cancelled++; await route.fulfill({ status: 409, json: { ok: false, code: 'conflict' } }); }
    });
    await page.goto(origin + '/?pending');
    await expect(page.getByText('الصفحات المستلمة:', { exact: false })).toContainText('1 من 2');
    await page.getByRole('button', { name: 'إلغاء الرفع لإعادة المحاولة', exact: true }).click();
    await expect(page.getByText('اكتمل إرفاق الصفحات على الخادم.', { exact: false })).toBeVisible();
    assert.equal(cancelled, 1); assert.equal(await page.evaluate(() => window.events.started), 1);
    checks.push('stale cancellation conflict refreshes ready state without relocking as pending'); await page.close();
  }
  {
    const page = await browser.newPage(); let held;
    await page.clock.install();
    await page.route('**/api/uploads', route => { held = route; });
    await page.goto(origin); await select(page); await uploadButton(page).click();
    await expect.poll(() => !!held).toBe(true);
    await page.getByRole('button', { name: 'إلغاء الرفع لإعادة المحاولة', exact: true }).click();
    await page.clock.runFor(5100);
    await expect(page.getByText('المحاولة ما زالت تتوقف.', { exact: false })).toBeVisible();
    await expect(uploadButton(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'إعادة تحميل حالة النسخة من الخادم', exact: true })).toBeEnabled();
    await held.fulfill({ status: 503, body: 'failure' });
    checks.push('cancel wait is bounded while an unresolved start keeps duplicate upload blocked'); await page.close();
  }
  {
    const page = await browser.newPage(); let starts = 0;
    await page.route('**/api/uploads', async route => { starts++; await route.fulfill({ status: 503, body: 'fixture failure after a valid selection' }); });
    await page.goto(origin);
    await expect(page.locator('input[type=file]')).toBeEnabled();
    await page.locator('input[type=file]').evaluate(input => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(30 * 1024 * 1024 + 1)], 'too-large.pdf', { type: 'application/pdf' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await uploadButton(page).click();
    await expect(page.getByRole('alert')).toContainText('حجم PDF يتجاوز');
    assert.equal(starts, 0);
    await select(page); await uploadButton(page).click();
    await expect.poll(() => starts).toBe(1);
    await expect(page.getByText('قد يكون الخادم قد بدأ الرفع', { exact: false })).toBeVisible();
    checks.push('oversized preflight failure releases task ownership for the next valid file'); await page.close();
  }
  {
    const page = await browser.newPage(); await page.goto(origin + '/?unsaved'); await select(page);
    await expect(uploadButton(page)).toBeDisabled(); await page.getByRole('button', { name: 'حفظ تغييرات المسودة', exact: true }).click();
    await expect(uploadButton(page)).toBeEnabled(); await expect(page.getByText('fixture.pdf', { exact: true })).toBeVisible();
    checks.push('picker still supports selection before save and preserves selected file'); await page.close();
  }
  console.log(JSON.stringify({ pass: true, checks }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
