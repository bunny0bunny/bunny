# Admin foundation fixes — 2026-10-24

Published code: `6e4e53a`.
Cloudflare version: `1d7cb36d-876b-4f2b-bc64-a047b40cc423`.
Site: https://bunny.bunny-library.workers.dev

## Fixed

1. Admin counters, filters, titles and content counts use the latest editorial revision. Public availability remains separate, so a published chapter stays readable while its replacement is prepared.
2. A series with chapters cannot change its reading format. Existing slugs remain immutable; duplicate creation returns a useful validation error.
3. The Worker now runs an authenticated publication job every minute through its own service binding. Each request handles at most 20 due approved revisions. Secret values remain in encrypted bindings.
4. Featured work and collection settings now affect the actual home queries. A work needs a readable live chapter to be offered as a reading start.
5. Series/chapter/editor actions guard duplicate submission and recover from thrown requests without blindly replaying an uncertain mutation. Existing series can be saved repeatedly.
6. Unsaved text has exit warnings and explicit recovery within the same browser tab, scoped to actor/entity/server version. Recovery does not persist covers or private media. Switching works preserves each work's pending recovery separately. Fresh admin setup has a direct create-work next step.

## Verification

- 67 focused tests passed: scheduler/auth/metadata 16; discovery/upload recovery/Worker scope 26; admin queries/presentation 9; forms/recovery 16.
- TypeScript and scoped ESLint passed. Production Cloudflare build and artifact secret/private-file scan passed.
- Combined independent review and bounded follow-up completed with no material findings open.
- 20 hosted checks passed, including real metadata saves twice, duplicate slug rejection, format lock, scheduled admin filter, approval/scheduling and actual automatic publication.
- 7 public route smoke checks passed.
- Worker API confirmed CPU 30000ms, minute Cron, private R2, database, app-origin, self binding and encrypted Cron secret.

The temporary chapter was due at 14:48:34 UTC and observed published at 14:54:12 UTC during initial Cron activation. One system-owned scheduled-publication event was recorded; the anonymous reader returned the chapter. The isolated series, chapter, profile and analytics were removed. This verifies automatic execution; an exact publication time is not guaranteed.

## Preserved and remaining

Original content, existing uploads, accounts and mock records were preserved. No reseed, reset or schema migration was performed.

Browser automation could not initialize in this session. Actual component/handler tests and hosted HTTP acceptance passed, but browser file selection, PDF.js rendering, mobile/Safari interactions and the user's real PDF still require practical verification. Recovery is tab-scoped text recovery, not a permanent backup; browser storage availability still matters.
