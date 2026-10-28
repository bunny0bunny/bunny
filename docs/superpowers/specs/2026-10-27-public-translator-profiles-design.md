# Public translator/team profiles and following — reviewed design draft

Date: 2026-10-27 (Africa/Cairo)
Status: **Approved for implementation by the user on 2026-10-27 ("ok proceed").**
Repository baseline: `7c91b50`.

## User objective and confirmed meaning

Readers can visit a public profile for the individual or translation team responsible for presenting a work, see that identity's published works, follow it and receive in-app notifications when it publishes more. The user explicitly chose the responsible individual/team rather than the administrative editor role. The user requested a Claude debate and use of the configured delegation skills.

Work-title display remains English primary, Arabic secondary/fallback. The interface remains Arabic. Original author attribution, stored translations and stable existing work/reader URLs are preserved.

## Debate and independent review

Two Claude Code read-only rounds completed through `claude-delegate`, using the existing global `debate` lane. Both result artifacts report `status=completed`, `resultSubtype=success`, and `readOnlyViolation=false`. No fleet settings were changed. Session: `8f689d39-c311-4dc6-8955-ef563d12cf59`.

Accepted findings:
- Public attribution must be independent of login roles, upload actors, approval actors and private work-access assignments.
- Existing shelf notifications must join the same delivery pipeline as identity follows; two separate fan-outs cannot guarantee one notification per reader.
- Current `publishProjection` loads every shelf holder and creates notifications inside a Serializable transaction with a 15-second timeout. Move audience expansion out of publication.
- A durable first-publication record must survive withdrawal and soft-trash restoration. `publishedAt` alone cannot identify first publication.
- The proposed digest key based on the smallest pending publication ID was rejected: retry grouping is unstable. Defer digests until group membership and recipient semantics are durably defined.
- Admin-managed identities are sufficient for the first release. Membership/self-service editing introduces an additional authorization surface and can follow later.
- Keep a small follow/mute control; `alertsEnabledAt=null` means muted, and resuming alerts sets a fresh timestamp to avoid old backlog.

Coordinator corrections to the second review:
- Publication analytics do **not** reliably survive permanent purge: `src/lib/content-trash/service.ts:207` explicitly deletes work-owned analytics. Absence of analytics never proves a chapter was unpublished.
- A revision's creation timestamp is not necessarily its publication time. Unknown historical publication dates remain unknown; a baseline timestamp must be labeled as such rather than presented as the actual first-published date.
- A post-deploy backfill alone does not close the rollout race: a correction could enqueue and deliver before that sweep. The new publication transaction must detect pre-existing publication evidence before changing the chapter/revision or writing its own audit event. Delivery remains gated off until rollout checks finish.
- Serialize series-debut decisions with a series-row lock (or an independently proved equivalent) inside the short publication transaction. Concurrent first chapters must not both claim the series debut.

## Public experience

Proposed public route: `/translators/[slug]`. The label is «المترجم / فريق الترجمة», independent of any private account role.

A profile shows a public display name, an avatar/fallback, a short biography, published-work count, follower count, published works and recent publicly available chapters. It has Follow/Following and a separate alerts control, plus a shareable stable URL. Visitors can view the page; following asks signed-out visitors to sign in and requires an active, verified account.

Series details show linked credits under «ترجمة وإعداد». Original author remains a separate field. Multiple credited identities are supported. Existing `Series.translator` text remains a fallback until an admin explicitly links credits; do not guess identities from matching strings.

A private account section lists followed identities. Individual follower identities, emails, private reading history and private account settings are never included in public profile responses. A public team remains the same identity when its staff accounts or private permissions change.

Reuse existing series cards and reader URLs. +18 badges/warnings and locked-chapter behavior remain in place. For adult notifications, retain the English-primary work title and a +18 marker, but omit chapter titles, excerpts and images. Locked releases are labeled as locked and still go through existing reader checks.

## MVP administration and permissions

| Capability | Guest | Active verified reader | Ordinary staff | Admin |
| --- | --- | --- | --- | --- |
| View active public profile and public work | Yes | Yes | Yes | Yes |
| Follow/unfollow and mute own alerts | Sign-in prompt | Yes | Yes | Yes |
| Edit another reader's follows | No | No | No | No |
| Create/edit/activate/suspend public identity | No | No | No | Yes |
| Assign/remove public work credits | No | No | No | Yes |
| Grant private work permissions | No | No | Existing rules | Existing rules |

Credits grant no private permissions; private `SeriesAssignment` grants no public credit. Being an admin, uploader or approver does not make someone the credited translator. Public profiles do not expose administrative roles or sign-in identifiers.

