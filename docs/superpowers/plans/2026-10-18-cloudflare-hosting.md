# Cloudflare hosting implementation plan

> Execution: follow the configured implementation delegation lane for bounded code changes; coordinator owns credentials, service operations, final checks and commits. Claude debate review completed before implementation. User authorized deployment and GitHub automation; billing changes are not authorized.

**Goal:** run the existing library on the client's Cloudflare Workers account while preserving accounts, authorization, reader functionality and private media.

**Architecture:** keep Next.js through OpenNext, with a Workers-compatible Prisma client/driver and request-safe connection lifetime. Keep the existing Node development path. Store runtime secrets in Cloudflare, not Git. Use GitHub integration on the new client repository for successful main builds only.

## Constraints and findings

- Work only in the client checkout and account; source Neon/Vercel remain untouched.
- Cloudflare OAuth is now authenticated against the R2 account; bucket S3 credentials alone were insufficient for Workers deployment.
- vinext compatibility check reported NextAuth incompatible; do not migrate auth frameworks to change hosting.
- OpenNext 1.20.12 requires Next >=16.4.1 or >=15.5.28 <16. Update only to the minimum compatible Next 16 release and matching ESLint config.
- Prisma remains 6.19.3. Preserve interactive transactions and password verification. Never weaken hashing/CSP or cache authenticated HTML.
- No Workers Paid activation, paid Images binding or paid processing resources. Stop for an informed billing decision if free limits fail.
- R2 upload/PDF preparation is not implemented. A storage binding must not be represented as functional admin uploads.
- Current `public/series` PDFs must not appear in deployed static assets. Git ignores do not enforce deployment privacy.

## Tasks

- [x] Compatibility/configuration: pin supported adapter/tool versions; add Cloudflare build/preview/deploy commands and config. Preserve Node commands. Build without leaking local environment files or native query engine binaries.
- [x] Runtime adaptation: Workers Prisma driver with safe I/O lifetime and transaction semantics; platform-safe OG fonts and legacy filesystem behavior; prove SMTP compatibility or report a blocker. Do not add a whole media subsystem.
- [ ] Meaningful verification: targeted runtime/authorization/asset exclusion tests, typecheck/lint, one Node regression build and one Workers build. Measure compressed size. Workerd smoke covers database, login, CSP/admin guard, readers, OG and SMTP transport authentication without sending messages.
- [ ] Account deployment: deploy only if feasibility gates pass; set minimal runtime secrets privately; validate the account and remote runtime. Temporary probes are separate from the application and must be cleaned up.
- [ ] GitHub automation: connect only `bunny0bunny/bunny`, main production branch, exact Cloudflare build/deploy commands and correctly separated runtime/build secrets. Direct CLI deployment does not establish auto deployment. Verify a successful commit-triggered deployment before claiming automation works.

## Acceptance and limits

No claim of production readiness or automatic uploads based solely on a successful build, R2 HEAD, or CLI upload. If publishing is blocked by account grants, runtime incompatibility or free-plan limits, retain a reviewable branch and report the exact evidence and remaining action.

2026-10-19 checkpoint: OpenNext build, TypeScript, targeted lint, eight database tests and local Workers acceptance checks passed. Minified bundle is 3,677.22 KiB gzip, above the free limit. No paid activation or application deployment occurred. Node release regression, positive real-account login and remote/CI acceptance remain pending after the hosting decision. See `../reports/2026-10-19-cloudflare-hosting-verification.md`.

2026-10-19 approved follow-up: prepared social cards reduced the Worker to 2,929.51 KiB gzip. Full Workers build/typecheck, focused lint, 14 tests/70 assertions, unchanged-image preparation and local/remote stored-image checks passed. The application was deployed to the client Workers URL, with encrypted runtime bindings and 17 ms startup. Home, database, series, reader, share metadata/PNG, anonymous guards and private-file exclusion were checked remotely. No paid plan was activated. GitHub automatic builds remain unconnected because the controlled dashboard browser is unavailable; positive real-account login, sustained capacity checks and the separate R2 upload implementation remain outstanding. The earlier size blocker is resolved for this build.
