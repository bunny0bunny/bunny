# Public translator and team profiles — 2026-10-28

## Delivered behavior

Public identities represent the individual or translation team responsible for a work. They are separate from login accounts, administration roles, uploaders and publication approvers. Administrators create identities at `/admin/translators`, then assign explicit translation, editing or preparation credits from the series details page. Public visitors discover active identities at `/translators` and see their published works. Existing translator text remains a fallback where no active identity credit exists.

Verified readers can follow identities, mute or resume their publication alerts and manage follows at `/following`. A follow grants no editorial permissions. Suspension removes public visibility and prevents new follows while allowing existing readers to unfollow. Private account information and reading activity are not exposed.

First publication records an immutable chapter event before editorial projections change. Delivery combines eligible library readers and credited identity followers, with one notification per reader and chapter event. Retries use leases, keyset pagination, unique inserts and a transactional cursor check. Corrections, withdrawal, restoration and republication do not announce the same chapter again. Unavailable targets cannot open withdrawn or deleted content. Adult and premium restrictions remain in force.

## Verification

- All 16 isolated PostgreSQL regression suites passed: **125 tests, zero failures**. The harness replays all migrations in a disposable loopback database and never uses production dotenv values. Its Bun timeout is 30 seconds to accommodate Windows load without changing assertions.
- Scheduler, delivery route, follow controls, adult consent and adult warning checks passed: **14 tests, zero failures**.
- Claude's final read-only review found no blocking or important regressions. The previous ambiguity gap was fixed and tested using the real trash, restore and editorial commands. Final review reported no read-only violation.
- Scoped ESLint and the production build's TypeScript check passed. The first build exhausted host memory; the complete successful rebuild used `NODE_OPTIONS=--max-old-space-size=768` and a temporary directory on G. Type checking stayed enabled. The Worker artifact scan passed for secrets and private PDFs.
- Configured Codex and Antigravity implementer CLIs could not authorize their headless commands. No permission settings were bypassed; native delegated agents implemented the bounded backend and UI tasks, followed by coordinator review and independent checks.
- Browser interaction and visual QA remain unavailable because the configured browser runtime reports `BROWSER_RUNTIME_UNAVAILABLE`. HTTP and deployed asset verification are separate release checks and do not substitute for visual interaction testing.

## Release record

Production backup was refreshed on 2026-10-28 before migration, stored privately outside the repository, and its SHA256 was verified. It contains 24 tables, 628602 bytes. Existing customer works are never used as test fixtures. The migration is additive and no media objects are changed.

Migration `20261027180000_public_identities` applied successfully. Preservation checks confirmed all backed-up IDs still exist: 3 series, 10 chapters, 8 profiles, 3 private requests, 11 uploads and 463 media assets. Baseline discovery found 10 historical chapters and zero ambiguous chapters. The initial application created 10 baseline rows; repeated application and post-cutover discovery created zero additional rows.

The first deployment kept delivery disabled: Worker version `ee7368e2-b0be-4079-bb59-1e256d05b803`. Runtime configuration retained the existing encrypted cron secret, and an invalid token received HTTP 401. No secret was extracted or rotated for acceptance testing.

The final deployment enabled delivery: Worker version `1a501ac7-7a82-491b-bc92-e30262a39783`. The same paid Worker, R2 binding, self binding, CPU limit and every-minute cron were retained. No application rebuild was needed between deployments because only the runtime delivery flag changed.

All 17 hosted HTTP checks passed, covering public identity discovery, unavailable identity handling, guest and authenticated follows, administration, reader, genres, creation forms and trash access. All 31 fetched administration JavaScript assets matched local build SHA256 hashes. Post-enable preservation checks passed again, with all 10 ledger entries still historical baselines and no pending historical notifications.

An actual scheduled execution after enablement completed with outcome `ok`, every-minute cron and zero exceptions. Because the enabled scheduler awaits and validates its authenticated delivery response, this verifies the real private self-call and empty historical delivery batch without extracting the encrypted shared secret or generating production test content. Unauthorized delivery calls continued to receive HTTP 401.

HTTP checks recognize Next16's documented streaming semantics: unavailable identity pages may return HTTP 200 only with the explicit 404 fallback and `noindex`; a streamed login redirect must contain the exact login redirect marker. These checks do not treat arbitrary HTTP 200 errors as success.

## Operational limits

Notifications are in-app through the existing bell and paid Worker minute cron. Email, push, team membership self-service, profile claiming, custom image uploads and slug changes are outside this release. Public identities must be created and credited explicitly by an administrator; the migration does not expose private accounts or manufacture identity mappings from legacy text.
