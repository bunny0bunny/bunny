# Series classification and adult-content warning — 2026-10-27

## Behavior

Added شوجو، موسيقى، مدرسي، تجسيد، إعادة زمن، شونين، نفسي، أساطير، لعبة، عائلي، سحر، الحياة اليومية to the selectable genre vocabulary. «الحياة اليومية» replaces the display label «شريحة من الحياة»; both filter URLs resolve the same canonical genre. Existing stored JSON is preserved during reads, and explicit metadata saves normalize/deduplicate aliases. Genre counts, discovery, related works and recommendations share the canonical names.

An independent admin-only `Series.isAdult` boolean defaults to false. Create/edit forms can enable or disable it; legacy update requests omitting the field preserve the stored value. The flag and genre changes participate in the existing unsaved draft recovery. Public cards, work details, administration and reader chrome show a red textual +18 badge when enabled. English work-title priority and stable URLs remain unchanged.

All manga, webtoon and novel reader routes wrap content in a warning before mounting reader effects or rendering reader images/text. The warning offers explicit continuation or return to the work page. Consent is scoped to the work ID in the current tab's session storage, with an in-memory fallback if storage is blocked. Ordinary works render directly. This is a content-warning UX, not identity or age verification.

## Validation and backup

- 102 tests passed in 14 isolated Bun test processes against a newly created loopback PostgreSQL database, replaying migration SQL. Covers admin authorization, default false, true/false persistence, legacy omitted-field preservation, invalid boolean rejection, public metadata, canonical filtering and unchanged legacy stored genres.
- 5 SSR/consent tests passed: adult reader content is absent from initial rendered HTML, ordinary reader content renders directly, titles are escaped, genre aliases deduplicate, and consent is scoped per work and fails closed with unavailable storage.
- Scoped ESLint and standalone typecheck passed. An independent read-only review found one missing badge on secondary continue-reading cards; it was fixed and the reviewer confirmed the finding resolved. The restarted Cloudflare production build passed, including TypeScript and generated-output checks for private files/secrets.
- Consistent full production database snapshot: `G:/Bunyora_Backups/content-trash-2026-10-26-efd6dd6d/database-before-classification-2026-10-27.json`, 24 tables, 619544 bytes. SHA-256 verified; directory permissions restricted to the current user and SYSTEM. Companion checksum and Prisma sources retained privately. No production classification or media was changed for testing.
- Tabbit diagnostic returned BROWSER_RUNTIME_UNAVAILABLE; visual/interaction verification in a browser was unavailable. SSR and HTTP checks do not replace that verification.

## Release

Additive migration `20261027120000_series_adult_content` applied successfully. Verification preserved all pre-migration IDs: 3 series, 10 chapters, 7 profiles, 1 private request, 11 chapter uploads, 463 media assets. All existing works have `isAdult=false`; no work was reclassified for testing. Published to https://bunny.bunny-library.workers.dev with Worker version `edb94646-0a90-4d93-a267-76c2255e94ca`. Existing R2/self-reference/minute-cron bindings remain unchanged.

Hosted read-only verification passed 11 page/auth checks, including all requested genre labels and the adult checkbox on the new-work form, discovery filtering, work details, existing manga reading without an unexpected warning, and authenticated administration. All 27 referenced administration JavaScript assets returned matching build bytes. No customer work was reclassified, uploaded or deleted for this verification.
