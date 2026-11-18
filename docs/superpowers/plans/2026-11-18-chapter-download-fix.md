# Chapter download fix — plan for Codex review

Date: 2026-11-18. Status: implemented on `fix/chapter-downloads` (steps 1–3); Codex diff review and device QA (step 4) pending. Depends on Phase 1 (`fix/phase1-stabilize`: CI, download logs, Workers observability).

## Problem

Readers report that the chapter download button does not produce a PDF. Real-device QA was never completed (`docs/handoff-chapter-downloads-2026-10-29.md`). Production had no logs, so the failing branch is unknown. Code review found these likely causes, in order of likelihood:

1. **Chapters whose pages are not R2 assets.** `getChapterDownload` requires every `ChapterPage.imagePath` to match `/api/media/<id>`. Chapters seeded or migrated with static paths (for example `/series/<slug>/<n>/p01.webp`, the seed's format) return `409 conflict`. The UI then says «تغيّر محتوى الفصل أثناء التجهيز. أعد المحاولة.», which is wrong and makes retry pointless.
2. **Strict fetch-metadata check.** `isSameOriginDownload` rejects any request without `Sec-Fetch-Site: same-origin`. Browsers or webviews that omit fetch metadata (Safari before 16.4, some in-app browsers) get `403 forbidden`: «تنزيل هذا الفصل غير متاح حاليًا.»
3. **Fragile page fetch.** Each page request re-runs the manifest transaction, presigns an R2 URL, then `fetch`es it from the Worker with strict `content-type` / `content-length` checks. Any mismatch becomes a generic `503 unavailable`. The Worker already has the `MEDIA` R2 binding, which avoids the presign and network round trip.
4. **Button shown where it cannot work.** `work-tabs.tsx` shows the button for any non-locked chapter when `downloadsEnabled` (or admin), with no check that the chapter is downloadable.

## Step 0 — confirm with logs (no code)

After Phase 1 is deployed, reproduce on one failing chapter and read Workers Logs for `scope: "chapter-download"`. The `event`/`reason` field identifies the branch (`non_media_page_path`, `origin_rejected`, `asset_mismatch`, `fingerprint_changed`, `storage_response`, `storage_fetch`). Adjust the order of the steps below to match what the logs show. Do not skip this: it decides whether steps 2 and 3 are needed now.

## Step 1 — honest availability and errors (small, low risk)

- Add `isChapterDownloadable(pages)` in `src/lib/downloads/policy.ts`: true only when 1–200 pages and every `imagePath` matches the media pattern. Reuse it in `getChapterDownload`.
- Return a distinct code `legacy_pages` (HTTP 409) instead of `conflict` for non-media page paths.
- Compute `downloadable` server-side where the chapter list is built (`src/app/series/[slug]/page.tsx` → `work-tabs.tsx`) and hide the button when false. Pass only a boolean to the client.
- Map `legacy_pages` in `chapter-download-button.tsx` to «هذا الفصل غير متاح للتنزيل حاليًا.» Keep `conflict` for real fingerprint changes only.
- Tests: policy unit test for the predicate; `tests/team-access/chapter-downloads.test.ts` case for a chapter with a static path (expects `legacy_pages`, and the series page hides the button).

## Step 2 — fetch-metadata fallback (security-sensitive)

Keep the CSRF/hotlink protection, but stop rejecting browsers that do not send `Sec-Fetch-*`:

- Reject when `Sec-Fetch-Site` is present and not `same-origin`.
- When `Sec-Fetch-Site` is absent:
  - POST manifest: require `Origin` equal to the request origin (already required).
  - GET page: require the custom `X-Chapter-Download: 1` header. A cross-origin page cannot send it without a CORS preflight, and the route answers no preflight.
- Keep the `Sec-Fetch-Mode` / `Sec-Fetch-Dest` checks when those headers are present.
- Tests: missing headers + correct Origin/custom header → allowed; `cross-site` → 403; missing headers without Origin/custom header → 403.

**Question for review:** is the custom-header fallback strong enough for the GET page route, given that the response is a private, no-store image of a published public chapter?

## Step 3 — read pages through the R2 binding

- Add `getObject(key)` to `MediaStorage`. The binding implementation uses `binding.get(key)` and returns `{ body, size, contentType }`; the S3 implementation keeps the current signed GET.
- In `fetchChapterDownloadPage`, use `getObject`, check `size === page.bytes` and the stored content type against `page.mime`, and keep the streaming byte counter.
- Keep one manifest check per page (it enforces withdrawal and permissions). Do not add a cache in this step.
- Tests: extend `tests/media/storage.test.ts` for `getObject` on both implementations; update the download service tests for the binding path.

## Step 4 — device QA (manual)

Chrome Android, Safari iOS 17+, Safari iOS 15/16 (if available), Samsung Internet, a Facebook/Instagram in-app browser, and desktop Chrome/Firefox/Safari.

For each, use a short manga chapter, a long webtoon chapter (close to 200 pages) and a legacy chapter. Record whether the PDF saves and opens. Note that iOS Safari opens a blob PDF in its viewer instead of saving it; decide whether that is acceptable or whether a `navigator.share({ files })` fallback is needed.

## Out of scope

- Downloading legacy static-path chapters. If the team wants these downloadable, the follow-up options are reading them through the `ASSETS` binding, or migrating their pages into R2 as media assets. That needs a separate plan, because it touches production data.
- Novel downloads.

## Files

`src/lib/downloads/{policy,service}.ts`, `src/lib/media/storage.ts`, `src/components/downloads/chapter-download-button.tsx`, `src/components/library/work-tabs.tsx`, `src/app/series/[slug]/page.tsx`, the tests named above.

No schema change, no migration, no change to who may download.
