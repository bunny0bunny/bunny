# Cancelled PDF upload cleanup

This maintenance command removes private R2 objects from abandoned PDF uploads. It is **not scheduled automatically**, creates no paid service, and does not list or delete arbitrary bucket objects.

Run from the repository root with the project's existing private environment loader:

```powershell
node scripts/with-env.mjs node scripts/media-cleanup.mjs
```

The default is a read-only dry-run. It returns aggregate counts, without object URLs, names, credentials or connection strings. Review the target database and bucket configuration locally before applying; the wrapper reads `.env.local` first.

```powershell
node scripts/with-env.mjs node scripts/media-cleanup.mjs --limit 5 --apply
```

`--limit` accepts 1–25 **objects**, not chapters. Run small batches during low traffic. Only explicit `--apply` enables database/storage mutations. An unexpected key, storage failure or lock failure returns a nonzero exit code; the aggregate output distinguishes these outcomes.

Use `--upload-id <exact-upload-id>` to restrict both dry-run and apply to one owned staging session. The ID is validated; wildcards and paths are rejected. The 24-hour grace and all reference checks still apply to this restricted mode.

## Safety boundaries

- Only `cancelled`, `uploading` or `failed` sessions whose `expiresAt` is at least 24 hours old are eligible. Active, `ready`, and `superseded` sessions are retained. Objects reserved in the last five minutes are retained, including cancelled sessions.
- Every key must match `media/{MEDIA_STORAGE_PREFIX}/{uploadId}/{assetId}.{extension}` exactly, with matching chapter/upload IDs and MIME extension. No fallback bucket scanning occurs.
- Every `ChapterPage.imagePath`, regardless of publication state, and every historical/draft `ChapterRevision.pagesJson` is checked for `/api/media/{assetId}`. Referenced assets are retained. Matching is deliberately conservative, including absolute URLs and longer strings containing that path.
- Apply obtains PostgreSQL write locks on the four upload/reference tables before re-reading state and references. This is the explicit safety/performance tradeoff: editorial/upload writes can pause during one R2 deletion, preventing new references during external deletion. Locks are per object, never across a batch. A 1.5-second lock timeout skips a busy item safely; each R2 request has a three-second timeout and each transaction an eight-second maximum (two-second acquisition wait). These locks require the database role to have sufficient rights; permissions failures do not trigger deletion.
- Eligible uploads are cancelled and detached from a pending revision inside the same transaction. R2 deletion happens before deletion of the asset database record. A storage failure retains the record for retry. A missing R2 object is treated as already removed. Upload records remain as an audit trail.
- If R2 deletion succeeds but the database transaction fails, the asset record remains; rerunning safely retries the same immutable key. No successful upload is made eligible by this tool.

## Scope and limitations

This is a bounded operator command, not a background job. A batch counts inspected assets, so retained records can fill a batch; investigate the retention reason rather than increasing the limit or removing safeguards. Empty expired sessions without assets are not processed here; ordinary upload status/start operations already expire and detach those sessions. Superseded successful content and objects without database records require separate retention rules and are deliberately excluded.

R2 credentials need object deletion rights only for the configured bucket. Dry-run requires database access but no storage credentials. The command does not send email, change publication state, reset byte quotas, remove original user PDF files or touch other buckets/environments.

Focused offline checks:

```powershell
node --test scripts/media-cleanup.test.mjs
node --check scripts/media-cleanup.mjs
```

Tests use controlled storage/database boundaries and never contact the production database or R2. A real `--apply` should first be exercised against a disposable staging upload, with the dry-run reviewed. No production deletion is implied by passing the offline tests.

## Hosted disposable-object verification (2026-10-20)

One explicitly owned synthetic cancelled session was aged beyond the grace period. Default dry-run reported one candidate with no mutation; scoped apply deleted exactly one R2 object and asset record. The signed storage check returned 404 afterward. The temporary series/session was removed. A general production dry-run before that probe reported zero candidates. No existing user objects were deleted.
