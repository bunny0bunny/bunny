# Content trash implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review the scoped tasks below. Work in the existing checkout because the user requested conserving local disk space; preserve unrelated untracked files.

**Goal:** Admin-only chapter/series trash, 30-day recovery, draft-only restoration and durable retryable file-first permanent deletion.

**Architecture:** Add nullable soft-delete markers to Series/Chapter and a durable ContentTrash journal. A series batch marks only currently active children so restoration never revives independently trashed chapters. Purging is an irreversible fenced state; object deletion progress remains journaled until storage succeeds and dependent database rows can be finalized. Accounts and private requests survive. Existing private requests retain an explicit unavailable-work indication. English-first title display applies to dialogs and trash rows.

## Shared storage/API contract

- Series/Chapter: `deletedAt DateTime?`, `trashBatchId String?` with indexes. Existing content defaults active.
- ContentTrash: `id`, unique nullable `activeKey`, `entityType` (`series`/`chapter`), `entityId`, `seriesId?`, `title`, `deletedById?`, `deletedAt`, `purgeAfter`, `state` (`trashed`/`purging`/`purged`/`restored`), `version`, `objectsJson` JSON default [], `detailsJson` JSON default {}, `errorCode?`, `purgeStartedAt?`, `purgedAt?`, `restoredAt?`, `createdAt`, `updatedAt`. No cascading relation: journal survives deletion.
- `src/lib/content-trash/contracts.ts`: `TrashKind`, `TrashPreview` {kind,id,title,confirmation,updatedAt,chapterCount,publishedCount,uploadCount,bytes}, `TrashItem` {id,kind,entityId,seriesId,title,deletedAt,purgeAfter,state,version,chapterCount,bytes,errorCode,parentUnavailable}, `TrashResult` {ok,error?,id?}.
- Service exports `getTrashPreview(kind,id)`, `listTrash()`, `moveToTrash({kind,id,expectedUpdatedAt,confirmation})`, `restoreTrash({id,expectedVersion})`, `requestPermanentDelete({id,expectedVersion,confirmation})`, `maintainContentTrash({limit?,objectLimit?,now?})`.
- Admin server actions in `src/lib/content-trash/actions.ts` wrap the mutation exports with equivalent names. Preview is a server action as well. Avoid exposing raw R2 keys in client DTOs.
- Chapter confirmation: `الفصل <number>`; series confirmation: exact primary English/fallback title. Immediate purge confirmation: journal title, displayed explicitly in dialog. All destructive confirmations validated server-side with fresh authorization/version checks.
- Garbage collection processes bounded batches via existing authenticated cron route, with persisted retries. Never report permanent success while files remain. Any in-flight upload/cover write is fenced and cannot attach to trashed content; consider write expiry/grace and late-write cleanup before finalizing deletion. Shared external references block purge before deleting bytes. Preserve unmanaged/static `/art` files. Include managed series cover objects; historical cover cleanup must be safe and documented.

## Tasks and ownership

- [ ] Primary: additive migration/schema + contracts; regenerate clients, verify empty/default compatibility. Own migration, plan, integration runner and deployment.
- [x] Backend implementer: content-trash policy/service/actions, bounded durable R2 purge, dedicated integration tests. Pause existing source/orphan cleanup on trashed entities. No production data mutation or deploy. Do not edit query/UI guard files.
- [x] Guard implementer: all public/admin read scopes and mutation/upload/publish fences in queries/editorial/actions/media API/retention/cover paths; private-request unavailable indication. Ensure scheduled publisher and old in-flight callbacks cannot revive content. Write focused tests. Do not edit trash service/UI/schema.
- [x] UI implementer: chapter/series delete buttons, preview/typed confirmation, trash listing + restore/permanent-delete actions, status/error states and admin-only navigation. Preserve format lock when any chapter history remains; show only active children in ordinary lists. Own relevant UI pages/components only.
- [x] Primary + reviewers: resolve task interfaces, run isolated PostgreSQL integration tests (never seed production), authorization/concurrency/storage failure/retry/shared-reference scenarios, typecheck/lint/build, review complete diff.
- [x] Primary: backup production before additive migration; migrate with current code still compatible; publish after checks; HTTP/asset checks only against production, never trash actual customer content to test. Document release and any actual verification limits.

## Required invariants/tests

Admin-only endpoints and fresh role checks; stale version conflicts; no reader/catalog/media/scheduler visibility after trash; active uploads cancelled and late completion fenced; no incidental cleanup of recoverable files during retention; draft-only restore; independent child trash stays deleted on parent restore; no renumbering/URL changes for retained content, with slugs/numbers reserved during recovery; requests/accounts preserved; shared file reference guard; permanent object failures retry with records retained; idempotent concurrent maintenance; all relevant files removed before DB cascade, and durable audit afterward; original PDF's separate retention resumes appropriately after restoration.

## Rulings

- Reuse the existing checkout and existing paid Worker/cron/R2. No new service or dependency is needed.
- Keep deleted content's interactions during the recovery window. Hard deletion removes work-owned interactions and preserves account/security/private-request records.
- Readable signed media URLs already issued can remain valid until their short expiry; stable gateway/new reader requests must deny trashed content immediately. Do not promise recall of already downloaded data.
- Early permanent deletion of stored media waits until at least 24 hours after trash (or upload expiry + 1 hour) before removing bytes; the UI shows the not-before date. File-free content can finalize immediately. Normal 30-day expiry already exceeds this upload grace.
- Preserve historical published revisions and create a fresh draft on restore. Pending review/approval is withdrawn, not relabeled as historical publication.
- The broad regression fixture resends signup with the same requested destination so its verification assertion tests the requested destination rather than a newer mail's default route. Application account behavior is unchanged.
