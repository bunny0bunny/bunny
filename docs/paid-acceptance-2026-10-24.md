# Workers acceptance and mock inventory — 2026-10-24

The user reported purchasing Workers Paid and requested the next acceptance test. The deployment remains https://bunny.bunny-library.workers.dev in account `bb0d8a6aac4da656fc72c011819cafb7`, Worker `bunny`.

## CPU configuration and observed failure

Account/script settings initially returned `standard`, with no explicit CPU limit. Subscription reads remain forbidden to the existing OAuth token; `standard` is not independent billing proof. The first complete replacement attempt returned503 with `exceededCpu` outcomes at107ms and50ms, so successful earlier requests did not establish reliability.

Applied `limits.cpu_ms:30000` through the documented Worker settings PATCH API, read it back successfully, and compared bindings before/after: unchanged. No billing purchase, credential change, binding change or application-code deployment was performed. The same explicit30000ms limit is now retained in `wrangler.jsonc` for subsequent deployments.

## Acceptance after explicit CPU configuration

The final run exited0 with42 checks passed. It used three temporary synthetic staff profiles, one temporary series/chapter and two revisions. A25MiB synthetic PDF was uploaded through the actual deployed upload API, followed by two generated JPEG page assets. The first source request transferred26,215,418bytes in29,980ms. These fixtures contain no real user content.

Confirmed upload completion, staff private preview, anonymous denial before publication, contributor submission, editor recommendation, contributor approval denial, administrator approval/publication, anonymous reader document and published images. A separate replacement draft preserved existing public pages until approval/publication; the new images then became anonymously readable. Both PDF source assets remained private after publication.

The final run's filtered real-time telemetry contains36 Worker invocations, all with outcome `ok`, maximum observed CPU1321ms and no `exceededCpu` or `exceededMemory`. Expected403 authorization checks are included. This is bounded acceptance, not sustained-load evidence. Earlier409 responses were caused by the test harness using build-specific action identifiers from an older local build; the harness was corrected to resolve references from the deployed studio's public JavaScript. They were not application workflow conflicts.

Exact cleanup removed the owned series/chapter/revisions, three profiles, six R2 objects and their upload quota rows. The tail session was stopped. Seven subsequent public HTTP smoke checks passed, including existing work/reader routes and404.

Browser automation could not initialize because its local assets path was unavailable. This run exercised deployed HTTP routes and Server Actions, with database/storage verification; it did **not** exercise the browser file picker, PDF.js conversion, client state transitions, touch hardware or Safari. Those remain the device/browser acceptance boundary.

## Mock inventory — no deletion

Read-only comparison against the original seed manifests found12 seeded series and46 chapter title/number matches. A match does not establish that a chapter is unchanged or safe to delete. Three seeded series contain upload records and must be protected from whole-series removal:

| Series | Chapters with upload records | Current workflow |
| --- | --- | --- |
| حارس بوابة الشفق | 61 | draft |
| نبض المدينة صفر | 9,133 | draft |
| المدينة التي نسيت المطر | 4 | review |

Some upload records may be user experiments or prior fixtures; provenance must be resolved individually. Do not infer that every upload is disposable or every seeded chapter is untouched. No real upload was cancelled or published. No seeded series, chapter, rating, comment, profile, reading record or analytics event was deleted. No full database/storage backup was taken in this test.

Before removing mock data: obtain and verify a recoverable backup; prepare an exact manifest separating unchanged seed content from uploaded/edited content and protected records; reconcile fictional counters, ratings, comments and analytics with retained real records; review the concrete removal scope. Never reseed/reset production or delete all seeded series by slug alone. Final domain/SEO and physical-device acceptance remain separate launch work.
