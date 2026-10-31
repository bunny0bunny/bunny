# Contributor and editor workflow — release handoff

## Status

Implementation completed locally on 2026-10-31; the user authorized publishing on 2026-11-01. Published and verified on 2026-11-01. No database migration is required. Public translator identities remain administrator-managed credits/profiles; they do not grant account permissions. Profile ownership and team self-management remain a separate optional extension.

## Changes

- Chapter creation now rechecks role, account verification, disabled status, authentication version and series assignment in the same Serializable transaction as the write. A freshly demoted administrator cannot retain premium-content privileges. Revoked access produces a clear Arabic form error.
- Staff dashboards/studio include an expandable Arabic creation/upload/preview/review guide. Unassigned staff do not see start-chapter actions. Assignment and translator administration explain account roles versus assignments versus public credits. The staff sidebar links directly to notifications.
- Successful submit/recommend/return transitions insert existing `system` notifications atomically with the revision and audit event. Submit alerts go to enabled verified administrators and assigned editors; recommendations go to administrators; requested changes go to assigned contributors/editors. The actor is excluded. No emails are sent.
- Notification previews contain no draft title, work name or review reason. Links go through protected studio access checks. Stale/replayed requests produce no duplicate alerts; notification insertion failure rolls back the transition.

## Verification

- Entire isolated PostgreSQL regression: **21 suites, 149 tests passed**, including existing media-upload, PDF, account, editorial, publication, download and security suites. Evidence: `.local-preview/test-tmp/bunyora-trash-qa-ZNIebS/report.json`.
- Expanded notification suite after adding full return/edit/resubmit coverage: **8 passed, 242 assertions**. Evidence: `.local-preview/test-tmp/bunyora-trash-qa-pcpsZv/`. This adds one distinct test beyond the full regression run; no production logic changed after that run, only the chapter form's Arabic error message.
- Deterministic account/assignment revocation tests: **4 passed, 19 assertions**. They use Prisma query extensions and assert the revocation hook actually ran; the initial attempted transaction spy was unreliable and replaced. Evidence: `.local-preview/test-tmp/bunyora-trash-qa-OezRMv/`.
- Full TypeScript check and scoped ESLint passed on the final source. Independent source review found no access/privacy/idempotency issue; its unassigned-studio-CTA finding was corrected.
- Tabbit browser checks passed against a loopback-only disposable database: contributor welcome/dashboard, guide and 390px overflow check, assigned-only series selector, decimal chapter creation, editing, preview and submission; assigned editor received a generic alert, opened the protected draft and requested changes. Both accounts lacked publishing controls.
- The initially unfinished contributor alert/resubmission browser leg was rechecked successfully on 2026-11-01 using a focused fixture seeded in returned-for-changes state: the contributor received the generic alert, opened the protected chapter, edited and saved version 5, then submitted version 6 for review. This complements the earlier creation/submission/editor-return browser checks; it was not a single uninterrupted browser run. Evidence: ignored `team-release-browser-report.json`. Novel fixtures were used; live R2/PDF upload was not repeated. Existing isolated upload tests passed.
- Owned QA server/database processes were stopped, fixture users/content cleaned before regression, local QA auth cookies cleared, and the acquired QA page closed. An earlier retained scratch-tab ID was no longer available to acquire. No production browser tab was modified.

## Release

Release checks on 2026-11-01: a fresh 21-suite isolated PostgreSQL run passed **150 tests**, and final scoped ESLint passed. Evidence: `.local-preview/test-tmp/bunyora-trash-qa-gRskec/report.json`. Local fixtures/accounts were cleaned, the QA server/database stopped, and the browser task finished. Production Cloudflare build (including TypeScript and artifact secret checks) and deployment passed. Active Worker version: `953a8755-ae6a-42f1-8647-cef327aa4693`. Read-only hosted checks passed on both `https://bunyora.com` and the Worker URL: home, explore, a published series and its reader returned 200; 25 public JavaScript assets per host matched the release build; admin/studio/notifications required login (HTTP or Next.js streamed redirects); guest notification feed was empty. Evidence: ignored `team-release-hosted-report.json` and `team-release-hosted-bunyora.com.json`. The minute cron and existing bindings were preserved. No production fixtures, account changes, schema migrations or content mutations were made. Administrator approval, scheduling and publishing authority stay unchanged.
