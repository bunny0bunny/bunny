# Bunyora Library — approved reader design

Approved by the founder on 2026-10-09. Replace the old public-page composition with the selected content-first direction while preserving real product behavior and brand name.

## Visual authority

Reference directory: C:/Users/user/.codex/visualizations/2026/10/09/bunny-discovery-design/

The founder reaffirmed the four supplied v3/img01.png (home), img02.png (explore), img1.png (work) and img2.png (reader) boards as the final visual target on 2026-10-10. Home and explore are the current package; completion of that package does not imply completion of work, reader or the entire product.

- home-concept.png: desktop and mobile returning-reader home.
- explore-concept.png: desktop and mobile filtered discovery.
- series-detail-concept.png: desktop and mobile work page.
- reader-concept.png: desktop and mobile vertical reader.
- visual-direction.md and design-brief.md: behavior, states, limitations and decisions.

Implement actual semantic components and real data, not screenshots as a background or fixed page. Typography in generated images is approximate. Cover art and numerical values in the boards are illustrative, never a source of factual metadata. Original generated illustrations may enrich existing fictional demo titles; retain supplied originals and preserve every uploaded cover URL. See docs/demo-cover-art.md for prompts and provenance. Do not crop the UI boards into content covers.

## World and mechanics

Matte charcoal base near #101217, restrained panels near #191C25, warm white text, violet primary actions near #B497EF, limited teal state accents. Covers supply visual variety. Use the existing self-hosted IBM Plex Sans Arabic, clear hierarchy, Lucide icons, sensible corners and fine borders. No neon halos, decorative blur, gradient text, dashboard metric hero or invented new rabbit logo. Preserve usable light-mode behavior if the existing theme supports it. Provide focus, hover, disabled, loading and empty states; respect reduced motion and keyboard operation. Arabic first, RTL, isolated alternate-language titles.

## Composition

- Home: compact continue-reading module (real persisted progress), four category entries, grouped latest chapter updates, editorial collections/choices and genre discovery. Guest gets a real selected work with start action, not fabricated progress or a large empty welcome hero. Hide empty sections and limit avoidable duplicate work exposure.
- Explore: prominent search, independent category/genre/status controls, sort, result count and removable filters. Right-side filters on desktop; accessible sheet/dialog on mobile with applied-filter chips. Keep query state in the URL and preserve legacy format links. Label newest ordering according to actual query semantics.
- Series: expressive cover/header region, concise synopsis, reading action with correct resume target, save-to-library, genuine author/translator credits, accessible tabs, chapter search/order, explicit chapter/progress states, and similar works where genuinely available. Existing ratings/comments remain reachable. Do not manufacture chapter images if none exist; a cover fallback is legitimate.
- Reader: chapter content begins early, compact tools, chapter selector and previous/next. Focus mode reduces surrounding chrome without changing progress/navigation logic. Avoid covering page text with fixed controls. The reference shows webtoon; manga and novel maintain their own controls and settings.

## Categorization

Add a separate nullable Series.category enum manga/manhwa/novel/comic. format retains manga/webtoon/novel as reader layout. Backfill only unambiguous legacy manga and novel records; legacy webtoon remains unclassified until explicitly assigned. Do not silently classify all webtoon as manhwa. Existing unclassified records remain accessible under All; public labels should distinguish layout from category. Administrators choose category on existing series through authorized metadata controls. New creation accepts explicit category with format compatibility validation. Visual categories cannot use the three layout formats as a proxy.

## Review agreement

One combined review after this package, desktop+mobile captures together, one batch of material corrections and focused confirmation. No pixel-perfect image fidelity or automated design tournament required. Tests for category/filter/reading boundaries are meaningful; do not create implementation-mirroring tests for spacing. No production migration or deployment without a separate authorized action.
