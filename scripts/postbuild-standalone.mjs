/**
 * Post-build: assemble the self-hostable standalone server folder.
 *
 * `output: "standalone"` produces .next/standalone, but Next.js intentionally
 * leaves .next/static and /public OUT of it (the official docs instruct a
 * manual copy). That copy is ONLY needed when running the standalone server
 * yourself (bun run start / Docker). On Vercel the platform serves assets
 * itself, and the folder may or may not be collected — so this script is a
 * guarded no-op there instead of a hard `cp` that can fail the build.
 */
import { existsSync, cpSync } from "node:fs";

const root = process.cwd();

if (process.env.BUNNY_RUNTIME === "cloudflare") {
  // OpenNext collects .next/static and public directly; avoid a second copy.
  console.log("[postbuild] OpenNext manages Cloudflare assets — skipping standalone asset copy");
  process.exit(0);
}

if (!existsSync(`${root}/.next/standalone`)) {
  console.log("[postbuild] no .next/standalone — skipping asset copy (hosted platform)");
  process.exit(0);
}

cpSync(`${root}/.next/static`, `${root}/.next/standalone/.next/static`, { recursive: true });
cpSync(`${root}/public`, `${root}/.next/standalone/public`, { recursive: true });
console.log("[postbuild] standalone ready: .next/static + public copied (self-host)");
