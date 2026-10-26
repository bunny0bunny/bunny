# English-first work titles — 2026-10-26

Owner-approved rule: English work titles are primary; Arabic is secondary on the work detail page and serves as fallback when English is absent. Interface labels and chapter titles keep their existing language. Stored translations, slugs, reading progress keys and content URLs are preserved; no database migration or bulk data rewrite is involved.

`src/lib/work-title.ts` centralizes selection, fallback and title-input validation. The existing `titleOriginal` field supplies the English/romanized title; `titleAr` remains the stored Arabic title. The admin form presents English first and requires it for newly created works. Arabic is optional. Existing Arabic-only works remain editable and retain their fallback title. No automatic translation or language inference is performed.

Display coverage includes detail/card/home/library/update/profile/studio/admin views, reader headers and metadata, search/catalog suggestions, request fulfillment options, future work-related notifications and sharing. Relevant partial Series queries include both titles. Reader metadata and body share a request-cached reader lookup. Search continues matching both languages.

Share cards use the primary display title, preserve English word order, and fingerprint that title. Renderer version 3 and regenerated manifest/PNG assets replace old mock manifest entries with the current published work. Old unreferenced PNG files are retained.

Validation: 3 work-title tests and 7 stored-share tests passed; TypeScript and targeted ESLint passed. The Strobe Edge PNG was rendered and visually inspected. The independent code review found no blocking issues. Browser runtime was unavailable (`BROWSER_RUNTIME_UNAVAILABLE`), so interactive browser/mobile QA was not performed in this session.

The user's matching future-project preference is stored in the local Codex global instructions at `C:/Users/user/.codex/AGENTS.md`. It is outside this repository and does not request changing conversation or interface language.
