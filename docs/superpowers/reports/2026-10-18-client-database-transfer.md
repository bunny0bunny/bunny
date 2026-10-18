# Client database and mail setup — 2026-10-18

The client checkout is connected only to `bunny0bunny/bunny`. The owner authorized
copying the source database and reusing the existing project SMTP settings.

## Plan review and execution

The configured Claude `debate` lane reviewed the secret-free plan in read-only
mode. Its important correction was adopted: run versioned migrations through
Prisma before restoring data, because new PostgreSQL enum values cannot be used
until the transaction adding them commits. The review detected no working-tree
changes. Live database and mail operations were performed by the coordinator.

The new environment initially used a pooled URL for both database variables.
`DATABASE_URL` remains pooled; `DIRECT_URL` now uses the corresponding validated
direct endpoint. The new endpoint differs from the source. Both databases run
PostgreSQL 18. Only local ignored environment files contain connection strings.

The source was read inside a consistent read-only transaction. A private snapshot
of 20 tables / 891 rows, including original migration history, was saved outside
version control. The empty target received eight migrations via Prisma. Source
and target schema catalogs matched, with all eight migration names/checksums
matching as well. A Git attributes rule now preserves LF migration SQL bytes.

All 19 application tables were restored in foreign-key order inside one target
transaction. Every table's row count and database-computed full-row digest
matched the source snapshot before commit. Prisma owns the target migration
history, so its execution IDs and timestamps intentionally differ from the source.

The copied application data includes:

| Records | Count |
| --- | ---: |
| Series | 12 |
| Chapters | 47 |
| Chapter pages | 295 |
| Chapter revisions | 50 |
| Editorial events | 51 |
| Profiles | 4 |

One still-active legacy account link was revoked on the target after exact copy
verification. Other account data, IDs, password hashes and timestamps were
preserved. The new session secret was retained, so source sessions do not carry
over. The source database was not modified. This is a snapshot transfer, not
ongoing synchronization or a final traffic cutover.

## Verification and boundaries

- Post-commit data verification passed, accounting for the one intentional token
  revocation. Prisma migration status is current; live schema diff is empty.
- SMTP settings were copied only into the new ignored `.env.local` with the
  owner's authorization. Secure connection and authentication passed; no test
  email was sent in this step.
- R2 bucket access had already passed a read-only HEAD check. This does not
  establish that upload or PDF preparation functionality exists.
- No Cloudflare hosting deployment, DNS cutover, or old-service deletion occurred.
- Private snapshots, operator scripts, mail credentials and R2 credentials are
  excluded from Git. The new checkout does not use the old database at runtime.

Runtime smoke tests passed on `http://localhost:3001`: database health, home,
explore, series, chapter reader, login and registration pages, an actual reader
image, and authenticated profile/library pages after signing in with a copied
reader account. A token signed with the old session secret was rejected by the
new secret. The login intentionally created normal analytics/rate-limit records
on the new database after snapshot verification. No signup/reset email flow was
executed and no full production build was rerun for this configuration-only work.
Detailed aggregate evidence is kept in the ignored transfer directory.
