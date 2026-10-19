# Release review — 2026-10-20

## Scope and evidence
Read-only Chromium inspection of seven hosted routes at 1366×900 and 390×900: home, explore, login, register, library, studio, and `/series/wedding-of-the-red-moon`. Guest redirects for library and studio were checked. One combined desktop/mobile capture pass; no account, content or R2 mutations. Private screenshots and route measurements: `.local-preview/release-audit/`.

All 14 route/viewport checks returned 200 after expected redirects, with no horizontal overflow, missing image alt attributes, broken loaded images, unnamed buttons, or uncaught page errors in this pass. This is a focused smoke check, not a full accessibility certification or production-readiness sign-off.

## Fixed in this package
- Actual alpha transparency for the browser icon, legacy favicon, Apple icon and both shared website brand sizes.
- Transparent master in `public/brand/bunny-master.png`; header/footer, account surfaces and admin navigation share BrandMark.
- Removed the dark-theme blend workaround, which could hide a black rectangle but did not remove it.
- Replaced the obsolete logo integration script: preserve alpha, reject opaque inputs, generate current asset locations, and leave the shared component API intact.

## Remaining before freezing the release
1. Assign real categories to the remaining legacy records. “موسم المدّ الأخير” and “زفاف القمر الأحمر” currently appear as “غير مصنّف”. Do not infer manga/manhwa/comic category from reader format.
2. Run one real team pilot: contributor PDF upload → preview → submit → admin approval → public reading → replacement. The signed-in editorial workflow was outside this read-only guest audit; prior upload checks do not replace final owner acceptance.
3. Confirm cancelled/expired upload cleanup and how storage failures are surfaced before regular team use. This was a known operational follow-up, not newly verified here.
4. Real mobile-device reading and upload acceptance, including Safari; viewport emulation does not verify device memory limits or native file selection.

Keep SEO and final domain work for the release-end pass as agreed. No database content was changed by this review.

## Asset provenance
Transparent cutout generated with built-in imagegen from the supplied `public/logo_noBG.jpg`. Final brief: remove exterior black to real alpha, preserve the purple bunny and internal dark details, no additional background, glow or shadow. The generated source was normalized into a small project-owned transparent PNG, then lossily compressed WebP variants and lossless PNG/ICO sizes were derived using sharp. The supplied JPEG is retained unchanged as original artwork.
