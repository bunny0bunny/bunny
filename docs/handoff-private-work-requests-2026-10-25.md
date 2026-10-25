# Private work requests — production handoff, 25 October 2026

Implemented in `274e974`, deployed to https://bunny.bunny-library.workers.dev with Worker version `244b511b-d334-4b2e-91fa-5f44cabe1d04` (100% traffic readback).

## Reader and administration flow

- Signed-in verified readers submit a work title, category, optional reference URL and message at `/requests/new`. `/requests` tracks their own submissions and private administration reply.
- `/admin/requests` provides search, status filters, original messages, private replies, internal notes and deliberate merging of requests for the same work. Merging preserves each original message and private reply; only the destination status and status note are shared.
- Readers receive existing in-app notifications for relevant replies and status changes. Internal notes remain private and silent. No external email or messaging service was added.
- Available status can link only to an existing public work with a readable chapter; this feature does not publish chapters.
- Stable submission identifiers and normalized own-title matching prevent duplicates. Limits are three persisted submissions per rolling 24 hours and 20 submission attempts per hour. Groups are capped at 200 original submissions. The admin work selector displays up to 200 public works and explicitly labels the cap when reached.

## Verification

- 34 focused and real PostgreSQL tests passed, with 189 assertions: HTTP boundary 7/48, backend unit 6/18, client UI 12/45, request integration 8/76 and existing role boundary 1/2. Test groups ran independently to isolate mocks.
- Full migration rehearsal preserved six legacy tables. Direct TypeScript, scoped ESLint, full Cloudflare production build and private-artifact/secret scanning passed.
- One combined independent review and a bounded follow-up completed. The no-op admin-save lock was fixed and regression-tested. Client mutations also have a finite 30-second deadline and never automatically replay POST requests.
- Production received only the versioned additive migration, after a private snapshot. The new request table started empty.
- 38 hosted acceptance checks passed: owner isolation, guest/editor denial, cross-origin rejection, private replies after merging, stale-write conflicts, silent internal/no-op saves, notification isolation, duplicate protection, daily quota and safe existing-work links. All four synthetic requests and their owned profiles/notifications were removed.
- Live browser acceptance submitted two temporary requests through the real form, saved a no-op and then real status/reply changes, verified the reader reply and absence of internal notes, and merged the two owned requests through the admin confirmation controls. Both original messages and the first private reply were retained. No JavaScript page errors were recorded.
- At an emulated 390px viewport, the form and reader detail had no horizontal overflow; form inputs were at least 44px high. The reader-detail screenshot was captured and visually inspected. This is Chromium viewport coverage, not a physical-device or Safari claim.
- Seven public smoke routes passed. Deployment readback confirmed required bindings and the existing minute scheduler.
- Only the two exact browser test requests and their linked test notifications were removed. The existing staff account and session were preserved. Final integrity checks confirmed every original row in Profile, Series, Chapter, ChapterRevision, ChapterPage, ChapterUpload, MediaAsset and Notification matched the pre-migration baseline, with no extra retained rows in these tables.

## Preservation and operation

Existing library/mock content and PDF processing were preserved. No catalog cleanup, real chapter publication, database reset or seed was performed. Private backups, fixture metadata, acceptance receipts and reports stay in ignored `.local-preview/readiness-audit/`; they must not be committed or exposed publicly.

Entry points:
- https://bunny.bunny-library.workers.dev/requests/new
- https://bunny.bunny-library.workers.dev/requests
- https://bunny.bunny-library.workers.dev/admin/requests
