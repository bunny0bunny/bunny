# Manga touch navigation — 2026-10-26

The manga reader now supports edge taps and horizontal swipes through a full-width reading surface. Tap zones follow the displayed page bounds: left/right 30% navigate according to RTL/LTR, the middle 40% toggles reader chrome, and outside image margins navigate toward the adjacent edge. Existing buttons and keyboard navigation remain available. Webtoon and novel readers are unchanged.

One pointer sequence produces at most one action. Vertical movement, cancelled pointers, multiple fingers, long presses and zoomed viewports do not trigger page navigation. Native vertical scrolling and pinch zoom remain enabled. Interactive descendants, including the image retry button, are excluded.

Validation:

- `node --test tests/reader/manga-gesture.test.mjs tests/reader/manga-touch-surface.test.mjs`: 7 passing tests. Tests exercise the real component event handlers with isolated hook refs, plus gesture classification; they are not a substitute for native touch browser testing.
- `npx tsc --noEmit`: passed.
- Targeted ESLint and `git diff --check`: passed.
- Updated the existing browser regression in `tests/reader/reader-foundation.spec.ts` to cover edge navigation and center chrome toggling. It was not run: Tabbit reported `BROWSER_RUNTIME_UNAVAILABLE` during this session.

Physical mobile verification is still needed for native scrolling, pinch zoom and gesture feel. No test works or files were added to the production library. Temporary component harness files remain ignored under `.local-preview/` and its local server was stopped.

## Production acceptance

Cloudflare build and runtime-secret artifact checks passed. During post-deployment verification, uploaded dynamic-route chunks under bracket-named paths returned 404 (including the manga reader and unchanged work-detail chunks), while ordinary chunks/CSS returned 200. This blocked delivery of the reader update.

Artifact preparation now emits flat content-addressed aliases for bracket-named framework JS/CSS. The Worker handles only exact generated allowlist entries under `/_next/static/chunks/`, for GET/HEAD, through the existing static assets binding. Unknown paths and application/private routes do not use the fallback. Alias generation and request routing tests passed (2 additional tests); targeted ESLint passed. This delivery fix reuses the successfully built application bundle and is bundled by Wrangler during deployment.

Final live Worker version: `c4a393c1-5c3d-49d4-afec-dfb37fb22271`, including feature commit `b5d08bd` and delivery fix `977a33d`.

HTTP acceptance verified all 29 dynamic-route chunks return 200 with JavaScript/CSS content types and byte-for-byte SHA256 matches against the build, encoded URLs plus the raw manga URL, and the live manga bundle contains the touch-navigation code. Home, explore, login and health return 200; unknown chunks return 404; unauthenticated admin access redirects to login. Evidence is saved privately in `.local-preview/readiness-audit/manga-touch-production-verification.json`. This confirms deployment and delivery, not native mobile gesture UX, which still needs physical-device verification.
