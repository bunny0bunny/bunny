# Chapter and team profile polish — approved 2026-11-02

User approved the chat plan. Implement locally; do not push, migrate production or deploy. English work titles remain primary; Arabic UI unchanged. Keep existing slugs and translations. Use bounded tasks and one consolidated verification, repeating only failed/affected checks. Production build belongs to release.

## Tasks and ownership

- Chapter worker: reusable chapter number after soft delete, optional title across creation/editorial/publication/display/trash/download, active-only next-number suggestion, restore collision handling, adapt compound-selector seeds/tests and add focused regression. Coordinator owns schema/migration.
- Identity backend worker: owner account management and scoped owner profile edits; team star ratings; DTO/service/action contracts and focused access tests. Coordinator owns schema/migration and avatar endpoints.
- Identity UI worker: administrator owner selection, owner portal outside admin, uploaded logo/crop/compression, public avatar/rating cards/profile and existing follow controls. No backend edits.
- Coordinator: schema/migrations; authenticated versioned R2 logo upload/removal/public delivery; merge review; isolated selected regression, scoped ESLint and typecheck once; handoff and local commit.

## Data and interfaces

Chapter uniqueness is enforced by SQL partial unique index on (`seriesId`, `number`) WHERE `deletedAt` IS NULL. Remove Prisma compound unique selector and adapt callers. Keep trashed rows/history. Restore must detect live conflicts and preserve both records. Chapter/ChapterRevision titleAr stays String, default empty string; optional title input stores trimmed empty string and uses display fallback `الفصل {number}`. Actual content remains required for publication.

PublicIdentity adds ownerProfileId nullable FK Profile (SetNull), avatarKey nullable String, ratings relation. Profile gets ownedIdentities and identityRatings. IdentityRating has id/profileId/identityId/value Int/timestamps, unique (profileId,identityId), CHECK value 1..5, FKs Cascade. Existing identities retain seeds/followers/credits and default to no owner/photo/ratings.

Backend exports: listIdentityOwnerCandidates() -> [{id,nickname,email}], getEditableIdentity(id) -> ManagedIdentityView|null, listOwnedIdentities() -> ManagedIdentityView[], updateOwnedIdentity({id,expectedVersion,displayName,bio,avatarSeed}) -> IdentityResult; savePublicIdentity accepts optional ownerProfileId (admin only). IdentityView adds avatarPath:string|null, ratingAverage:number|null, ratingCount:number. ManagedIdentityView adds ownerProfileId:string|null (never expose owner ID in public DTO). getViewerIdentityRating(identityId) -> {value:number|null,canRate:boolean}; setIdentityRating({identityId,value:number|null}) -> IdentityResult with optional rating {value,average,count}. Existing public follow unchanged. Owner assignment clears their existing rating. No global role or chapter publication authority from ownership.

Avatar endpoints: POST /api/public-identities/{id}/avatar with image/webp bytes, x-identity-avatar:1 and x-identity-version headers; DELETE same endpoint with headers. Same-origin guard, fresh admin/owner authorization, active team for owner, version conflict checks, bounded square WebP <=512px <=256KiB, quota. Return {ok,avatarPath,version} or {ok:false,error}. GET /api/identity-avatars/{id}/{file} only for current uploaded key and active identity, safe image delivery. R2 key media/{prefix}/identities-{id}/{uuid}.webp. Keep previous photo on failed replacement; clean only this request's orphan or successful previous photo.

## Verification ledger

Implementation integrated locally. No production actions authorized in this turn. Isolated PostgreSQL replayed every migration and both seeds. Eighteen selected suites passed (132 tests), covering delete/recreate/restore conflicts, blank titles with valid content, published history, owner-only access/revocation, one editable team vote/no self-vote, and avatar limits/version/auth/failed replacement. The first run exposed trash confirmation compatibility and publication-fixture cleanup issues; both were corrected, then only the three affected suites were rerun successfully. Independent scoped review found no substantive correctness or security issue. Scoped ESLint and TypeScript checks passed, and Prisma Client was regenerated successfully. Production build and browser smoke belong to release.
