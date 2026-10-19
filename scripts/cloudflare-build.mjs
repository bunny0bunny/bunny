import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, BUNNY_RUNTIME: "cloudflare", NEXT_TELEMETRY_DISABLED: "1" };
function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(path.join(root, "scripts/generate-worker-client.mjs"));
const adapter = path.dirname(require.resolve("@opennextjs/cloudflare"));
run(path.resolve(adapter, "../cli/index.js"), ["build"]);

// OpenNext collects local env files as fallback values. Runtime secrets must
// instead come from encrypted Worker bindings, including during local builds.
run(path.join(root, "scripts/cloudflare-artifacts.mjs"));
