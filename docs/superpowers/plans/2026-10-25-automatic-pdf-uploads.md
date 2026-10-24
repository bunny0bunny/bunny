# Automatic PDF uploads implementation plan

> Use superpowers:subagent-driven-development for independent tasks, with one combined independent review and bounded follow-up.

**Goal:** Every future PDF automatically receives readable compression, useful progress, safe resume, first-page cover suggestion and explicitly reviewed seven-day source retention.
**Spec:** C:/Users/user/Documents/Codex/2026-10-23/bunny-content-readiness/outputs/pdf-upload-review-and-prompt-2026-10-25.md, approved by the user's instruction to implement the general system on2026-10-25.
**Architecture:** Preserve sequential browser PDF.js rendering and existing private R2 upload protocol. Extend with streaming verified SHA256, versioned processing profiles and source-only retention. Keep legacy rows permanently retained by default. Public Chapter projection never changes on upload.
**Stack:** Next16.4.1, Prisma6.19.3, Cloudflare/OpenNext, PDF.js6.4.299.

## Rulings
- Use original client checkout on feature branch; prior user preference overrides creating another checkout. Preserve unrelated untracked files.
- User approved design and authorized normal implementation decisions, with discussion only for critical data/readability risks. Existing publish-code authorization persists.
- No existing source or media deletion, mock cleanup, reseed or real chapter publication. Additive migration permitted as part of approved retention/resume system; test locally and verify old defaults first.
- No new paid services. One combined package review, respecting established bounded review preference. Do not run parallel broad TypeScript/build jobs.
- Each implementer owns named files; controller owns uploads/storage/contracts/resume, final integration and deployment. Agents do not commit/deploy or mutate production.

## Shared protocol
- Processing profile: `balanced-v1` default (WebP0.80) or `high-v1` (0.85). JPEG fallback retained. Profile identity immutable per upload.
- StartUploadInput adds optional `sourceSha256:string`, `processingProfile`, `keepSource:boolean`. Missing fields retain legacy permanent/unresumable behavior. New UI explicitly sends false/default temporary and hash.
- UploadStatus adds sourceName,sourceBytes,sourceSha256:string|null,processingProfile:string|null,readyPageIndices:number[],pageBytes:number,keepSource:boolean,sourceReviewedAt:string|null,sourceDeleteAfter:string|null,sourceDeletedAt:string|null,sourceDeletingAt:string|null.
- POST `/api/uploads/:id/resume`: {expectedVersion,sourceSha256,sourceBytes,pageCount,processingProfile}; creator-only, latest assigned revision, matching immutable identity, unexpired. Returns normal UploadStatusResponse; never silently creates a new upload.
- GET `/api/uploads?revisionId=...`: {ok:true,upload:UploadStatus|null}, authorization scoped. POST `/api/uploads/:id/source-policy`: {keepSource:boolean,reviewed?:boolean}, returns same UploadStatusResponse.
- Schema ChapterUpload adds sourceSha256:String?,processingProfile:String?,keepSource:Boolean default true,sourceReviewedAt:DateTime?,sourceDeleteAfter:DateTime?,sourceDeletedAt:DateTime?,sourceDeletingAt:DateTime?,completedAt:DateTime?. Source removal only after explicit review+completion+seven days, never images. Deletion claim blocks simultaneous permanent retention; failures retry idempotently.
- PDF helper: openPdf(file,signal?,profile?) returns existing pageCount/renderPage/destroy plus sourceSha256. Profile type exported from browser-safe module. Server streaming digest verifies source bytes without buffering whole PDF.

## Tasks and test cycles
- [x] 1. PDF processing (agent): pure compression policy + pdf-client integration + isolated tests for balanced/high, source fingerprint, raster no-upscale detection fail-safe, aspect/pixel limits, JPEG fallback, sequential resource cleanup. Own src/lib/media/pdf-client.ts,new pdf-processing.ts,own tests. Red/green first.
- [x] 2. Retention (agent): additive schema+SQL migration, pure eligibility tests, source-policy/read endpoints, source-only bounded maintenance with deletion claims/locks, legacy defaults, periodic endpoint auth. Own schema/migration/new retention module/new policy+maintenance routes/tests. Do not edit uploads/contracts/storage/worker wrapper. Red/green first. Integrate GET/cron via controller.
- [x] 3. Upload UX (agent): consume shared protocol; preflight estimates distinctly labeled, profile default, actual cumulative bytes, source retention checkbox/review confirmation, resume with reselected verified PDF and skip verified completed indexes, first-page private cover suggestion linking existing cover editor. Own pdf-upload-panel/editorial-editor/studio route if needed/new client helpers/tests. No new cover model or silent public replacement. Read Impeccable context/craft floor before edits. Red/green first.
- [x] 4. Controller: contracts + streaming source digest + start validation/resume/read status + runtime maintenance integration + actual-module tests for mismatch/auth/expiry/stale revision/duplicate parts/source verification. Keep request scope and transactional roles.
- [ ] 5. Integrate: regenerate clients; direct local typecheck/scoped lint; focused regressions; combined independent review; additive migration rehearsal against isolated local DB; Cloudflare build and source-safe deploy if checks pass.
- [ ] 6. Hosted acceptance: synthetic isolated fixture for source retention/review/permanent/resume/mismatch, old-source defaults, original PDF draft-only import if correct target can be identified without guessing. No real publication/deletion; practical browser limits reported. Record measured sizes, migration/build/deploy IDs, cleanup exact fixture, push code.

## Acceptance
All45 supplied pages remain ordered/readable; compression has no fixed percent promise. Original PDF remains private and is optional permanent or reviewed temporary. Invalid resume cannot mix files/profiles/versions; existing public pages remain intact. No automatic retroactive deletion. UI reports actual server state and recovers after uncertain network results. Cover suggestion does not overwrite a public work without choice.

## Verification evidence
- Focused unit/route/UI regressions: 85 passed including final preflight identity and three compatibility asset regressions; isolated PostgreSQL migration and actual-module integration: 17 passed (102 total).
- Direct TypeScript and scoped runtime ESLint passed. Combined independent review findings resolved with bounded follow-up.
- Full supplied-PDF code integration: 45 sequential WebP pages, 18,444,702 bytes, unchanged original fingerprint; readable cover/middle/dense-text samples inspected. Native Node canvas is not browser encoding or file-picker acceptance.
- Additive migration rehearsal preserved legacy uploads permanently and all existing source rows. Cloudflare build, final TypeScript and private-artifact/secret scan passed. Production migration and hosted acceptance are recorded below when complete.

- Compatibility ruling: serve the matched official PDF.js legacy main and worker, including their built-in compatibility polyfills. Version+build marker invalidates earlier modern asset caches; three red/green regressions passed. This fixes a discovered modern-build loading failure without changing the PDF.js version. Real Safari/mobile interaction remains unverified.