Use an existing avatar/fallback initially; custom compressed team-logo upload and member-managed presentation can be a separately scoped enhancement. Suspension hides the public profile/link and prevents identity-derived new alerts while preserving identity, credits and follow records for administration. No old events are replayed on reactivation.

## Minimal domain model

These are conceptual contracts, not migration instructions:

- `PublicIdentity`: stable ID, unique immutable slug, individual/team kind, public display name, avatar seed/fallback, public bio, active/suspended status, timestamps. Independent of `Profile.role`. No private account join in its public serializer.
- `SeriesCredit`: series ID, public identity ID, credit role, display position; unique series/identity/role. Administrative edits are authorized and version checked. Credit roles initially translation/editing/preparation, not original-author ownership.
- `IdentityFollow`: account ID + public identity ID unique; followedAt; nullable alertsEnabledAt. Follow sets both timestamps, unfollow removes the row, mute clears alertsEnabledAt, resume sets it to now. Server determines timestamps.
- `ChapterPublication`: unique immutable original chapter ID; original series ID; fresh-event timestamp or separately labeled baseline timestamp; optional reliable historical publication date; immutable credited-identity IDs and roles; debut flag; delivery state; cursor; lease token/expiry; retry metadata. Snapshot identity IDs, not only deletable credit-row IDs. Preserve enough tombstone identity after hard purge for audit/deduplication; live targets can be nullable relations.
- `Notification`: nullable publication reference and unique account/publication constraint. Null references preserve existing system/comment-like notification behavior. Feed serialization must distinguish unavailable publication targets from unrelated notifications.

Do not add team-membership or new paid infrastructure in the first implementation. If membership is added later, link accounts to the public identity rather than replacing it; apply existing fresh authentication, disabled-account and authVersion checks.

## Publication semantics

A new chapter means its first actual public publication, keyed by chapter ID, not revision ID. A later correction, re-publication after withdrawal, or restored chapter being published again does not create another release alert. A genuinely recreated chapter after permanent deletion has a new ID and may alert normally.

A new work is introduced by its first actually published chapter, not creation of a draft series. Concurrent first-chapter publishing must produce exactly one debut classification. Adding a credit later never creates a release event or retroactively targets the new identity's followers.

In the publication transaction:
1. Lock/read the live series and chapter under the existing Serializable/retry discipline.
2. Before writing projection/status/audit changes, determine whether this is already historically published but lacks a ledger row. Insert a suppressed baseline record if so.
3. Apply the approved publication normally. If the unique publication row already exists, do not enqueue another release.
4. For a genuinely first publication, insert a pending event and immutable credited-identity/flag snapshots atomically with publication. No recipient expansion or notification inserts occur here.

The existing inline shelf fan-out is removed in the same release as the new ledger path. The unused legacy `notifyNewChapter` helper/import must be removed or redirected to the single path, not left as a competing notification implementation.

## Bounded delivery and audience

Use a dedicated authenticated, self-bound notification-drain endpoint, invoked as an independent settled task in the existing minute Worker cron. Publishing and media cleanup must still run when delivery fails. Do not couple notification progress to a successful publish-due response.

Audience is the distinct union of:
- Current series shelf holders with `LibraryItem.createdAt <= eventAt`.
- Current followers of active identities in the immutable credit snapshot, with alertsEnabledAt present and `<= eventAt`.

Recipients must currently be active and verified. Follow requires verification, and this rollout intentionally also excludes any legacy unverified shelf holders. An identity mute does not suppress an independent shelf subscription. Unfollow/refollow and resume-alert timestamps prevent retroactive backlog. No replay guarantee is made for periods of account/identity suspension; eligibility is checked at delivery and skipped readers are not later rescanned as a backlog.

Claim pending work with a short persisted lease/CAS. Within each short page transaction, verify the lease and prior cursor, recheck live target and audience eligibility, select a bounded keyset page of distinct account IDs, insert notifications using the unique account/publication constraint, and advance the cursor atomically. A lost lease/cursor CAS rolls back the entire page. Complete only after an empty eligible page. Do not silently stop after an arbitrary total follower count; later recipients must be reached by subsequent batches.

Skip/suppress events if their target is trashed, withdrawn, future-scheduled or missing before delivery; suppression is terminal and restoration does not replay it. Validate the parent series as well as the chapter. If a target disappears after delivery, render «غير متاح» without a stale clickable destination. Comment-like/system notifications continue using their existing behavior.

The live target's current +18/locked status must never be weakened by an older snapshot. No notification contains private draft text. Public credit attribution uses the immutable release identity IDs; current suspension rules can suppress visibility/delivery without retargeting history.

## Legacy evidence and safe rollout

