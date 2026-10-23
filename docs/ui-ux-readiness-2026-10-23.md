# UI/UX readiness review — 2026-10-23

## Publication follow-up
The user subsequently authorized publishing. Commits `44e33cb` and `deb4b3d` were pushed to the original GitHub main branch, built with `npm run cf:build`, checked for private PDFs and embedded environment secrets, and deployed with `npm run cf:deploy` to https://bunny.bunny-library.workers.dev. Both commands exited0. Cloudflare active version: `5ad1fc44-a195-4f53-bdfb-46ef0f09122b`.

Fresh verification:41 Node tests passed, standalone TypeScript passed, and production compilation, build TypeScript and static generation passed. Seven hosted HTTP checks passed: home, manhwa discovery, no-results query, actual work details, actual webtoon reader, login return URL and404. The browser confirmed the new home wording, semantic chapter lists and reading navigation; the reader's comment sign-in preserves its location. At390×844, the hosted settings dialog has no horizontal overflow, an Arabic close control44×44 and no title overlap. Loaded reader images had no broken-image state and the observed browser error log was empty. Viewport override was reset.

A hosted test using two temporary synthetic staff profiles and one unpublished temporary series passed8 cover checks: editor denied, administrator save, exact image bytes through the anonymous gateway, repeated save/replacement, old gateway404, readable replacement, stale-write409 and anonymous private-source denial. All exact owned cover objects, series, staff profiles and cover rate-limit records were removed. No real chapter was published, upload changed, email sent, billing activated or demo removed.

Full authenticated local Next inspection was attempted again against a guarded loopback database; studio compilation/browser response could not be completed under local resource pressure, so owned audit services were stopped before the successful production build. This release verifies hosted cover storage and public reading, but does not add a complete hosted staff preparation→review→publication→replacement browser pass to the earlier component evidence. Workers Paid activation/CPU reliability and physical mobile/Safari acceptance remain open. The original sections below describe the earlier pre-publication review boundary.

## Refined working brief
راجع مكتبة باني كرحلة مستخدم كاملة: اكتشاف العمل، البحث والفلاتر، تفاصيل العمل، القراءة، وتجهيز المحتوى ومراجعته. حافظ على التصميم العربي المعتمد. أصلح مشاكل الاستخدام والإتاحة التي يمكن إثباتها، واختبر السلوك قبل وبعد التصحيح. افصل ما اختُبر فعلًا عن الافتراضات، ولا تعتبر نجاح الاختبارات المحلية دليلًا على جاهزية الاستضافة. لا تنشر أو تغيّر الاشتراك أو تحذف محتوى أو تعدّل رفعًا حقيقيًا. اترك Workers والقبول النهائي على النسخة المنشورة لآخر مرحلة.

## Fixed
- Home latest-chapter anchors retain link semantics inside a real list. Both chapter positions expose a meaningful lock indicator.
- The home start action resolves the lowest-numbered live, unlocked chapter on the server; it does not assume chapter1 or label a details link as a reading action. An all-locked work offers chapter browsing instead of a false start action.
- Lifetime reads are described as "الأكثر قراءة". The recently-added rail now offers an explicit general-discovery action, avoiding a "view all" link to a different latest-chapter ordering.
- Comments/rating sign-in links preserve the current location. Editorial picks without a cover use the existing neutral placeholder.
- Dialog/sheet close controls have an Arabic name and44px hit area. Logical header spacing prevents the close control covering RTL titles. Studio title, direction and schedule controls have connected labels.
- Recommendation responses update the working revision/version. Withdrawal reloads both publication state and any separate draft after confirmed success; unsaved edits must be saved first. Action dates are normalized to the working revision representation.
- Empty private previews explain the next step, and preview metadata uses Arabic labels. Error/404 text is clearer.

## Evidence
- `node --test scripts/qa-discovery-readiness.test.mjs scripts/qa-cover-policy.test.mjs scripts/qa-cover-routes.test.mjs scripts/qa-worker-scope.test.mjs scripts/qa-upload-recovery.test.mjs`: **41 passed**, including9 new actual-component discovery regressions. The initial four regressions and the added return-location/missing-editorial-cover tests failed before their fixes.
- A local browser fixture bundles the actual `EditorialEditor` and `ReaderChrome` with simulated editorial actions; no real account or content is involved. Reproduced recommendation→approval conflict and stale published state before correction. Confirmed recommendation→approval reachesv12, withdrawal restoresv11 for both same-revision and separate-draft cases, unsaved withdrawal is refused, and an empty preview shows recovery guidance. Reusable fixture: `node scripts/qa-editorial-readiness-fixture.mjs` (loopback3038). Query modes: default, `?withdraw`, `?withdraw&separate`, `?withdraw&separate&unsaved`, `?empty`, `?settings`. Close the fixture or create its ignored `editor-stop` marker when finished; remove a stale marker before restarting.
- Actual settings dialog inspected at390×844 and1366×900 using the project styles. No title/close overlap or horizontal overflow; settled close target44×44. This is Chromium viewport testing, not touch hardware or Safari acceptance.
- Published site read-only inspection covered home, explore/filtering/no-results, work details and webtoon reading. The manhwa filter and no-results query retained URL state. The webtoon page had no broken loaded images or horizontal overflow at390px.
- Latest local home rendered the new direct reading target, semantic chapter links and truthful popularity label against an isolated loopback database. Full authenticated Next development inspection was stopped after an `ERR_MEMORY_ALLOCATION_FAILED` during studio compilation. The lightweight actual-component fixture replaced that inspection for the corrected workflows; it does not replace a full hosted end-to-end pass.
- One combined configured Claude read-only review identified the studio version bugs and material cross-flow issues; corrected and verified in one batch. The relay change tripwire reflects coordinator edits during the read-only run, not reviewer writes. Antigravity's established headless command denial was not retried or bypassed.
- TypeScript and scoped ESLint passed. The Impeccable detector returned `[]`. Existing module-type warnings and intentionally induced safe disconnect diagnostics in the Node fixtures are unchanged.

## Local setup incident
The first new audit setup inadvertently let the root Prisma configuration override the generated loopback environment. Its migration command contacted the configured database and returned **no pending migrations**; no migration was applied. Creating the subsequent fixture failed because the intended local schema was still empty. The run was stopped, the incident disclosed, and the next run used an explicit separate Prisma config that rejects any non-loopback or non-`readiness_` database. Real content, uploads and publication were not changed. The old saved QA database also failed startup and was preserved.

## Still required before release
1. Authorized deployment of the verified local commits and one final hosted smoke/acceptance pass, including real cover storage/signing, role-specific preparation→review→publication→anonymous reading and replacement. Local simulated actions do not certify hosted authorization/storage configuration.
2. Workers hosting decision/activation and hosted CPU stability evidence. Paid activation remains unverified; current-reference cover gateways add Worker/DB/signing requests. No billing action or reliability guarantee was made.
3. Real mobile/Safari reading and upload acceptance. Viewport screenshots do not prove device memory or touch/file-picker behaviour.
4. Demo inventory/removal only after backup and explicit item decisions; existing real uploads may belong to those works. SEO/final domain remain the agreed final pass.

No deployment, paid service, real publishing action, actual-upload modification, demo cleanup or email was performed. This report is a bounded readiness review, not a claim that every route, theme, failure mode or accessibility criterion is fully certified.
