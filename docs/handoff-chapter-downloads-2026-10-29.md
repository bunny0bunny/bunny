# Chapter downloads — release handoff

## Status

Published on 2026-10-29 after the user authorized release. Worker version: `e613b1ab-3114-4080-b477-a0f6e545154f`. Both the decimal chapter-number fix and controlled downloads are included. No new service or content fixtures were created.

A fresh private database backup was checksummed before applying the two migrations. Verification preserved all 1,234 existing records and existing chapter numbers; downloads default to off.

## Behavior

- Series administration has **السماح بتنزيل الفصول**, off by default. Novel downloads are deferred.
- Published unlocked manga/webtoon chapters get a download dialog in chapter lists and readers. Administrators can download with the switch off. They cannot export draft, locked, withdrawn, deleted or future content.
- Preparation shows source-image progress, cancellation, retry and an explicit save link. Blob URLs and native bitmaps are released on close/cancel/unmount.
- The server resolves only current published `ChapterPage` references and ready matching image assets. It never exposes a source PDF or an arbitrary client URL. A same-origin image proxy checks permissions and the ordered manifest fingerprint again for each page. Final confirmation rejects replacement/withdrawal during preparation.
- English title first, Arabic fallback; decimal numbers remain in filenames.
- Limits: 200 source images, existing 6 MiB / 16,777,216-pixel image limit, 64 MiB PDF. RGB JPEG output at 0.92 quality and at most 1440 pixels wide; long images split into contiguous PDF pages up to 4096 pixels high. Reading images are unchanged.

## Architecture decision

The initial server-side PDF/cache proposal was replaced after actual workerd feasibility tests. The large-page decoder needed roughly 148 MB for WASM plus JS output alone; available alternatives either shipped an outdated codec or failed the Worker dynamic-code restriction. Browser-native decoding avoids a new paid renderer service and duplicate PDF storage. Each download prepares on the reader's device. Compressed PDF data accumulates up to the size cap; device memory and native codec support remain practical limits.

## Verification

- Isolated PostgreSQL regression harness: all 19 suites passed, 137 tests, with migrations replayed from scratch. Artifacts: `.local-preview/test-tmp/bunyora-trash-qa-J6DilH/report.json`.
- Focused browser orchestration, PDF structure/tiling, manifest/access policy and decimal tests: 15 passed, 130 assertions.
- Independent actual generated PDF parsing **and rendering** with PDF.js passed for ordinary and tall pages, with expected rendered colors. Evidence: `.local-preview/readiness-audit/download-feasibility/REPORT.md`.
- Scoped ESLint and `tsc --noEmit` passed. `npm run cf:build` passed, including Next compilation/types, OpenNext bundling, 33 route-chunk aliases and the runtime-secret artifact check. No deployment followed.
- Subsequent focused database rerun: 8 passed, 54 assertions, including the actionable over-200-images error. Artifacts: `.local-preview/test-tmp/bunyora-trash-qa-BzQg5j/`.
- Real mobile/browser interaction QA remains pending; native browser image decoding was exercised through orchestration mocks, not a live browser session.

## Release verification and operation

Both migrations were applied successfully before deployment. Fresh release checks passed: 15 focused unit tests, 8 isolated database tests, and the artifact security check. Live home, explore, series and manga-reader pages returned 200; all 25 referenced JavaScript assets matched the local build. The live download API rejected missing chapters, disabled-series downloads and cross-origin requests as expected. Evidence is in ignored `download-release-*-verification.json` and `download-release-hosted-report.json` files.

Enable **السماح بتنزيل الفصول** in the series editor to make downloads available to readers. Verify a real chapter download on desktop and mobile, including cancellation and a long webtoon; real-device interaction QA remains pending. No export cache cleanup job or R2 PDF objects are needed.
