# Manga touch navigation — 2026-10-26

The manga reader now supports edge taps and horizontal swipes through a full-width reading surface. Tap zones follow the displayed page bounds: left/right 30% navigate according to RTL/LTR, the middle 40% toggles reader chrome, and outside image margins navigate toward the adjacent edge. Existing buttons and keyboard navigation remain available. Webtoon and novel readers are unchanged.

One pointer sequence produces at most one action. Vertical movement, cancelled pointers, multiple fingers, long presses and zoomed viewports do not trigger page navigation. Native vertical scrolling and pinch zoom remain enabled. Interactive descendants, including the image retry button, are excluded.

Validation:

- `node --test tests/reader/manga-gesture.test.mjs tests/reader/manga-touch-surface.test.mjs`: 7 passing tests. Tests exercise the real component event handlers with isolated hook refs, plus gesture classification; they are not a substitute for native touch browser testing.
- `npx tsc --noEmit`: passed.
- Targeted ESLint and `git diff --check`: passed.
- Updated the existing browser regression in `tests/reader/reader-foundation.spec.ts` to cover edge navigation and center chrome toggling. It was not run: Tabbit reported `BROWSER_RUNTIME_UNAVAILABLE` during this session.

Physical mobile verification is still needed for native scrolling, pinch zoom and gesture feel. No test works or files were added to the production library. Temporary component harness files remain ignored under `.local-preview/` and its local server was stopped.
