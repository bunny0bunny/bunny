import type { NextConfig } from "next";
import path from "node:path";

const isCloudflare = process.env.BUNNY_RUNTIME === "cloudflare";

/**
 * Release C security hardening (docs/SECURITY_AUDIT.md §headers), updated post-C:
 * - ignoreBuildErrors removed: type safety net restored (typecheck is clean).
 * - reactStrictMode on: production unaffected; dev surfaces effect/hydration
 *   bugs (the #418 class) earlier.
 * - Static security headers on EVERY route (documents, API, assets).
 * - Content-Security-Policy moved OUT of this file: it is now a per-request,
 *   nonce-based policy generated in src/middleware.ts (strict-dynamic), the
 *   official Next.js pattern — this clears audit finding A-1. CSP is only
 *   meaningful on documents; static headers here keep covering API/assets.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  ...(isCloudflare ? { images: { unoptimized: true } } : {}),
  webpack(config, { webpack, isServer, nextRuntime }) {
    if (isCloudflare) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@prisma/client$": path.resolve(".generated/prisma-worker/client.ts"),
        "@/lib/db$": path.resolve("src/lib/db.worker.ts"),
        [path.resolve("src/lib/db.ts")]: path.resolve("src/lib/db.worker.ts"),
      };
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(
        /(?:^@\/lib\/db(?:\.ts)?$|[/\\]src[/\\]lib[/\\]db\.ts$)/,
        path.resolve("src/lib/db.worker.ts"),
      ));
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(
        /^@prisma\/client$/,
        path.resolve(".generated/prisma-worker/client.ts"),
      ));
      if (isServer && nextRuntime !== "edge") {
        config.plugins.push({
          apply(compiler: any) {
            compiler.hooks.compilation.tap("BunnyWorkerDatabase", (compilation: any) => {
              compilation.hooks.finishModules.tap("BunnyWorkerDatabase", (modules: Iterable<{ resource?: string }>) => {
                const resources = [...modules].map(module => module.resource?.replaceAll("\\", "/") ?? "");
                if (resources.some(resource => resource.endsWith("/src/lib/db.ts")) ||
                    !resources.some(resource => resource.endsWith("/src/lib/db.worker.ts"))) {
                  throw new Error("Cloudflare build must include the Worker database client and exclude the Node database client");
                }
              });
            });
          },
        });
      }
      config.externals.push(({ context, request }: { context?: string; request?: string }, callback: (error?: Error | null, result?: string, type?: string) => void) => {
        if (request?.endsWith(".wasm?module") && context) {
          return callback(null, path.resolve(context, request), "import");
        }
        callback();
      });
    }
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
