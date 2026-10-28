# Public translator profiles implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. User explicitly authorized delegation; configured CLI lanes are used. Only the coordinator commits/deploys.

**Goal:** Public individual/team identities with work credits, follows/mute and reliable first-publication notifications.
**Architecture:** Independent public identity, explicit credits, unique follows, immutable chapter publication/outbox and bounded leased notification fan-out. Reuse existing paid Worker minute cron and bell.
**Tech Stack:** Next16, React, Prisma6/PostgreSQL, Cloudflare Worker/R2, Bun isolated database tests.
**Spec:** docs/superpowers/specs/2026-10-27-public-translator-profiles-design.md

## Global constraints

Use existing checkout to conserve disk; preserve unrelated untracked files. English work titles primary, Arabic interface. Do not touch actual customer works for QA. No new service/dependency. Existing source retention, trash, reader +18/premium checks and private accounts/requests remain protected. No delegate reads secrets or runs production commands. Shared schema/contracts belong to coordinator. Delegates must read relevant local Next16 docs, use TDD, run scoped checks, and never commit/deploy.

## Task 1: schema/contracts and isolated gates — coordinator
- [x] Add PublicIdentity, SeriesCredit, IdentityFollow, ChapterPublication, nullable Notification.publicationId with unique recipient/event; scalar chapter target retains tombstone after purge.
- [x] Write explicit cross-task DTO/action contracts in src/lib/public-identities/contracts.ts and src/lib/publications/contracts.ts; generate clients without database mutation.
- [x] Maintain isolated PostgreSQL test harness, cron route, scheduler and release flag; no production seed/reset.

## Task 2: backend implementation — Codex implementation lane
Own only src/lib/public-identities/{service,actions}.ts, src/lib/publications/{service,legacy}.ts, src/lib/editorial.ts, src/lib/notifications.ts, removal of unused notifyNewChapter import in src/lib/actions.ts, tests/team-access/{public-identities,publications}.test.ts. Coordinator and UI implementer never edit these concurrently.
- [x] Write failing authorization/follow/credit and publication lifecycle/delivery tests; run them against isolated database.
- [x] Implement admin identity/credits, safe public DTOs, verified reader follow/mute, idempotent operations and fresh version/role checks.
- [x] Insert ledger before publication mutations using historical evidence guard; no inline audience fan-out; serialize debut per series.
- [x] Implement baseline discovery/backfill API, bounded leased keyset recipient union, transactional insert+CAS and unavailable notification targets.
- [x] Run relevant gates; return full changes and honest failures. Coordinator reruns independently.

## Task 3: interface — Antigravity UI lane
Own new src/components/public-identities/*, src/app/translators/*, src/app/admin/translators/*, src/app/following/page.tsx and modifications to src/app/admin/layout.tsx, src/app/admin/series/[id]/page.tsx, src/app/series/[slug]/page.tsx, src/app/profile/page.tsx, src/components/library/chrome.tsx only. Consume exact contracts; do not invent backend API or alter schema/notification internals. If the CLI cannot authorize headless writes, coordinator completes owned UI without bypassing permissions.
- [x] Read UI skill and local Next docs, implement public/admin identity listing/details, accessible explicit follow/mute, admin credit panel and following view.
- [x] Surface pending/error/suspended/empty states and safe sign-in return URLs; public data has no email/activity.
- [x] Preserve translator string fallback, original author and existing +18/premium/English title behavior.
- [x] Run scoped lint/typecheck as available, do not run a competing build or start browser/services.

## Task 4: integration and release — coordinator + Claude review lane
- [x] Independently inspect full diff, run all isolated regression suites and new tests, typecheck, lint and production build.
- [x] Request read-only Claude review, resolve critical/important findings, repeat only affected gates.
- [x] Backup production privately, read-only legacy discovery (surface any actual ambiguous rows before suppressing), additive migration and idempotent baseline.
- [x] Deploy with publication delivery disabled, re-run baseline after cutover guarded against old-worker races; verify no customer content changed.
- [x] Enable drain after checks, verify public/admin HTTP/assets/availability and empty cron batch without modifying customer works.
- [x] Commit only owned changes and push, document result, delegation lanes and real browser verification limits.
