# Upload recovery and Worker ownership — 2026-10-22

## Changes
- Upload requests now distinguish HTTP/authentication/size/server errors from network failures and deadlines without exposing upstream HTML.
- Metadata requests have a30-second deadline; file PUTs120seconds; status/cancel10seconds. Cancellation waits at most5seconds for a running task before requiring authoritative recovery. A slow task is never mistaken for permission to start another concurrent upload.
- No automatic replay of uncertain start/complete/cancel POSTs. Unknown-start or terminal-state recovery stays locked until a full page reload; the parent editor does not synchronize a router refresh into its local revision state.
- Known uploads re-read saved status and page counts after a failure, clear stale working messages, and do not turn a completed upload back into pending state. Already-aborted requests dispatch nothing.
- Fixed synchronous preflight failure retaining a completed task reference, which prevented retry after selecting an oversized PDF.
- Explicit AsyncLocalStorage ownership reuses one lazy Prisma client within an awaited upload request, status request, media-signing request, or studio data-loading operation. Concurrent requests retain separate clients; nested scopes share ownership. Outside these boundaries the previous lazy per-operation ownership remains. No global socket pool or authorization cache was introduced.
- Connection cleanup errors are logged with a fixed non-secret message and cannot replace an already committed operation result. Transactional account/authVersion/access checks remain unchanged.

## Verification
Focused tests cover status classification, stalled requests/bodies, cancellation, no POST replay, task ownership, terminal recovery, status-read deduplication and file-selection/save behaviour. Worker ownership tests cover concurrency, nested scopes, exceptions, lazy fallback and disconnect failure. Commands:

```powershell
node --test scripts/qa-worker-scope.test.mjs scripts/qa-upload-recovery.test.mjs
node scripts/qa-upload-recovery-browser.mjs
node node_modules/typescript/bin/tsc --noEmit
```

The browser suite bundles the actual panel/request helper, mocking only PDF rendering and network responses. It creates no cloud records. A separate hosted synthetic chapter must exercise real browser PDF rendering, R2 writes, approval/public reading and replacement, and must remove its exact owned objects/accounts afterwards.

## Performance boundary
Previous live traces recorded `exceededCpu` at10ms under the Workers Free plan. Sharing ownership removes repeated client initialization, but does not itself prove all requests fit that CPU budget. Hosted tracing is required before closing this release blocker. No paid plan, service or weaker authentication was enabled.

## Review
Antigravity headless execution was denied by its command permission policy; no permission bypass was attempted. Codex completed implementation and a single read-only Claude review checked the combined changes. Its medium findings (cleanup errors and the media route ownership gap) were addressed. The deliberately short cancellation wait can require a reload while a slower status reconciliation is pending; it preserves safety and avoids duplicate uploads.
