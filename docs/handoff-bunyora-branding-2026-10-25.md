# Bunyora branding — 25 October 2026

Implemented in `ceb7e36` and deployed to the existing site at https://bunny.bunny-library.workers.dev. Worker version `c32f949b-2901-48df-8322-e216539e3225` was verified at 100% traffic.

The public English name is **Bunyora Library**, and the Arabic name is **مكتبة بانيورا**. Updated header/footer, admin and account branding, page titles, application/Open Graph metadata, sharing text, team/avatar labels, account mail subjects and invitation text. Legacy SMTP display names are converted to the new brand without changing the sender address or credentials. Tests use a mocked transport; no email was sent.

The existing founder-provided rabbit/B logo remains intact. URLs, Worker/service/R2 identifiers, runtime environment names, request headers, avatar values and local progress/draft keys remain unchanged. Existing accounts, content and historical records were not rewritten. The exact legacy seeded-bio matcher remains intact to avoid exposing that old placeholder or hiding a reader's own biography. Future seed welcome copy was updated, but no seed or migration was run.

The share-card renderer version advanced to 2. Twelve public-work cards and a new `/share/bunyora-default.png` fallback were generated through the existing renderer using read-only public metadata. New asset paths avoid reusing legacy image caches; old PNG URLs remain available for compatibility. The new fallback and a work card were visually inspected locally.

## Verification

- Five mocked SMTP sender tests / ten assertions passed, including the unchanged delivery address. Three rename cases were observed failing before the implementation.
- Six stored-share tests / 27 assertions passed. The new fallback contract was observed failing before the asset-path change.
- Direct TypeScript, scoped ESLint, diff checks and the Impeccable detector passed. One independent combined review found no actionable P0/P1/P2 issue.
- Full Cloudflare build, private-artifact/secret scanning and deployment completed with exit code 0. An interrupted earlier build was discarded as incomplete and restarted; only the completed build was deployed.
- 21 hosted brand checks passed across home, explore, login, registration, application/Open Graph metadata and image delivery. The work/fallback image responses matched the new local PNG bytes exactly.
- Seven existing public smoke routes passed. Scheduler, R2/self/database bindings and the 30,000ms CPU limit were verified unchanged.
- Final integrity checks matched every original row in eight production tables; unrelated new rows were retained.

Browser limitation: Tabbit returned `BROWSER_RUNTIME_UNAVAILABLE` before the desktop/mobile program could execute. A diagnostic attempt did not restore its service. No screenshots, responsive measurements or live admin-browser acceptance are claimed for this rename. The deployed pages and share images were verified through HTTP, and the generated share PNGs were inspected directly. No browser backend was substituted or user's browser restarted.

Detailed private build/deploy logs and hosted reports remain in ignored `.local-preview/readiness-audit/`. No secrets, database snapshots or private chapter files were committed.
