import { cp, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
// The official legacy build includes compatibility polyfills in both realms.
// Keep main and worker on the same build/version for Safari and older engines.
const build = "legacy";
const target = path.join(root, "public/vendor/pdfjs");
const marker = path.join(target, "version.json");
const previous = await readFile(marker, "utf8").then(JSON.parse, () => null);
const entries = ["pdf.min.mjs", "pdf.worker.min.mjs"];
const directories = ["cmaps", "standard_fonts", "wasm"];
if (previous?.version === version && previous?.build === build && (await Promise.all([...entries, ...directories].map(name => stat(path.join(target, name)).then(() => true, () => false)))).every(Boolean)) {
  console.log(`PDF.js ${version} client assets are ready.`);
  process.exit(0);
}
await mkdir(target, { recursive: true });
for (const name of entries) await cp(path.join(source, build, "build", name), path.join(target, name));
for (const name of directories) await cp(path.join(source, name), path.join(target, name), { recursive: true });
await cp(path.join(source, "LICENSE"), path.join(target, "LICENSE"));
await writeFile(marker, JSON.stringify({ version, build }) + "\n");
console.log(`Prepared PDF.js ${version} static client assets.`);
