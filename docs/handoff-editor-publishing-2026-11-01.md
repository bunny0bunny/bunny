# Assigned editor publishing — implementation handoff

## Approved behavior

The administrator creates a series and assigns contributor/editor accounts. All assigned staff can prepare chapters. A separate administrator-controlled, default-off `SeriesAssignment.canPublish` grant permits an assigned editor to approve and publish an exact chapter revision immediately. Public translator/team identities grant no account permissions. Standalone approval, scheduling, cancellation, withdrawal, deletion and series settings remain administrator-managed.

Editors must submit a draft for review before using the combined publish action. A second reviewer is optional; an editor may publish their own preparation with the grant. Combined approval/publication is atomic and uses the existing publication outbox. Scheduled revisions are locked against non-administrator mutation. Editing an approved unscheduled revision resets approval and notifies administrators. Private generic staff notifications report publication, scheduling and withdrawal without draft titles or review reasons in previews.

## Rollout

Implementation is completed and verified locally; production release remains pending. Before deployment, apply additive migration `20261101120000_editor_publishing` and regenerate Prisma/Worker clients through the existing build process. Existing assignments default to no publishing grant. No production database changes, fake accounts/content, migration application or deployment are part of this implementation turn.

## Verification approach

The user requested less repetition. Delegates implement focused tests; coordinator reviews the combined diff and runs consolidated isolated PostgreSQL migration/regression, scoped lint and TypeScript validation. A production build was attempted once and bounded when compilation became excessively slow; completing it is a release gate. Only failures or material follow-up changes justify reruns. Final results will be recorded here.

## Results

- Isolated PostgreSQL coverage: **22 suites / 165 distinct tests**, zero unresolved failures. The initial full run exposed an old scheduled-upload expectation and fixture publication-outbox leakage. Only test fixtures were corrected; the three affected suites (editor publishing, media uploads and publications) were rerun successfully together. No production logic changed after the full run.
- Evidence: `.local-preview/test-tmp/bunyora-trash-qa-qkGWtb/report.json` (initial full run), `.local-preview/test-tmp/bunyora-trash-qa-N5xnJS/report.json` (successful focused rerun), and `.local-preview/readiness-audit/editor-publishing-final-tests.json` (combined coverage).
- Prisma client generation succeeded in the coordinator environment. Delegate syntax checks passed. A delegated early DB check was blocked by Windows process permissions before tests started; its temporary-schema generation attempt was cancelled after a package-discovery warning. Coordinator verification supersedes those attempts.
- Source review covered fresh transaction authorization, exact revision/version checks, grant revocation, atomic outbox/audit/notifications, scheduled locking including PDF mutation paths, and UI capability/confirmation guards. No new browser run was performed for this change.
- Scoped ESLint passed on the changed TypeScript/TSX and new test file. The single production Cloudflare build attempt was stopped during prolonged webpack compilation; it did not complete. Current artifacts are NOT deployable; any previous Worker entry was quarantined under ignored audit artifacts. A fresh successful `npm run cf:build` is required before deployment. Full `npm run typecheck` (`tsc --noEmit`) passed with exit 0 as the lighter local integration gate.

## Release boundary

Local implementation checks are complete. No GitHub push, production migration application or deployment was performed. Before release, complete a fresh Cloudflare build, apply the additive migration, deploy, and perform a short live smoke check. Do not reuse the interrupted build artifacts.
