# Browser PDF import on Cloudflare Free

Supersedes the untracked 2026-10-18 Vercel/paid-container proposal for execution. The user approved the PDF → preview → editorial approval journey and explicitly approved browser preparation with the tab kept open, without a subscription, on 2026-10-19. No PDF editor, page reordering, archive import or unattended conversion service is included.

## Evidence and decisions

PDF.js 6.4.299 rendered all 45 pages of the largest supplied PDF (21.4 MiB) locally in 52.2 seconds at bounded 1440-pixel width; sample pages from all four other PDFs rendered too. Arabic was visually checked. Output for that chapter was 19,634,706 bytes. This is desktop evidence, not a mobile performance guarantee or peak-memory measurement. Supplied PDFs remain private local inputs. An isolated tiny R2 create-once probe returned 200, then 412 on overwrite and 403 when its signed condition was stripped; the exact probe object was deleted.

After one Claude architecture debate, choose same-origin bounded upload routes backed by the R2 binding. Each page uses one request; finalization checks registered ready rows in PostgreSQL, avoiding hundreds of HEAD/copy requests and the Workers Free per-request subrequest limit. The original PDF is retained privately using a bounded fixed-length stream, never buffered in full on Workers. Browser-rendered pages are contributor content: the server validates stored bytes/format/ownership, not equivalence to a trusted server-side PDF render. Admins review the actual final image preview.

PDF.js and its worker/fonts/CMaps/WASM are self-hosted static client assets, excluded from the Worker graph. JavaScript eval is disabled. Allow a self-hosted worker and WASM compilation only on studio chapter documents; do not add JavaScript unsafe-eval in production. Encode WebP when supported and fall back to JPEG when a browser returns another MIME (not PNG silently). Render/upload sequentially, release canvases, cancel on navigation, and show progress/error/restart. Closing the tab interrupts conversion; the server expires abandoned sessions, rather than promising a durable background job.

## Limits

Initial limits: source 30 MiB, 200 pages, page 6 MiB, 16,777,216 pixels, longest edge 16,000 pixels, aggregate source+page bytes 200 MiB/import. One active import per profile; at most 10 starts/hour and 512 MiB reserved upload bytes/profile/day. Configurable limits may be lowered, not silently exceeded. Session expires after two hours. Browser checks improve UX; server independently enforces counts, decoded header dimensions, MIME/signature, declared/actual length and authenticated quota. Images are WebP or JPEG only. Source PDF is header-checked, served attachment-only to authorized team members, and not claimed virus-scanned or fully parsed by the server.

## Model and lifecycle

Add ChapterUpload with cuid id, revisionId, chapterId, createdById, state(uploading/ready/failed/cancelled/superseded), sourceName, sourceBytes, expectedPages, reservedBytes, timestamps, expiresAt and errorCode. Add MediaAsset with cuid id, uploadId, chapterId, pageIndex (-1 for source, 0-based for pages), objectKey unique, mime, bytes, optional dimensions and readyAt; unique(uploadId,pageIndex). Add nullable ChapterRevision.pendingUploadId with a uniquely named relation. Preserve existing rows/migrations and published snapshots.

Start rechecks fresh session, assignment, editable latest revision and expectedVersion using existing serializable helpers; revokes approval/scheduling, increments version, supersedes prior pending session and records an audit event. The previous draft snapshot remains until complete attachment. Every mutation and upload route validates exact trusted Origin plus X-Bunny-Upload: 1, and never trusts a submitted actor/key/URL. Upload writes require the session creator and fresh chapter access. Other assigned staff/admin may preview; admins can cancel and begin a replacement.

Reserve each immutable, server-generated object key and quota before storage writes. Use conditional create-once writes; retries never overwrite ready bytes. Pending reservations cannot be read publicly. Mark ready only after actual bounded write, rechecking active pending session. A timed-out failed reservation may be replaced with a new asset id/key; late output remains unreferenced. Daily quota is conservative (failed writes are not refunded). No filenames enter object keys. Invalid/incomplete/failed sessions block submit, approval and publish until completed, explicitly cancelled, or expiry is handled. Starting a replacement never publishes anything.

Finalize is idempotent and transactional: verify exact ready source and page indices 0..expectedPages-1 owned by this import/chapter; set pagesJson to stable /api/media/<id> paths with server dimensions; increment revision version, retain draft status, clear pending pointer, mark ready, audit once. A stale/superseded upload cannot attach. Cancel/expire clears the pointer, keeps prior snapshot, and does not restore revoked approval. Existing published chapter stays unchanged until normal admin publication. No per-page image controls for imported PDF chapters.

## Interfaces

Client-only contract (types in src/lib/media/contracts.ts):

- POST /api/uploads with JSON {revisionId,expectedVersion,sourceName,sourceBytes,pageCount} → {ok:true,uploadId,revisionVersion}.
- PUT /api/uploads/[uploadId]/source with application/pdf Blob and known Content-Length.
- PUT /api/uploads/[uploadId]/pages/[index] with WebP/JPEG Blob and known Content-Length. Dimensions are sniffed server-side.
- POST /api/uploads/[uploadId]/complete with {expectedVersion} → {ok:true,revision}.
- POST /api/uploads/[uploadId]/cancel with {expectedVersion} → {ok:true,revision}.
- GET /api/uploads/[uploadId] → authorized status, counts, revisionVersion/errorCode (no raw object keys or secrets).
- GET /api/media/[assetId] → fresh authorization and short-lived signed R2 GET redirect; originals require team access and Content-Disposition attachment.

Responses use {ok:false,error:<Arabic safe message>,code:<stable error code>} and suitable 4xx/5xx. All mutation responses no-store. Reuse server auth/series helpers; rate-limit/quota cannot run against a production test database.

## Reader and privacy

Keep stable registered API paths in DB and studio previews. Public access requires current ChapterPage membership and existing live-publication rules, never historical published membership alone. For reader rendering, batch-resolve registered currently published pages to signed GET URLs, avoiding a Worker request for every image. Use 1-hour GET expiry plus a stable authorized fallback path when a lazy image link has expired. Sign only after the current reader lookup; do not expose draft/source URLs. Studio previews resolve through the authorized gateway. R2 is private; exact configured S3 origin is added to img-src for redirects/signed reader images, not arbitrary hosts. Source responses are attachment + nosniff. Session/preview gateway responses are private/no-store. A previously issued signed GET remains valid until expiry; withdrawal does not revoke an issued URL instantly.

## Release and cleanup

Feature disabled unless MEDIA_UPLOADS_ENABLED=1. Test local Node/isolated PostgreSQL and fake storage, then Workers with isolated R2 storage/prefix and synthetic content. Never seed/reset production, publish user samples, activate paid resources, or delete retained/history media. Cleanup may remove exact failed/expired/unreferenced import objects after seven days, only after checking retained revision snapshots/current ChapterPages; no blanket lifecycle or deletion of all superseded uploads. A pending record isn't proof of complete upload.

One consolidated integration review and one full Worker build/size check; targeted failing tests first for authorization, versions, quota, source/page validation, partial/cancel/late/idempotent attachment and publication. Remote stored-object/stream/reader checks must pass before production enablement. Apply additive DB migrations only after rehearsal/backup and coordinate deployed code with schema. R2 binding for writes; small aws4fetch signer for read URLs/Node adapter; no AWS SDK. Preserve source Neon/Vercel/repository.

Sources: [PDF.js](https://mozilla.github.io/pdf.js/getting_started/), [R2 conditional operations](https://developers.cloudflare.com/r2/api/s3/api/), [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
