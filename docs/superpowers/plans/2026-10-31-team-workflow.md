# Team Workflow Implementation Plan

> Use test-first implementation and verify each task against the approved role review.

Goal: finish the existing administrator-managed contributor/editor journey without granting public translator identities account permissions.

Scope approved in chat: atomic chapter-create authorization; clear Arabic onboarding; private in-app workflow notifications. Public translator ownership/team self-management remains a separate optional extension. Initial implementation was local; the user subsequently authorized deployment on 2026-11-01. No live database/content changes are required.

1. `src/lib/actions.ts`, isolated authorization tests: re-read the authenticated profile, verification, auth version, role and series assignment inside the same Serializable transaction that creates a chapter. Reapply privileged-field restrictions using that fresh role. Fail closed on revoked permissions. Test a deterministic revocation immediately before transaction entry plus normal assigned creation.
2. `src/lib/editorial.ts`, new focused notification helper and isolated tests: insert generic system notifications atomically with successful submit/recommend/return transitions. Submit recipients: active verified administrators and assigned editors; recommend: administrators; return: assigned contributors/editors. Exclude actor/readers/disabled/unverified/unassigned staff. Existing version checks prevent duplicate successful replay; failed/stale transitions produce no notifications. No draft titles, reasons or body in notification previews. Links use protected studio routes; no emails.
3. Contributor dashboard and administrator assignment/identity screens: explain account role versus assignment versus public credit; show create/upload/preview/review/publish responsibilities and links to existing entry points. Keep English work titles primary and Arabic UI. Hide or disable inappropriate start actions when there is no assignment.
4. Run isolated PostgreSQL harness with focused/new suites and regression coverage, scoped ESLint and TypeScript. Review source diff and document actual checks and any remaining browser QA limitations. Do not claim translator self-service is implemented.

Completed implementation and local verification; see `docs/handoff-team-workflow-2026-10-31.md` for results. The remaining browser resubmission leg passed on 2026-11-01, and the user authorized release on that date. Production release verification is recorded in the handoff.
