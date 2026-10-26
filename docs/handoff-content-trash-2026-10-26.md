# Admin content trash — 2026-10-26

Admin-only chapter and series deletion now uses a recoverable content bin at `/admin/trash`. The interface remains Arabic; work titles use English first, preserving translations and existing URLs.

## Behavior

- Chapter controls and series details offer a fresh preview and typed confirmation before moving content to the bin. The series action includes its active chapters. Previously trashed chapters remain independent.
- Catalog, reader, media gateways, ordinary administration lists, editorial writes, uploads and scheduled publication exclude deleted content. Upload callbacks cannot attach new content after deletion.
- Recovery is available for 30 days while the item remains recoverable. Restore creates a new draft, preserves historical published revisions and requires publication again. Original source and abandoned-file cleanup pause during recovery.
- Permanent deletion requires typed confirmation and runs in bounded cron batches. It persists object progress, retries failures, checks ownership and shared references, removes files before database cascades, and retains an audit journal. Accounts and private reader requests are preserved.
- Stored media submitted for early permanent deletion waits at least 24 hours after trash, or upload expiry plus one hour, whichever is later. The bin shows the not-before date. File-free chapters can finish immediately. Old replacement covers are discovered through paginated storage listing before deletion.
- Already issued signed media URLs can remain valid until their existing expiry (up to one hour for pages and five minutes for covers). New gateway access is denied immediately. Downloaded content cannot be recalled.

## Validation

- 100 integration tests in 13 independent Bun processes against newly created loopback PostgreSQL, replaying migration SQL. No production seeding or deletion was used.
- 3 scheduler, 2 maintenance-route authorization and 11 storage unit tests passed, including missing pagination manifests, failed storage operations, shared references, stale versions, independent chapter recovery and preservation of account/private-request records.
- The analytics regression test reproduced an invalid Prisma chapter relation filter before the fix, then passed for profile activity, admin overview and dashboard queries.
- Typecheck, scoped ESLint, staged whitespace check and full Cloudflare production build passed. Generated output was checked for private PDFs and secrets.
- Production migration `20261026180000_content_trash` adds nullable markers and a journal. Verification preserved all pre-migration IDs: 1 series, 10 chapters, 6 profiles, 1 private request, 11 chapter uploads, 463 media assets. Initial trash journal count: zero.
- A complete consistent database snapshot and schema/migrations were saved to the private user-and-SYSTEM-only directory `G:/Bunyora_Backups/content-trash-2026-10-26-efd6dd6d`. SHA-256 was verified before applying the migration. No media was changed by the migration.
- Browser visual QA was unavailable because the installed browser runtime was unavailable. HTTP checks do not replace visual or touch interaction verification. No customer content was trashed or permanently deleted to test the release.

## Release

Published to https://bunny.bunny-library.workers.dev with Worker version `7745ce06-b6ea-42ba-869b-b30cacf1c965`; the existing R2 binding, self-reference and minute cron remain configured.

Hosted read-only checks passed for home, discovery, Strobe Edge details and chapter 1, unauthenticated bin redirect, and authenticated bin/dashboard/chapter list/series details. All 26 JavaScript assets referenced by the authenticated pages returned HTTP 200 with bytes matching the local build. No actual customer content was deleted to test this release.
