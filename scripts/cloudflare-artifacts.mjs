import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { prepareRouteChunks } from './prepare-route-chunks.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, ".open-next");
const assets = path.join(output, "assets");
console.log(`Prepared ${await prepareRouteChunks(output)} dynamic-route chunk aliases.`);
const privateInputs = path.join(assets, "series");
if (path.dirname(privateInputs) !== assets) throw new Error("Invalid private asset cleanup target");
await rm(privateInputs, { recursive: true, force: true });
await writeFile(path.join(assets, ".assetsignore"), "/series/**\n**/*.pdf\n**/.env*\n");
await writeFile(path.join(output, "cloudflare/next-env.mjs"),
  "export const production = {};\nexport const development = {};\nexport const test = {};\n");
const { loadEnvConfig } = require("@next/env");
const { combinedEnv } = loadEnvConfig(root, false, { info() {}, error() { throw new Error("Cannot load build environment for artifact checks"); } });
const secrets = ["DATABASE_URL", "DIRECT_URL", "NEXTAUTH_SECRET", "SMTP_PASSWORD", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "EDITORIAL_CRON_SECRET"]
  .map(name => ({ name, value: combinedEnv[name] }))
  .filter(entry => entry.value && entry.value.length >= 8);

async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (!filename.startsWith(output + path.sep)) throw new Error("Invalid generated artifact path");
    if (entry.isSymbolicLink()) throw new Error("Unexpected symlink in Worker output");
    if (entry.isDirectory()) await check(filename);
    else if (/^\.env(?:\.|$)/i.test(entry.name)) await rm(filename);
    else if (filename.startsWith(assets + path.sep) && /\.pdf$/i.test(entry.name)) {
      throw new Error(`Private PDF found in generated assets: ${path.relative(assets, filename)}`);
    }
    else if (/\.(?:js|mjs|cjs|json|map|txt|html)$/.test(entry.name)) {
      const content = await readFile(filename, "utf8");
      for (const { name, value } of secrets) {
        if (content.includes(value) || content.includes(JSON.stringify(value).slice(1, -1))) {
          throw new Error(`Runtime secret ${name} found in generated artifact ${path.relative(output, filename)}`);
        }
      }
    }
  }
}
await check(output);
console.log("Worker output checked: runtime secrets must be supplied as encrypted bindings.");
