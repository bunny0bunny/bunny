# Cloudflare hosting

Status (2026-10-19): Preparing share images as static PNGs reduced the complete minified Worker from **3,677.22 to 2,929.51 KiB gzip**, below the free 3 MiB limit. The application is deployed at [the client Workers URL](https://bunny-library.bunny-library-bb0d8a6a.workers.dev); remote database, home, series, reader, share images and anonymous access checks passed. GitHub automatic builds are not connected. No paid plan has been activated. R2 chapter uploads remain a separate, unfinished feature.

Evidence: [hosting verification report](superpowers/reports/2026-10-19-cloudflare-hosting-verification.md).

## Build and deploy

Use the client-owned `bunny0bunny/bunny` repository and Cloudflare account. Keep the previous repository, Vercel project and database unchanged.
Wrangler pins the verified client account ID explicitly so a different local CLI login cannot silently redirect deployment to the previous account.

```sh
bun install --frozen-lockfile
bun run cf:build
bun run cf:deploy
```

The adapter targets Workers with `nodejs_compat`, not Pages static hosting. `cf:build` selects the separate engineless Prisma client; ordinary `bun run dev` and `bun run build` retain the Node client. The Worker build rejects the Node database module. Prisma's precompiled WebAssembly stays a separate module for Wrangler.

The build and deploy commands sanitize generated output: local environment fallbacks are removed, runtime secret values are checked, and `public/series` PDF inputs are excluded from generated static assets. Original input files remain untouched. Use `cf:deploy`, rather than bypassing these checks with a raw deploy command. Never commit `.env.local`, `.dev.vars`, `.local-preview`, `.generated`, `.next`, or `.open-next`.

## Runtime bindings

Set these as encrypted Worker secrets, using local values without printing them:

- `DATABASE_URL`: the client's pooled Neon URL.
- `NEXTAUTH_SECRET`: the client's existing session secret.
- `NEXTAUTH_URL` and `APP_ORIGIN`: the same canonical HTTPS deployment origin.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: the approved Gmail sender; Workers use port 465 with validated TLS and hostname/SNI preserved.

`BUNNY_RUNTIME=cloudflare` and `ACCOUNT_MAIL_MODE=smtp` are plain configuration variables in Wrangler. Do not put `DIRECT_URL` in the Worker: migrations are a separate, deliberate release step. Do not migrate, reset, or seed production automatically on each push.

Images are served without the paid Images binding. The default cache implementation does not provision paid cache services. Do not enable Workers Paid without approval; measure the complete compressed Worker and test real request CPU limits first.

## GitHub automatic builds

CLI authentication/deployment and Git integration are separate. The Cloudflare GitHub App must be authorized for **only `bunny0bunny/bunny`**. Connect it to the `bunny-library` Worker, then configure:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | repository root |
| Build command | `bun run cf:build` |
| Deploy command | `bun run cf:deploy` |

Install dependencies with the committed lockfile. Runtime secrets belong to Worker bindings; the application build does not need production database credentials. Verify a build against the exact pushed commit before claiming automatic deployment works. Preview branches must not be given production credentials by default.

## Acceptance checks

- Consolidated typecheck, focused lint, and Worker database ownership tests.
- Successful OpenNext and Wrangler bundle, measured against the actual account plan.
- `/api/health` succeeds against client Neon.
- Homepage, discovery, series, reader assets and share image render; document CSP stays present.
- Anonymous admin/studio access is rejected; login/session and an interactive database transaction work in the Worker runtime.
- SMTP connection/authentication works; do not send test messages without explicit authorization.
- Original PDF inputs and environment files are unavailable over HTTP.
- A GitHub push produces a successful build/deployment for that exact commit.

## Prepared social share images

Cloudflare serves prepared 1200×630 PNG cards instead of loading the image renderer on every request. These are social link preview images; reader pages, covers and R2 chapter media are separate. The Node runtime retains dynamic rendering.

After preparing or changing public content, run locally with the client's database environment:

```sh
bun run share:prepare
```

Commit `public/share/manifest.json` and the generated PNGs with the content release. The command reads only public works with an already published, due chapter, writes images before replacing the manifest, and skips unchanged valid images. It does not write to the database. Editorial changes create a new content-addressed image; `bun run share:prepare --force` also refreshes rating snapshots. Old images are retained to keep existing links valid.

CI consumes committed assets without database access. New works without a prepared image receive the library brand card until preparation runs. This command is currently manual; automatic generation from the admin/R2 publishing pipeline is not implemented. A compiler guard rejects accidental inclusion of the image renderer/WASM in the Worker.

## Upload limitation

R2 credentials being valid does not make admin uploads work. The application currently has no PDF upload pipeline or direct-to-R2 upload endpoint. On Workers, creating a non-novel chapter creates an empty draft instead of attempting persistent filesystem writes. The approved upload feature still needs implementation, preview, authorization, storage validation and editorial approval integration before chapter uploads can be presented as working.
