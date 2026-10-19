# Cloudflare hosting verification — 2026-10-19

The client application is now deployed at https://bunny-library.bunny-library-bb0d8a6a.workers.dev. GitHub automatic deployment is **not** configured. No paid plan was activated.

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

The approved follow-up replaced Worker-time social image generation with prepared per-work PNGs, preserving the existing design. The complete build now measures **2,929.51 KiB gzip**, under 3,072 KiB by 142.49 KiB. Its compiler rejects the image renderer/WASM in the Worker graph. Thirteen PNGs (12 public works and a brand fallback) total 1,131,530 bytes as separate static assets. Re-running preparation skipped all unchanged images.

The full OpenNext build and TypeScript checks passed. Fourteen focused share-image/database tests passed with 70 assertions; focused lint passed. Claude's consolidated review found no must-fix issues; its optional temporary-file cleanup improvement was applied and checked. Node-only image rendering was exercised by actual preparation; a full ordinary Node release build has not been repeated.

Direct Wrangler deployment on Windows attempted an npm adapter hand-off and failed before upload. Running the installed OpenNext CLI directly succeeded; `cf:deploy` now uses that entry point while retaining artifact checks.

## Remote deployment evidence

- Cloudflare accepted the application with **17 ms startup**, version `219d9c32-03f3-4d77-9fc2-35411258a0c0` before adding the runtime bindings. Nine minimal encrypted runtime bindings were then installed; no credentials were printed or committed.
- Remote health returned 200 with database `ok`; home, public series and the webtoon reader returned 200 with document CSP.
- The actual series PNG and unknown-series fallback both returned 200 and matched their stored asset SHA-256 exactly. Series metadata used the real HTTPS Workers origin.
- A cover asset returned 200. Anonymous admin redirected to login; studio's streamed document contained the login redirect. Environment-file requests returned 404. The excluded PDF URL returned HTML rather than PDF bytes.
- Remote CSRF and credentials submission returned the expected 302 credentials rejection for a nonexistent account, with no session cookie issued and no mail sent. This is not a positive login or password-hashing capacity test.
- These are functional request checks, not sustained load/CPU measurements or a successful real-account login test. Free-plan headroom is limited; future application code can exceed it. Prepared cards require the documented manual content preparation command until publishing automation is implemented.

## Remaining before full launch

1. Complete the remaining account flows before calling the whole product production-ready. A subsequent mail-recovery check sent one authorized activation email; the user confirmed receipt, successful activation and login on the actual deployment. See [signup recovery evidence](2026-10-19-signup-mail-recovery.md). This is human confirmation, not an automated login/load test.
2. Complete the ordinary Node regression release build if releasing the Node target; the current verified deployment is Workers.
3. Check sustained traffic/CPU and asset/storage allowances before a public launch. Successful functional requests do not establish capacity or mail deliverability.
4. Connect the Cloudflare GitHub App only to `bunny0bunny/bunny`, configure `main` and the documented build/deploy commands, then verify the exact commit-triggered deployment. Wrangler OAuth currently lacks Builds API access; dashboard login is also required in the controlled browser.
5. Implement the separately approved PDF/R2 upload pipeline. Credentials and a reachable bucket do not make admin uploads functional. Worker chapter creation currently leaves an empty draft instead of writing placeholder files to disk.

Private raw verification results are kept under the ignored `.local-preview/cloudflare-hosting` directory. They must not be committed.
