# Assigned editor publishing — handoff

## Status

Published and verified on 2026-11-02. Feature source commit: `500a3e3`. Worker version: `4747cb44-d324-441c-9c7f-fa829642666f`. Previous live version: `395e6204-6a9a-49c0-ab8c-32df9c5a49c4`.

## Behavior

- Administrators create series and assign contributor/editor accounts. Public translator/team identities remain credits and follower targets, independently of account permissions.
- Assigned staff can upload and prepare chapters. A separate default-off `SeriesAssignment.canPublish` grant allows a verified, enabled assigned editor to approve and publish an exact revision immediately. Editors submit drafts for review first; a second reviewer is optional.
- Combined approval/publication checks the account, assignment, grant, latest version and completed media inside one transaction, preserving both audit events and the existing publication outbox. Standalone approval, scheduling, cancellation, withdrawal, deletion and series settings remain administrator-managed.
- Scheduled revisions are locked against non-admin mutations, including PDF upload paths. Editing an approved unscheduled revision resets approval and notifies administrators. Private generic staff alerts cover publication, scheduling, cancellation and withdrawal without draft titles or review reasons in previews.

## Verification

- Local implementation checks on 2026-11-01: **22 suites / 165 distinct tests**, scoped ESLint and full TypeScript passed. The full regression found an old scheduled-upload expectation and fixture outbox leakage; only the three affected suites were rerun after correcting those test fixtures. No production logic changed afterward. Evidence: ignored `editor-publishing-final-tests.json` and its referenced isolated PostgreSQL logs.
- The initial production build was stopped during prolonged compilation. A fresh Cloudflare production build completed on 2026-11-02, including TypeScript, 11 generated pages, Worker bundling, 33 route-chunk aliases and runtime-secret artifact checks. The release reused the existing feature tests rather than repeating unchanged coverage.
- Added an opt-in build profile in `next.config.ts`: `BUNNY_BUILD_LOW_MEMORY=1` enables one worker, webpack memory optimizations and the webpack build worker. This addresses limited local RAM and changes build scheduling, not application permissions. Normal builds retain their previous defaults.
- Read-only hosted checks passed on both `https://bunyora.com` and `https://bunny.bunny-library.workers.dev`: home, explore, a published series and reader returned 200; 25 JavaScript assets per host matched the local release build; admin/studio/notifications required login; guest notification feeds were empty. No new authenticated browser test or production fixtures were used.

## Database and release

- Verified a private backup of all 28 public tables before applying the migration. Backup pointer and digest are in ignored `editor-publishing-release-backup.json`; backup data remains outside the repository.
- Applied `20261101120000_editor_publishing` successfully. Verified 173 existing core records remained present, all three existing assignments retained their identities and default-off grants, and the new column is non-null boolean with default false.
- Deployed the verified Worker with the existing MEDIA bucket, service and asset bindings, configured variables and minute cron. No user permissions were manually enabled and no content was created for testing.
- Release evidence: ignored `editor-publishing-release-database-verification.json`, `editor-publishing-release-hosted-bunyora.com.json`, `editor-publishing-release-hosted-bunny.bunny-library.workers.dev.json` and `editor-publishing-release-status.json`.
