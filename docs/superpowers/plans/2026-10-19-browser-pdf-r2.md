# Browser PDF R2 implementation plan

> Follow the approved fleet: Codex/backend, Antigravity/UI, Claude/consolidated review. Coordinator owns credentials, migration/deploy and integration. This implements the approved design, without another approval cycle for the same experience. Use scoped test-driven changes and preserve unrelated untracked files.

**Goal:** finished PDF → local browser preparation → private R2 → preview → existing admin approval → reader, without a processing subscription.

**Architecture:** see ../specs/2026-10-19-browser-pdf-r2-design.md. Same-origin bounded upload routes and immutable R2 binding writes; PDF.js static browser assets; explicit draft/version/quota lifecycle in Neon. Reader uses authorized signed image URLs.

- [x] Feasibility: PDF.js6 render supplied PDF locally and inspect Arabic; test atomic R2 create-once and delete only owned probe. One Claude architecture debate.
- [x] Storage task: src/lib/media/storage.ts + formats.ts, bounded source streaming, immutable writes, safe GET signing, Node/fake adapters, storage/format tests. No DB/cloud state changes by implementer.
- [x] Backend task: schema/additive migration, contracts, lifecycle/actions/routes and editorial guards, focused authorization/version/partial/retry/idempotency/retention tests on isolated PostgreSQL. No production migration or environment access by implementer.
- [x] UI task: browser renderer and static-asset preparation; PDF upload panel integrated into editor, clear progress/retry/cancel/whole-file replacement; remove misleading page-count/placeholder description for new visual chapters. Preserve novel/legacy editing. Antigravity owns UI; coordinator owns package/config integration.
- [x] Integration: exact CSP, reader batch signing/expired-link fallback, local isolated journey, synthetic Worker/R2 stream validation, stage config and limits. No supplied PDF publication.
- [x] Review/release: one consolidated Claude review, impacted tests/lint/typecheck, one full Worker build/size check, migration rehearsal and private backup, then controlled schema/deploy/feature-enable and real synthetic journey. Commit explicit files; no secrets/private samples/old untracked specs. Record any blocked acceptance honestly.

## Verification record

- Storage/format/reader helper tests: 20 passed, 95 assertions.
- Impacted editorial/actions suite: 45 passed, 166 assertions before consolidated fixes; new fix regressions: media suite15 passed,54 assertions.
- Real Worker binding stream probe: valid source stored15 bytes; overwrite and short body rejected;50/200 offline GET signatures returned200; own objects and temporary Worker removed.
- PDF.js6 actual helper browser probe: supplied45-page PDF first/middle/last rendered with no CSP/page errors; no supplied content uploaded.
- Consolidated Claude review: three verified P2 cases corrected (withdraw cancels pending, upload-off preserves reads, imported snapshot immutable). Obsolete isEvalSupported suggestion rejected: removed from installed PDF.js6 API/runtime; strict production CSP and browser probe enforce no JS eval.
- Bucket managed public URL read-only check: disabled. Private pre-migration client snapshot saved locally (20 tables,897 rows); no credentials in this document.
- Browser whole-journey and final Worker build/deploy acceptance remain pending until recorded below.

Delegation outcome: actual Antigravity session was dispatched but its headless write permission was denied. It generated browser renderer source as text, which the coordinator reviewed and integrated. Native Codex agents implemented backend/storage and the remaining studio UI, with one consolidated Claude review. No delegation permission settings were bypassed.

Local acceptance completed: browser upload to actual private R2, two-image team preview, contributor submit, editor recommendation, admin approval/publish, anonymous reader image, original403, mobile390px no overflow; no page errors. Six owned QA objects, synthetic work and QA sessions removed afterward. One full Cloudflare build and dry-run passed: gzip2958.61KiB (<3072KiB), no PDF.js server runtime. Additive production migration applied after backup; four R2 signing secrets encrypted; Worker deployed with MEDIA binding and upload enablement, version b7e7244d-3a4e-4bfc-b4fc-73854cf001f6. Hosted acceptance passed: synthetic22,021,114-byte PDF source +2 pages uploaded, completed and previewed on Workers Free with all upload routes200 and no page errors. It remained a draft; no user sample was published.

Release limits: PDF30MiB /200pages /200MiB total per import; keep upload tab open, cancel/restart after interruption. Whole-file replacement only. Browser probes cover Chromium, not a real Safari/iOS device; JPEG fallback is implemented. Failed/expired object pruning is an operator maintenance follow-up, not a blanket bucket lifecycle. Existing published/revision media must be retained. GitHub automatic build for the landed commit is verified separately from the successful direct deployment.
