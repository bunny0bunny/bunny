# Chapter and team profile polish

Implemented locally on 2026-11-02. Do not interpret this handoff as deployment authorization.

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

## Release requirements

When publishing is requested: take the normal database backup, run the production build using the established low-memory configuration, and apply `20261102120000_chapter_team_polish` before deploying the matching application. Old application code uses a removed compound unique selector, so coordinate the schema/application rollout. Then smoke-test chapter recreation and restore conflicts, blank-title publishing, owner access and logo replacement, ratings and existing following.

Existing teams, chapters, follows and credits are preserved. Teams initially have no assigned owner, uploaded logo or ratings. No production database, uploaded production file or deployment was modified during this implementation pass.
