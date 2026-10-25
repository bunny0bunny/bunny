# Admin content journey fixes — 25 October 2026

Implementation: `94007e1`. Production Worker: `3409f517-1be3-41b3-a981-9d613bcc52ab`, verified at 100% traffic. This closes the four findings in the admin journey discovery report. No database migration was required.

## Changes

- Editorial transactions recognize only the existing retryable Prisma codes P2034/P2002 without relying on a shared error constructor between bundled runtimes. Retries remain bounded to four attempts; unrelated errors are not retried. When initialization still conflicts, the studio explains that the chapter is saved and offers a fresh-navigation retry instead of throwing into the generic error page.
- New-chapter forms suggest the largest existing chapter number plus one. The aggregate is restricted to the works the current actor is authorized to manage. Switching works changes the suggestion, manual numbering remains available, and duplicate protection still runs on the server. A suggested default does not falsely mark the form dirty or replace explicit recovered text.
- Series metadata fields, selects and genre buttons now have at least 44px height. Genre keyboard focus is explicit; the featured-work checkbox label also has a 44px hit area.
- Withdrawal reason, return-for-changes reason and recommendation note now have persistent associated labels.

## Verification

64 focused tests passed with 265 assertions: 47 actual PostgreSQL integration tests / 205 assertions, 12 admin-form tests / 49 assertions, four Worker-error retry tests / eight assertions and one studio recovery-page test / three assertions. The new retry, conflict-view and numbering regressions were observed failing before their production changes.

The concurrency integration test exercised four simultaneous first opens and four simultaneous forks of a published chapter. Callers converged on one working draft; existing publication and stale-version protections remained intact. Test PostgreSQL was isolated from production.

Direct TypeScript, scoped ESLint, diff checks, the Impeccable detector, full Cloudflare build and private-artifact/secret scanning passed. One independent combined code review found no actionable P0/P1/P2 issues. No additional dependency or service was introduced.

On the deployed Worker, five fresh chapters each received four simultaneous authenticated cold opens: all 20 responses rendered the editor, and each chapter had exactly one draft and one initialization event. No public chapter pages were created.

Live browser acceptance confirmed:

- A work ending at chapter 35 suggested 36. Creating chapter 36 opened its studio on the first entry; the next form suggested 37.
- At a 390px Chromium viewport, all eight metadata input/select controls and all ten genre buttons measured 44px high; document width was 375px with no horizontal page overflow.
- A temporary novel chapter was submitted to review through the real editor. Return-reason and recommendation-note fields were visible by their associated labels.
- Desktop and mobile screenshots were captured and visually inspected. No JavaScript page errors were observed. This is emulated Chromium coverage, not physical-device or Safari certification. The withdrawal label was reviewed in code; no real published chapter was withdrawn for this test.

Seven public smoke routes passed. Deployment readback confirmed the database, R2 and self-reference bindings, the minute scheduler and 30,000ms CPU limit.

## Preservation

Both exact temporary series, their seven chapters/revisions and the synthetic QA profile were removed after acceptance. No files/covers were uploaded and no chapter was published in this acceptance run. The existing staff account/session, mock catalog and PDF pipeline were preserved. Final integrity checks matched all original rows in Profile, Series, Chapter, ChapterRevision, ChapterPage, ChapterUpload, MediaAsset and Notification; unrelated legitimate new rows were retained. The task-created browser scratch page was closed and task finish reported no forced cleanup.

Detailed receipts, fixture identifiers and diagnostics stay in ignored `.local-preview/readiness-audit/`; no secrets or database snapshots are included here.

## Client starting sequence

1. Create the work and choose its content category and reader layout carefully. The slug stays fixed; layout is locked after chapters exist.
2. Add or choose the cover, approve its crop and save the work metadata.
3. Add a chapter using the suggested number or an explicit unused number, then continue to its studio.
4. For visual chapters choose a PDF, keep the tab open, upload and inspect the private preview. For novels enter and save the chapter text.
5. Confirm import review and choose temporary or permanent original retention. Reader images remain stored.
6. Submit/review as needed, approve the exact revision, then publish or schedule it explicitly.
7. Check the public work and reader after the first real chapter before uploading the rest of the library.

PDF limits remain 30MiB and 200 pages. Reload recovery requires reselecting the same file; imported page edits require replacing the PDF. Temporary originals become eligible after seven days from upload completion and explicit review; no fixed compression percentage is promised.
