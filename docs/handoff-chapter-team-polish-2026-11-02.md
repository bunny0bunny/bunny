# Chapter and team profile polish

Implemented and published on 2026-11-02 after the user's explicit request to upload the changes.

## Behavior

- Soft-deleted chapters no longer reserve their number. An active-only database unique index prevents concurrent duplicates. Restore rejects collisions without overwriting either chapter; next-number suggestions ignore trash.
- Chapter titles are optional, stored as trimmed strings, and displayed as `الفصل {number}` when absent. Chapter numbers and actual content remain required. English work titles remain primary.
- Administrators can assign a verified, enabled owner account to a team. The owner can edit that team's name, biography and logo through `/profile/teams`; this grants no administration or publication role. Administrator management remains available.
- Logos are cropped and compressed in the browser to square WebP, at most 512 pixels and 256 KiB. The server validates bytes, authorization and version, and preserves the existing image when replacement fails. Original uploaded images are not stored.
- Verified readers can add, edit or remove one 1–5 star rating per active team. The owner cannot rate their own team. Public profiles show average/count and retain existing follow controls. No written reviews are introduced.

## Validation

All migrations and both seeds replayed on isolated PostgreSQL. Eighteen selected suites passed: 132 tests, zero remaining failures. The affected chapter-polish/content-trash/publications suites passed after correcting a trash confirmation compatibility issue and test fixture cleanup. An independent scoped review found no substantive correctness or security issue.

Evidence (ignored local artifacts): `.local-preview/readiness-audit/chapter-team-test-results.json`, `.local-preview/test-tmp/bunyora-trash-qa-bpxCpx`, and `.local-preview/test-tmp/bunyora-trash-qa-j91wtd`.

Scoped ESLint passed on the changed and newly added TypeScript/TSX files. `npm run typecheck` passed (`tsc --noEmit`, exit 0). Prisma Client was regenerated successfully. No production build or interactive browser verification is included in this implementation pass.

## Production release

Source commit `23bf169` was pushed to the client repository. `npm run cf:build` passed with `BUNNY_BUILD_LOW_MEMORY=1` and a 1536 MiB Node heap, including Next compilation/types, OpenNext bundling, 36 dynamic-route aliases and runtime-secret artifact checks. A fresh backup of all 28 public tables was checksummed and retained privately outside the repository; its pointer is in ignored `chapter-team-release-backup.json`.

Migration `20261102120000_chapter_team_polish` applied successfully. Read-only verification preserved 179 existing core records and chapter numbers, confirmed the active-only unique index, and confirmed existing teams initially have no owner/logo/rating. No production fixtures or media writes were used for verification.

`npm run cf:deploy` exited 0. Published Worker version: `3db5559c-7f26-4cff-a504-bec311d55110` (gzip 3157.06 KiB, startup 38 ms). Existing R2 bindings, upload enablement, publication delivery and the one-minute cron were retained.

Hosted read-only smoke passed on both `https://bunyora.com` and `https://bunny.bunny-library.workers.dev`: homepage, exploration, translators list, existing team profile, existing series and reader returned 200; all 27 referenced JavaScript assets per host matched the local build. Admin, studio, notifications and `/profile/teams` required login; guest notifications remained empty. Ignored evidence uses the `chapter-team-release-` prefix under `.local-preview/readiness-audit/`. Authenticated browser edits, live logo writes and live ratings were deliberately not exercised against customer content; their behavior is covered by the isolated integration tests.

Administrators can now assign the appropriate responsible account from the team editor. Ownership does not grant chapter publication permissions.

## Rollout notes

The migration was applied before the matching application. Old application code uses a removed compound unique selector, so any application rollback must account for the new schema; do not automatically reverse the migration or delete newly created ratings. The previous live version was recorded privately before release.

Existing teams, chapters, follows and credits are preserved. No existing production media was changed by the release.
