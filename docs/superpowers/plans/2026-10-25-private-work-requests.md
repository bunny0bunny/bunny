# Private Work Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, with a combined independent review and bounded follow-up per established review agreement.

**Goal:** Private reader work requests with own tracking, admin replies/grouping/status and transactional in-app notifications.
**Architecture:** Additive ContentRequest flat grouping model, server service enforcing owner/admin boundaries, same-origin HTTP mutations, existing verified sessions and system notifications, native React forms and existing design system.
**Tech Stack:** Next16.4.1, React19, Prisma6.19.3, Neon PostgreSQL, Cloudflare/OpenNext.
**Spec:** docs/superpowers/specs/2026-10-25-private-work-requests-design.md

## Global constraints and rulings
- Original checkout, isolated feature branch (no extra worktree per user's space preference). Preserve unrelated untracked files. No existing-content deletion, seed/reset or real chapter publication. Additive migration only, isolated rehearsal and private snapshot first.
- Read installed Next route-handler docs before source edits. Follow PRODUCT.md/DESIGN.md. No new service/dependency or external message sending.
- Red/green meaningful authorization and behavior tests, not style-mirroring tests. One owner per file. No broad concurrent lint/TypeScript/build jobs.
- Spec is approved by user choosing private requests then saying “ok do it”; implementation and routine integration choices are authorized. No additional design approval gate needed.

## Shared interfaces (backend owns contracts.ts)
File `src/lib/content-requests/contracts.ts` exports RequestStatus (`new|reviewing|preparing|available|declined`), REQUEST_STATUS_LABELS and CATEGORY_LABELS (Arabic), ReaderRequest, AdminRequestSummary, AdminRequestDetail, CatalogWork, RequestResult<T> = `{ok:true,data:T}|{ok:false,error:string}`.
- ReaderRequest `{id,title,category,referenceUrl:string|null,message:string|null,reply:string|null,status:RequestStatus,statusNote:string|null,createdAt:string,updatedAt:string,availableSeries:{id,title,href}|null}`. No internal/profile/group identifiers.
- AdminRequestSummary `{id,title,category,status,requesterCount:number,version:number,createdAt:string,updatedAt:string}`.
- AdminRequestDetail extends summary with `{statusNote:string|null,seriesId:string|null,members:Array<{id,nickname,title,referenceUrl:string|null,message:string|null,reply:string|null,internalNote:string|null,version:number,createdAt:string}>,mergeTargets:Array<AdminRequestSummary>,workOptions:Array<CatalogWork>}`. Work options public series only, bounded200 for present catalog, label explicit search availability if capped.
- CatalogWork `{id,title,href,category:string|null}`.
Service `src/lib/content-requests/service.ts` exports:
`createContentRequest(input:{title,category,referenceUrl?,message?,submissionId}):Promise<RequestResult<{id:string,duplicate:boolean}>>`
`listMyRequests(input?:{page?:number}):Promise<RequestResult<{items:ReaderRequest[],page:number,pages:number,total:number}>>`
`getMyRequest(id:string):Promise<RequestResult<ReaderRequest>>`
`listAdminRequests(input?:{q?:string,status?:string,page?:number}):Promise<RequestResult<{items:AdminRequestSummary[],page:number,pages:number,total:number,newCount:number}>>`
`getAdminRequest(id:string):Promise<RequestResult<AdminRequestDetail>>`
`getAdminNewRequestCount():Promise<number>` (0 for unauthorized; no private counts leaked)
`findRequestCatalog(q:string):Promise<CatalogWork[]>` (public published works only, max8)
`updateRequestStatus(input:{id,expectedVersion,status,statusNote?,seriesId?}):Promise<RequestResult<{id:string}>>`
`replyToRequest(input:{id,expectedVersion,reply,internalNote}):Promise<RequestResult<{id:string}>>`
`mergeContentRequests(input:{sourceId,targetId,expectedSourceVersion,expectedTargetVersion}):Promise<RequestResult<{id:string}>>` returns target root.

HTTP controller (root owns route.ts files) wraps scope/guard and uses JSON `{ok:true,...data}` or safe `{ok:false,error,code}`:
POST `/api/content-requests` create; GET `/api/content-requests/catalog?q=...` public catalog; POST `/api/content-requests/[id]/status` body expectedVersion/status/statusNote/seriesId; `/reply` body expectedVersion/reply/internalNote; `/merge` body targetId/expectedSourceVersion/expectedTargetVersion. Client sends content-type JSON and X-Bunny-Request:1. Admin pages and reader pages call service inside withDatabaseScope and apply normal login/admin checks. UI mutation helper never silently replays a POST; submissionId stabilizes manual create retry.

## Tasks
- [x] 1. Backend owner: schema/migration, contracts, pure input policy, transactional service+privacy serialization+notifications; meaningful red/green unit/service/real DB tests. Own `prisma/schema.prisma`, new migration, `src/lib/content-requests/**`, `tests/content-requests/**`, `tests/team-access/content-requests.test.ts`. Do not edit src/app routes/components/layouts. Coordinate generated-client timing with root; don't run broad checks/deploy/commit.
- [x] 2. UI owner: reader form/list/detail, admin list/detail/status/reply/merge controls, discover/account/admin navigation and badge. Own `src/app/requests/**`, `src/app/admin/requests/**`, new `src/components/content-requests/**`, explore page, existing header/account nav, admin layout. Consume exact interfaces above. Read Impeccable context once and craft-floor before edit; meaningful client tests can live `tests/content-request-ui/**`. No schemas/backend/API mutation routes. No commits/deploy/broad TS/build.
- [x] 3. Root: HTTP controller boundary red/green tests, route handlers, login destination if needed; regenerate clients, isolated local full-migration rehearsal/real transaction tests, consolidated scoped lint/TS, independent combined review with bounded fixes.
- [x] 4. Root: full Cloudflare build/private-artifact scan, private snapshot+versioned production additive migration+preservation checks, safe deploy, reader/admin browser and hosted privacy acceptance with exact owned-fixture cleanup, public smoke, commit/fast-forward/push, final handoff.

## Verification evidence before deployment
- HTTP controller 7 tests / 48 assertions, backend unit 6 tests / 18 assertions, UI 12 tests / 45 assertions passed independently (mock isolation).
- Full migration rehearsal on isolated PostgreSQL preserved all six legacy tables and started ContentRequest empty. Actual request integration 8 tests / 76 assertions and existing role boundary 1 test / 2 assertions passed. Total 34 focused / real database tests passed.
- Consolidated scoped ESLint and direct TypeScript passed. Diff whitespace check passed after removing extra schema EOF blank line.
- Independent combined review found one P2 no-op admin-save lock. UI fixed with route transition lock and two red/green regressions; bounded reviewer confirmation clear.
- Ruling: admin private replies and internal notes remain per original submission after merging; only statusNote is shared. Caller-visible DTO excludes group/user/internal identifiers. Request body cap16KiB accommodates valid multilingual fields while bounding raw reads.

- Final client boundary: default 30-second deadline covers stalled fetch and response parsing even when an adapter ignores abort; two focused red/green regressions passed. No automatic mutation replay. A copy correction clarifies that readers can read the administration reply (no chat/reply feature is promised).

## Production acceptance
- Worker version `244b511b-d334-4b2e-91fa-5f44cabe1d04` deployed at 100%. Additive migration applied after snapshot; final integrity preserved every original row in eight tables.
- 38 hosted acceptance checks and seven public smoke routes passed. Actual browser form, status/reply saves, private reader view, and confirmed merge passed; 390px reader screenshot inspected.
- All synthetic and browser-owned request fixtures and notifications removed, existing account/session retained. Full evidence and operational limits: docs/handoff-private-work-requests-2026-10-25.md.
