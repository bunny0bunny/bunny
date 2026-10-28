# Reader presentation implementation plan

> For agentic workers: use subagent-driven-development task by task. User approved the design and explicitly requested the configured fleet; coordinator reviews, commits and deploys. No new approval needed for this authorized scope.

**Goal:** Safe manga layout choices, publisher defaults and image-relative reader progress.
**Architecture:** Existing separate readers with focused shared position helpers; additive Series defaults/ReadingProgress offset, existing direction lifecycle and canonical formats retained.
**Tech Stack:** Next16, React, Prisma6/PostgreSQL, Cloudflare, Bun.
**Spec:** docs/superpowers/specs/2026-10-28-reader-presentation-design.md

## Global constraints
Use existing checkout to conserve disk; no concurrent edits to owned files. Preserve unrelated untracked files. English work titles primary, Arabic UI. No dependency/service/format migration or media pipeline changes. Delegates never read .env, secrets, backups, run production commands, seed real databases, commit, push or deploy. Read local Next16 docs before code. New tests run through isolated harness only. Default CLI permissions remain; failures surfaced, no bypass. Existing paid Worker cron/publication delivery and guards preserved.

## Task 1 — coordinator schema/contracts
- [x] Add Series.defaultPresentation enum and defaultReadingDirection, ReadingProgress.pageOffset Float?; generate additive migration offline and clients, never db push.
- [x] Extend ReaderProgress and LocalProgress optional nullable offset and validation without breaking old entries; define UI/backend contracts.
- [x] Read-only preflight and private production backup before rollout.

## Task 2 — Codex implementation lane: backend
Own src/lib/actions.ts, src/lib/queries.ts, tests/team-access/reader-presentation.test.ts only. Consume schema from Task1. Add optional validated series defaults to upsertSeries (manga only, retain on omitted edits); new chapter omitted direction uses actual series default server-side; published direction lifecycle untouched. Add optional nullable bounded pageOffset to authenticated save, preserve completed=true on reread, include offset in getReaderProgress. Keep auth, locks, format guard and unrelated actions. Write meaningful isolated integration tests first, run via coordinator harness, report failures honestly.

## Task 3 — Antigravity UI lane
Own src/components/readers/manga-reader.tsx, webtoon-reader.tsx, reader-tools.tsx; new focused reader presentation/position/preferences helpers and tests/media/reader-presentation*.test.*; src/components/admin/admin-client.tsx, src/components/studio/editorial-editor.tsx; src/app/admin/chapters/new/page.tsx, src/app/admin/series/[id]/page.tsx, src/app/read/manga/[series]/[chapter]/page.tsx. No backend/schema mutations. Implement approved defaults/clear labels, reader layout/reset/fit, content-relative progress and offset, legacy restoration. No universal reader rewrite. Read impeccable and local client docs; tests first for geometry/preference invariants. No fake gesture interaction tests. No competing full builds. Report realistic browser verification limits.

## Task 4 — coordinator integration and Claude review lane
- [x] Inspect all changes and tests; independent new unit tests and all isolated PostgreSQL regressions, scoped lint and typecheck.
- [x] Read-only Claude review; resolve important gaps and rerun affected gates.
- [x] One memory-bounded Cloudflare build, private asset/secret checks; browser check through configured available tooling only.
- [x] Backup, additive migrate, data preservation checks, deploy, hosted pages/assets and actual cron checks (no real content mutation).
- [x] Complete handoff, explicitly stage owned files, commit/push and verify remote SHA. Preserve prior unrelated files.

## Fleet fallback ruling
Use configured lanes and models unchanged. If a CLI explicitly denies reads/writes, do not bypass permission settings or retry disguised commands. Surface the failure and complete the authorized bounded task using native delegated agents or coordinator, with the lane failure documented. The user authorized delegation and completion, not permission bypass.
