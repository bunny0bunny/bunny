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
1. Completed: owner-confirmed categories were applied to production and seed data: “موسم المدّ الأخير” / “زفاف القمر الأحمر” → manga; “نبض المدينة صفر” / “خزانة زينب” → manhwa. No unclassified series remain. Reader formats were preserved.
2. Partial: the hosted contributor PDF upload → private preview → editorial recommendation → administrator approval/publication → anonymous reader cycle succeeded once; original source returned403. Temporary profiles, chapters and exact owned R2 objects were removed. Further replacement/stability checks are BLOCKED by intermittent hosted503 responses; do not sign off stability based on the successful first cycle.
3. Completed: bounded manual cleanup CLI and runbook in `docs/media-cleanup.md`; default dry-run, 24-hour grace, max25 objects and published/draft reference protection. Nine focused tests passed. Hosted trial deleted exactly one synthetic cancelled object and its asset record; R2 returned404 afterward. Existing user objects were untouched. Automatic scheduling and broader historical-object garbage collection remain deferred.
4. Real mobile-device reading and upload acceptance, including Safari; viewport emulation does not verify device memory limits or native file selection.

Keep SEO and final domain work for the release-end pass as agreed. Only owner-confirmed category metadata and disposable pilot records were changed in the follow-up. Existing user chapters were not edited.

## Asset provenance
Transparent cutout generated with built-in imagegen from the supplied `public/logo_noBG.jpg`. Final brief: remove exterior black to real alpha, preserve the purple bunny and internal dark details, no additional background, glow or shadow. The generated source was normalized into a small project-owned transparent PNG, then lossily compressed WebP variants and lossless PNG/ICO sizes were derived using sharp. The supplied JPEG is retained unchanged as original artwork.

## Release blocker found in the signed-in pilot

Cloudflare live tail recorded `outcome: exceededCpu`, `cpuTime: 10`, and `Worker exceeded CPU time limit.` Hosted studio requests and an upload-start request returned503 during subsequent pilot attempts. The initial full cycle succeeded, so this is intermittent; a passing deployment and health endpoint do not establish reliability. No application workaround or paid-plan upgrade has been applied.

Next work should profile and reduce CPU in authenticated studio/upload requests under the existing free-plan constraint, then rerun one complete replacement acceptance cycle. If the existing Next/OpenNext/Prisma workload cannot stay within the free budget, hosting/runtime architecture needs a separate decision; do not silently activate billing or weaken authorization checks. Official limits: https://developers.cloudflare.com/workers/platform/limits/ .

Manual real-device acceptance (including Safari) remains outstanding. This session used Chromium viewport emulation only. Cleanup is an operator CLI, not an automatically scheduled job.

## 2026-10-22 follow-up

Upload deadline, cancellation, error classification and status recovery were repaired and the hosted25MiB slow-transfer → approval → reading → replacement acceptance cycle passed. See [upload recovery verification](upload-recovery-2026-10-22.md). Sampled upload CPU still exceeds the Workers Free budget; keep the release CPU blocker open despite the passing cycle.
