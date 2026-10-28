# Reader presentation — 2026-10-29

## Behavior

Manga now has separate paged and continuous presentation, with publisher defaults in the series form and an optional local preference per series. Reset restores the publisher choice. Paged reading retains RTL/LTR gestures, temporary direction switching and one-page-ahead preload; it adds fit-width/fit-page controls. Continuous manga has an 8px gap and native vertical scrolling. Webtoon remains gapless continuous. Existing formats, slugs, reader URLs and media objects remain unchanged. No images are duplicated, flipped, cropped or recompressed for a layout change. Two-page spreads and auto-scroll remain future work.

Series direction defaults prefill new chapters and are also enforced server-side when omitted. Existing chapters and revision directions remain untouched. Series presentation changes take effect on reload for readers without a local override. Administration labels distinguish presentation from page-turn direction; webtoon is no longer described as horizontally paged in the studio footer.

Image progress uses a page index and optional within-image fraction. Legacy records remain readable with conservative fallback where old document-relative percentages cannot identify the exact image. Geometry excludes comments/end cards and fixed reader chrome. Completion waits until the final content image bottom is visible; completion stays recorded during rereads while the progress bar reflects the current position. Recent valid positions are flushed on navigation and hidden-page events; chapter-keyed serialized writes avoid older requests overwriting newer positions. Restoration callbacks and observers are bounded and cleaned up. Continuous images outside the viewport neighborhood are unmounted while aspect-ratio placeholders preserve scroll geometry.

## Verification and review

- Final isolated PostgreSQL run: 17 suites, 129 tests passed, zero failures. All migrations were replayed in a disposable loopback database with explicit isolated environment and temporary working directory. New backend tests first failed against the old implementation. Sticky-completion assertions were strengthened after review and passed again.
- Final focused reader/adult-gate unit run: 23 tests passed, zero failures. These cover pure progress geometry, fixed-chrome viewport, anchor restoration, keyed write queue, cached unmount fallback, initialization and resize decisions, malformed offsets and existing adult consent/warning behavior. A coordinator follow-up also ensures an actually observed single-page completion can flush on exit without requiring scrolling or creating synthetic restoration writes. These tests do not simulate real browser interaction.
- Claude performed two read-only implementation reviews. The first found important unmount and comment-refresh defects; both were corrected. The second confirmed their actual effect wiring and found no remaining blocking or important issues. Both read-only checks reported no violation.
- Configured fleet models and permissions were preserved. The Codex CLI failed after stalled file reads without producing source changes. Antigravity's headless command permission was denied before UI edits. Native bounded agents and coordinator completed the authorized work; no permission bypass was used.
- Host memory exhaustion interrupted early verification. After the user freed resources, complete database and unit runs passed. Builds use a temporary directory on G and a bounded Node heap.

## Browser limits and minor behavior

The configured browser launcher was checked again and reported `BROWSER_RUNTIME_UNAVAILABLE`. Real-device checks of touch, pinch zoom, momentum scrolling and long-chapter memory have not been performed. Bounded rendering reduces decoded-image retention but does not establish a measured device memory budget. Pure helper tests and code review do not replace interaction testing.

During the short restore window after an immediate page turn, leaving may flush the last observed page rather than the requested page. Scrolling while an intentional layout/chrome restore settles can be ignored briefly. Fit-page height updates at reanchor points, so browser-address-bar-only height changes may retain the previous fit until another reanchor. These were reviewed as non-blocking limitations.

## Release preparation

Private backup refreshed on 2026-10-29: 28 tables, 640494 bytes, SHA256 verified, outside the repository. Migration `20261028170000_reader_presentation` is additive: presentation enum, two series defaults and nullable bounded progress offset. No production test fixtures or media writes are needed. Deployment and preservation results are recorded after release gates pass.

## Release result

Scoped ESLint and the complete Cloudflare build passed, including TypeScript, generated pages and the private-PDF/runtime-secret artifact scan. The successful build used a 1280MB Node heap; 768MB was insufficient for TypeScript and was not used for deployment. No type checking was disabled.

Migration `20261028170000_reader_presentation` applied successfully. Before-deploy preservation checks confirmed all backed-up IDs and existing chapter/revision directions: 3 series, 10 chapters, 20 revisions, 8 profiles, 3 requests, 11 uploads, 463 media assets, 11 progress entries, 1 public identity, 0 follows and 10 historical publication entries.

Deployed Worker version: `c2b24bb1-f6ee-4817-8039-ee9703252781`. Existing R2, self binding, CPU limit, every-minute cron and publication delivery flag remain in place. All 18 hosted HTTP checks passed, including new series presentation controls and chapter direction labels. All 32 fetched administration JavaScript assets and all 20 fetched public-reader JavaScript assets matched their respective local build SHA256 hashes; those sets overlap. The new reader chrome was present in hosted HTML. HTTP checks honor the documented Next16 streamed 404/login-redirect markers rather than accepting arbitrary 200 responses.

An actual scheduled execution after deployment completed with outcome `ok` and zero exceptions; unauthorized delivery access returned 401. Production acceptance checks used read-only data and HTTP requests, with no synthetic works, identities, follows or uploads.
