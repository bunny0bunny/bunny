# Admin foundation gaps implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement these bounded tasks, then one combined package review and focused verification.

**Goal:** Correct the six operating gaps approved after the discovery report without deleting mock or real content.
**Spec:** `C:/Users/user/Documents/Codex/2026-10-23/bunny-content-readiness/outputs/admin-foundation-discovery-2026-10-24.md` and the user's instruction to fix the gaps.
**Architecture:** Keep public Chapter publication separate from the latest ChapterRevision editorial state. Keep existing Next Server Actions, private R2 storage and transactional role checks. Preserve deployed routes and data.
**Tech Stack:** Next16.4.1, React19, Prisma6, Cloudflare/OpenNext.

## Constraints and rulings
- Work in the original authorized client checkout, on `fix/admin-foundation-gaps`; preserve pre-existing untracked files. Earlier user checkout preference takes precedence over creating another worktree.
- No production content deletion, reseed, migrations, paid integrations or actual chapter publication. Existing deployment authorization persists, but verify before publishing changes.
- User approved the concrete discovery recommendations; do not request another design approval.
- Scope is these existing flows, not a redesign. One combined independent package review, respecting the user's established bounded-review preference.
- Tasks1 and2 share admin presentation interfaces: Task1 owns queries/admin route files and ChapterWorkflowControls only; Task2 owns SeriesForm/ChapterForm and editorial editor. Coordinate exact types; do not overwrite each other's chunks.

## Tasks
- [x] 1. Regression-test editorial counts, filters and row status/pages; derive latest working revision with legacy fallback. Correct featured collection filtering and real featured-work selection. Keep publication status distinct.
- [x] 2. Correct creation recovery and duplicate-submit handling, useful empty creation guidance, and unsaved-change protection/recovery for series/chapter/editor text without persisting private media or introducing stale version overwrites.
- [x] 3. Reject reading-format changes once chapters exist, return structured duplicate-slug errors, and verify role/transaction boundaries. Unit/actual-module regressions first.
- [ ] 4. Make scheduling truthful and operational using the current paid Worker: authenticated bounded periodic execution, tests for auth, failure and due publication. If automatic execution cannot be safely connected, keep manual scheduling explicitly labeled and document the limitation rather than promising automation.
- [ ] 5. Run focused regressions, TypeScript, scoped lint and one combined code review. Fix material findings, then verify the Cloudflare build/deployment if authorized and feasible. Record exact remaining device/browser limits.

## Acceptance
Review submission and replacement drafts display the same working state across admin/studio; published copies stay readable. Existing chapter formats cannot change accidentally. Featured switches affect the real home query. Known duplicate slugs remain editable; network failures recover without blind mutation replay. Unsaved text survives reload or warns before leaving. Scheduled execution is accurately described and tested. No mock removal occurs.

## Verification record
- 67 focused tests passed: scheduler/auth/metadata16, discovery/upload-recovery/worker-scope26, admin query/presentation9, form/recovery16.
- Direct local TypeScript passed. Scoped ESLint passed, including final helper/form changes. Whitespace check passed.
- Combined independent review corrected repeat-save gate, browser-history text recovery and the real empty-state route. A scoped follow-up corrected cross-work recovery overwrites; no material findings remain.
- Production read-only preflight: zero scheduled/due revisions; existing app-origin/self binding and CPU30000ms present. Provisioned encrypted cron secret without printing or storing its value.
- Cloudflare production build, its TypeScript pass and private-asset/runtime-secret scanner passed. Hosted acceptance pending. Browser automation unavailable in this session; component/handler fixtures and hosted HTTP checks do not substitute for Safari/mobile/browser file-picker verification.
