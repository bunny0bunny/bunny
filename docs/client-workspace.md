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
- `DIRECT_URL`: direct connection string for that same client database.
- `NEXTAUTH_SECRET`: a fresh random value has already been generated locally.
- Keep `NEXTAUTH_URL` and `APP_ORIGIN` on localhost during local development.
  Set both to the final deployment origin in the hosting environment later.
- `ACCOUNT_MAIL_MODE=disabled`: intentional until client SMTP is configured.
  Fill `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`
  for the client's sender before enabling `smtp`. No old SMTP password was copied.
- Fill `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
  `R2_BUCKET_NAME` from the client account. Use a private bucket and bucket-scoped
  S3 credentials. These variable names are reserved for the upcoming R2 upload
  implementation; filling them alone does not enable uploads.

Do not paste secrets into chat or commit them. Do not use an old production
database URL in this checkout if the goal is resource isolation.

## Current boundaries and next steps

Source files and untracked planning documents/PDF inputs were copied. Dependencies,
build output, local preview database/backups/mailbox, old `.env.local`, and Vercel
project links were not copied. Local PDF inputs in `public/series/` are excluded
from staging via `.git/info/exclude`; they remain available on disk.

The existing PDF upload design/plan documents are drafts of the earlier paid
container approach. They must be revised for the no-subscription browser conversion
proposal before implementing that feature.

No database migration, data import, deployment, or old-account disconnection has
been performed as part of workspace preparation. Once the new credentials are
saved, first inspect the new database read-only; then plan schema/data transfer
without connecting this checkout to the old live database. Test hosting compatibility
before changing the live site.

Install dependencies with `bun install --frozen-lockfile`. Avoid starting the new
preview while the existing checkout uses port 3000. `bun run dev:local` creates a
separate local preview database and captures email locally; it does not copy the
old preview data. Cloudflare deployment configuration is still pending.
