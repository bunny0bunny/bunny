# Content readiness implementation plan

**Goal:** Implement the owner-approved create-work, independent cover, PDF upload and private-preview package.
**Spec:** Design approved in this chat on 2026-10-23: independent image preferred; explicitly chosen revision first page may be cropped and authorized as a separate public cover; no automatic cover changes; private preview and submission remain separate.
**Architecture:** Reuse Series.coverPath for an immutable cover gateway and existing private R2 storage. No schema migration. Admin-only writes use transactional role/authVersion checks and compare-and-swap against the previous cover. The gateway serves only the currently referenced cover, never a chapter page. Retain previous objects; no user object cleanup.

## Constraints
- Work exclusively in the actual client checkout; preserve existing local files, uploads and publication.
- No deployment, billing activation, seed, broad cleanup or email.
- Existing Arabic RTL, IBM Plex Sans Arabic, charcoal/violet visual direction.
- CPU blocker remains open; Paid activation unverified.

## Execution
- [x] Add focused tests for cover publication isolation, admin-only mutation, conflict/storage failure preservation and bounded image handling. Policy import failed before implementation; repeated-save browser regression failed before its fix.
- [x] Implement cover service and bounded upload/current-cover/authorized-first-page endpoints using existing storage and transaction boundaries.
- [x] Implement image preview/crop, explicit revision selection, new-work cover staging and safe post-create recovery; neutral missing cover.
- [x] Clarify upload stages and add private-preview entry after completion without changing recovery locks.
- [x] Run focused tests, typecheck and scoped lint; one combined desktop/mobile inspection and one read-only Claude review. Correct material findings together.
- [x] Record actual results and limits in docs/content-readiness-2026-10-23.md; stage only package files for the verified local commit. No deployment.
