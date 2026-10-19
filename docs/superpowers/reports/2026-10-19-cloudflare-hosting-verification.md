# Cloudflare hosting verification — 2026-10-19

The client repository now has a reviewable OpenNext/Workers preparation branch. It has **not** been published as the application, and GitHub automatic deployment is **not** configured.

## Confirmed

- Claude architecture debate completed before implementation; a separate Claude review identified the Prisma WebAssembly packaging risk. The build now explicitly selects the Worker database module, rejects the Node module, and externalizes precompiled WASM for Wrangler.
- Next 16.4.1, matching ESLint configuration, OpenNext 1.20.12 and Wrangler 4.151.1 are installed. Prisma/Neon adapter remain 6.19.3.
- Complete OpenNext build succeeded, including Next compilation and TypeScript checks. Targeted lint passed. Eight database ownership/transaction tests passed with 43 assertions.
- Local `workerd` returned 200 for database health, home, discovery, login, series and reader. Document CSP was present. Anonymous admin access redirected; the streamed studio response contained the login redirect rather than the workspace.
- The share image returned a PNG (111,060 bytes); the font binding worked. A negative credentials request exercised an interactive transaction, verified by the expected rate-limit counter increment. This was not a successful real-account login test.
- Environment file requests returned 404. Generated static assets exclude the original PDF inputs. A `/series/<PDF filename>` request matched the dynamic series route and returned HTML, not the PDF; its HTTP status was 200 because of streamed rendering.
- Generated environment fallback modules were cleared, copied `.env*` artifacts removed, and configured runtime secret values checked without disclosing them. Original local input files and environment files remain private and untracked.
- Cloudflare account access matched the client R2 account. R2 bucket HEAD returned 200; no objects were written.
- Gmail authentication succeeded on a temporary remote Cloudflare probe with a direct hostname/SNI TLS socket. No message was sent. The temporary Worker and its local credential copy were removed.
- Previous source database, Vercel project and repository were not modified by this hosting work.

## Measured limit

Wrangler dry-run measured **4,037.55 KiB gzip** initially and **3,677.22 KiB gzip** with additional minification. The latter is approximately 3.59 MiB, above the free 3 MiB compressed Worker limit. No paid subscription has been activated.

The measured modules include the Prisma query compiler, share-image rendering WASM and the application. Replacing dynamic social share images with static branded images is a possible further optimization, but its final size has not been tested. It must not be promised to fit before rebuilding and measuring.

## Remaining before publishing

1. Choose the hosting constraint: approve Workers Paid, try a smaller bundle with static social images, or retain another host while using R2 for media. Do not activate billing silently.
2. Set minimal encrypted runtime bindings and the real canonical HTTPS origin, then deploy and test the remote application. The original root metadata lacks `metadataBase`; fix canonical share URLs before release. A positive real-account login/session test remains required.
3. Complete the Node regression release build after the final implementation choice. Do not treat local workerd tests as evidence of remote CPU limits or deliverability.
4. Connect the Cloudflare GitHub App only to `bunny0bunny/bunny`, configure `main` and the documented build/deploy commands, then verify the exact commit-triggered deployment. Wrangler OAuth currently lacks Builds API access; dashboard login is also required in the controlled browser.
5. Implement the separately approved PDF/R2 upload pipeline. Credentials and a reachable bucket do not make admin uploads functional. Worker chapter creation currently leaves an empty draft instead of writing placeholder files to disk.

Private raw verification results are kept under the ignored `.local-preview/cloudflare-hosting` directory. They must not be committed.
