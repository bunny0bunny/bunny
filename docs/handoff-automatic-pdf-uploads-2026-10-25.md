# Automatic PDF uploads — deployed 2026-10-25

The upload system now applies automatically to future PDFs. Implementation commit: `e4e8eae`. Live site: https://bunny.bunny-library.workers.dev . Cloudflare version: `ef4a24a5-09b8-492c-b5e9-0184e9043dd2`.

## Upload workflow

1. Open the intended chapter draft in Studio and save draft changes.
2. Choose a PDF and keep the default balanced quality, or select higher quality. Current limits are 30 MiB and 200 pages.
3. Start uploading. The browser processes one page at a time, uses WebP with JPEG fallback, avoids enlarging recognized full-page scans, and reports actual received bytes.
4. If interrupted, reopen the draft and select the same PDF. The server verifies its SHA256, size, page count, processing profile and revision before reporting which completed parts to skip. Processing does not continue after closing the tab.
5. Open the private preview and check page order and readability. Confirm the import review. Uploading prepares a draft; normal editorial review/publication remains a separate action.
6. The first page is suggested as a cover. Admins can open the existing cover editor, choose the uploaded first page and crop it. No existing public cover is overwritten automatically.

## Storage policy

New originals are private and temporary by default. Only the original PDF becomes eligible for deletion after successful completion, explicit import review and seven days from completion. Reader images remain stored. Permanent retention can be selected before upload or changed afterward, until deletion has begun. Existing uploads remain permanent and are not enrolled retroactively.

Minute maintenance is bounded and authenticated using the existing scheduled Worker/self binding. It also handles abandoned new uploads and immutable failed reservation objects, with reference checks and attachment fences. No new paid service was introduced.

## Verification

- 102 focused unit, route, UI, asset compatibility and isolated PostgreSQL integration tests passed. Failed upload recovery, mismatched identities, incomplete imports, legacy protection and source-only deletion were exercised. Actual expiry/deletion was tested with advanced time only in an isolated local database.
- Direct TypeScript, scoped ESLint, Cloudflare production build and private-artifact/secret scan passed.
- Additive migration `20261025120000_pdf_source_retention` was rehearsed against isolated PostgreSQL, then applied through versioned migration deployment after a consistent private production snapshot.
- The supplied PDF produced 45 ordered images, 18,444,702 bytes (17.59 MiB), using the actual processing code with native Node canvas. Original bytes remained unchanged. Cover, middle and dense Arabic text samples were visually inspected. Compression ratios are not guaranteed; browser encoders can produce different sizes.
- Hosted acceptance passed 125 checks using the original PDF and all 45 processed pages in an owned temporary private chapter. Verified resume skip state, file/profile mismatch rejection, received byte totals, source policy changes, draft isolation, anonymous access denial and readback fingerprints. The temporary chapter, account and all 46 temporary R2 objects were removed afterward. No real chapter was published.
- Seven public-route smoke checks passed. Remote readback confirmed the deployed version at 100%, R2/self/secret/database bindings, minute cron and 30,000 ms CPU limit.
- Final integrity comparison matched every pre-existing upload, asset, revision, public page and cover: 12 uploads, 68 assets, 53 revisions and 295 chapter pages. Existing mock/catalog data was preserved.

## Compatibility and remaining verification limit

The matched official PDF.js legacy main and worker replace the modern pair, fixing a discovered dependency on APIs missing from some browser versions. A build-flavor marker prevents old generated modern assets from being reused. Three regression tests passed, and both deployed files matched the tested assets byte-for-byte. See the [official PDF.js support policy](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions#which-browsersenvironments-are-supported).

Native browser automation was unavailable in this session. Actual file-picker interaction, mobile behavior and Safari device acceptance remain unverified. The Node rendering harness and hosted HTTP checks do not constitute those browser tests.

Private snapshots and detailed acceptance reports remain under the ignored `.local-preview/readiness-audit/` directory; no credentials or database snapshots were committed.
