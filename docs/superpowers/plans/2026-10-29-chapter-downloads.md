# Chapter Downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Download current published image chapters through a per-series administrator permission.

**Architecture:** A server-validated current manifest feeds a browser-native image-to-PDF pipeline. Current permissions and content fingerprints are checked for every page and at completion. No PDF is retained on the server; this supersedes the initial cache proposal after the feasibility gate.

**Tech Stack:** Next.js 16, Prisma/Postgres, Cloudflare Workers and R2; native browser codecs and a bounded RGB JPEG PDF writer.

**Spec:** `docs/superpowers/specs/2026-10-29-chapter-downloads.md`

## Global Constraints

- Initial development was local only. The user authorized publishing on 2026-10-29 after verification; see the release handoff.
- Preserve decimal chapter-number work and existing untracked user files.
- English work titles primary; Arabic interface unchanged.
- Defaults off; published manga/webtoon only; no locked, deleted, scheduled-future or draft exports.
- No stored PDF cache; private image signing stays server-side and lasts at most two minutes.
- No new paid service; never expose original source PDFs to readers.

### Task 1: Prove renderer feasibility

**Files:** ignored `.local-preview/readiness-audit/download-feasibility/` only.

- [x] Test real WebP decode in workerd, including largest allowed images and repeated pages.
- [x] Measure unavoidable memory copies and document package/license/runtime constraints.
- [x] Select a bounded renderer architecture; do not wire an unproven renderer into the application.
- [x] Validate actual PDF pages with a PDF parser/render comparison.

### Task 2: Manifest and permission policy

**Files:** `src/lib/downloads/policy.ts`, `tests/media/download-policy.test.ts`.

**Interfaces:** `DownloadManifestPage`, `contentFingerprint(pages)`, `canDownloadChapter(chapter,isAdmin,now)`, `downloadFilename(series,number)`; TTL and URL lifetime constants.

- [x] Write failing tests for access, ordered manifest integrity, invalid keys, content changes and decimal filenames.
- [x] Implement deterministic validation and fingerprinting.
- [x] Run focused pure tests and review permissions against the spec.

### Task 3: Private manifest and image access

**Files:** Prisma schema/new migration, `src/lib/downloads/service.ts`, isolated database/API tests.

- [x] Add the default-off series switch.
- [x] Test fresh permissions, current projection membership, content replacement and invalid media rejection.
- [x] Implement same-origin guarded manifest and bounded private image proxy routes.
- [x] Implement `src/lib/downloads/pdf.ts` and `browser.ts`, with sequential decoding, cancellation, output bounds and final content confirmation.

### Task 4: API and controls

**Files:** download API routes, admin series form/actions, chapter list and manga/webtoon readers.

- [x] Test server enforcement and same-origin mutation requests.
- [x] Add admin toggle, preserving omitted values on existing callers.
- [x] Add reusable Arabic download control with preparation, failure/retry and ready states.
- [x] Keep novel controls hidden and preserve reader navigation/touch behavior.

### Task 5: Verification

- [x] Run isolated database harness; never run DB tests against repository environment variables.
- [x] Run focused tests, lint and TypeScript checks.
- [x] Build the Cloudflare bundle and verify the real renderer loader locally.
- [x] Review complete diff and document remaining browser/runtime limitations.
- [x] Reported local completion, then applied migrations and published after the user's explicit release authorization.
