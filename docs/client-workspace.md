# Client workspace setup

This checkout belongs to `bunny0bunny/bunny`. It is independent of the original
checkout in `website/v3/banny`. Existing commit authors remain in Git history.

## GitHub access

The only remote is `git@github.com:bunny0bunny/bunny.git`.
Repository-local SSH configuration selects the dedicated key
`C:/Users/user/.ssh/bunny-client-ed25519` with `IdentitiesOnly=yes`.
No global SSH or Git credential configuration was changed.

Add the contents of `C:/Users/user/.ssh/bunny-client-ed25519.pub` to the new
repository's **Settings > Deploy keys > Add deploy key**, with **Allow write
access** enabled. Upload only the `.pub` contents. The private key stays on this
computer. After authorization, check access and push `main` from this checkout.

Future commits use repository-local identity `Bunny Library`
(`<bunny0bunny@users.noreply.github.com>`); this does not authenticate GitHub.

## Fill the ignored environment file

Edit `.env.local` in this checkout only. It is ignored by Git.

- `DATABASE_URL`: new client Neon pooled connection string.
- `DIRECT_URL`: direct connection string for that same client database. The initial
  duplicate pooled value was corrected and the direct endpoint was verified.
- `NEXTAUTH_SECRET`: a fresh random value has already been generated locally.
- Keep `NEXTAUTH_URL` and `APP_ORIGIN` on localhost during local development.
  Set both to the final deployment origin in the hosting environment later.
- SMTP is now configured locally with `ACCOUNT_MAIL_MODE=smtp`. The existing
  project sender settings were reused with the owner's explicit authorization;
  TLS connection and authentication were verified without sending a message.
- Fill `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
  `R2_BUCKET_NAME` from the client account. Use a private bucket and bucket-scoped
  S3 credentials. These variable names are reserved for the upcoming R2 upload
  implementation; filling them alone does not enable uploads.

Do not paste secrets into chat or commit them. Do not use an old production
database URL in this checkout if the goal is resource isolation.

## Current boundaries and next steps

Source files and untracked planning documents/PDF inputs were copied. Dependencies,
build output, old local preview database/backups/mailbox, the complete old
`.env.local`, and Vercel project links were not copied. Only authorized SMTP
settings were subsequently reused. Local PDF inputs in `public/series/` are excluded
from staging via `.git/info/exclude`; they remain available on disk.

The existing PDF upload design/plan documents are drafts of the earlier paid
container approach. They must be revised for the no-subscription browser conversion
proposal before implementing that feature.

The new database now has all eight migrations and the source data. A consistent
read-only snapshot of the source was retained privately under `.local-preview`.
All application data tables matched before committing the restore; one active
legacy account token was then revoked on the new database. Target migration
history records reflect the new Prisma deployment, with matching names/checksums.
The source database was not modified. These databases are independent and do not
synchronize future changes. See the transfer report for validation details.

Cloudflare hosting deployment and old-account disconnection remain pending.
Test hosting compatibility before changing the live site. R2 connectivity is
verified, but the PDF upload feature has not been implemented yet.

Dependencies were installed with `bun install --frozen-lockfile`. Avoid starting the new
preview while the existing checkout uses port 3000. `bun run dev:local` creates a
separate local preview database and captures email locally; it does not copy the
old preview data. Cloudflare deployment configuration is still pending.

The client runtime was smoke-tested on port 3001 against its new Neon database.
That preview process overrides `NEXTAUTH_URL` and `APP_ORIGIN` to port 3001 in its
own environment; `.env.local` retains port 3000 for the ordinary `bun run dev`
command. Stop the old preview before using the ordinary command on port 3000.