Read-only discovery precedes any data backfill. Reliable publication evidence includes a currently live chapter (not a future-scheduled pseudo-public legacy row), an existing published revision, a known successful `publish_now`/`publish_due_scheduled`/`withdraw_chapter` event, or retained publication analytics. Existing publishedAt can corroborate historical publication only after excluding legacy scheduled initialization. A merely `withdrawn` revision is not evidence: trash marks never-published drafts withdrawn too.

List chapters with zero revisions, no reliable evidence, and prior trash membership as ambiguous. Never silently classify them as brand-new or use all drafts as a blanket baseline. Proposed safety default: baseline-suppress ambiguous historical-trash candidates, report their exact count/IDs for review, and allow a verified never-published case to be corrected before release. If any exist in actual discovery, explicitly surface that decision to the user before applying it. Do not manufacture exact historical publication dates.

Backfill only the new ledger; do not initialize revisions or rewrite content. Existing historical events are baseline/suppressed and never fan out. An idempotent insert-only backfill must not overwrite fresh pending events.

Release order: private backup + checksums; additive schema; initial idempotent baseline; deploy the unified publication path with drain disabled by default; its pre-projection legacy guard covers publications made by the old Worker during rollout; repeat baseline/discovery after cutover without changing pending events; verify event/debut classification and preserved customer content; enable bounded delivery only after those checks. Preserve the existing Worker/R2/cron configuration and all reader accounts/private requests. Backfill/flag operations require a concrete reviewed implementation first.

## Implementation slices and ownership for a later approved run

1. **Publication ledger and notification delivery:** schema/migration, historical evidence discovery/backfill, editorial integration, dedicated drain and serializer. Own `prisma/schema.prisma`, a new migration, `src/lib/editorial.ts`, focused modules under `src/lib/publications/`, notification helpers/feed, the new drain route and Worker scheduler wiring. Keep this slice independent of public identity UI; initially shelf subscribers exercise it.
2. **Public identities and credits:** focused modules under `src/lib/public-identities/`, `/translators/[slug]`, admin identity screens, a public-credit panel distinct from `team-assignment-panel`, work-page credits and public DTOs. Add no private work rights through these screens.
3. **Follow/mute and following list:** scoped actions, accessible follow/bell controls, authenticated following view, audience union. Stable unique relationships, idempotent actions and fresh permission checks.
4. **Integrated UX and rollout validation:** empty/error/suspended states, mobile keyboard/touch layout, duplicate/retry tests, approved isolated fixture journey and actual hosted read-only checks.

Use the existing configured delegate lanes on execution: `debate`/`review` for Claude read-only review, `implementation`/`tests` for the configured Codex implementer, and `ui` for the configured UI implementer when appropriate. One explicit owned file set per writer; coordinator owns schema/interfaces, integration checks, commits and deployment. Never have two implementers change shared editorial/schema files concurrently. Do not alter fleet configuration to implement this feature.

## Acceptance matrix

- Guest sees only approved public identity fields and published work; no email, private reading data or draft counts.
- Personal/team identity remains stable across member/role/display-name changes; duplicate slug is handled clearly; original author and old translator fallback remain.
- Public credit does not grant work access; private assignment does not create public credit.
- First publication alerts once; correction, withdrawal/republication and trash/restore/republication do not.
- Scheduled publication alerts only on availability; two concurrent first chapters have one series debut.
- Current, withdrawn, trashed and legacy publications baseline silently; genuine drafts remain eligible; ambiguous evidence is reported; rollout publication race does not double-alert.
- Shelf + two identity follows yields one delivery. Muted identity alone yields none; a separate active shelf still yields one. Late follow, refollow or unmute does not receive prior events.
- Overlapping drains, stale leases, lost CAS, process crashes and retries produce no duplicate notification or cursor regression; batches beyond the first page eventually complete.
- Changed/deleted credits do not retarget old events. Suspension or hidden content suppresses pending delivery without replay.
- Delivered missing/trashed targets become unavailable; unrelated notification types remain intact.
- Adult notifications use English-primary work title/+18 without chapter previews; premium content remains locked; reader gateways remain authoritative.
- Run isolated database tests, meaningful notification/identity integration tests, typecheck, scoped lint, full Cloudflare build and an approved isolated browser journey. Never seed or mutate actual customer works for QA. Current browser runtime availability must be checked honestly before claiming visual verification.

## Deferred enhancements

Team membership/self-service editing, custom compressed logo uploads, mutable handles with redirects, persisted bulk digests, email/browser-push delivery and richer feeds are separate scopes. No separate social-post system is implied by “publish more” in this first release.

## Next decision

User approved execution. Implement the reviewed MVP through owned delegate tasks and independently verified gates; keep deferred enhancements out of this release.
