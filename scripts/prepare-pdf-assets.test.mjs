import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const version = "6.4.299";
const entries = ["pdf.min.mjs", "pdf.worker.min.mjs"];
const directories = ["cmaps", "standard_fonts", "wasm"];

async function fixture(t, marker = { version }) {
  const root = await mkdtemp(path.join(tmpdir(), "bunny-pdf-assets-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "node_modules/pdfjs-dist");
  const target = path.join(root, "public/vendor/pdfjs");
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(source, "legacy/build"), { recursive: true });
  await mkdir(path.join(source, "build"), { recursive: true });
  await mkdir(target, { recursive: true });
  await cp(new URL("./prepare-pdf-assets.mjs", import.meta.url), path.join(root, "scripts/prepare-pdf-assets.mjs"));
  await writeFile(path.join(source, "package.json"), JSON.stringify({ name: "pdfjs-dist", version }));
  await writeFile(path.join(source, "LICENSE"), "PDF.js license fixture");
  for (const name of entries) {
    await writeFile(path.join(source, "build", name), `modern ${version} ${name}`);
    await writeFile(path.join(source, "legacy/build", name), `legacy ${version} ${name}`);
    await writeFile(path.join(target, name), marker.build === "legacy" ? `cached legacy ${name}` : `old modern ${name}`);
  }
  for (const name of directories) {
    await mkdir(path.join(source, name));
    await writeFile(path.join(source, name, "asset.bin"), `${name} shared resource`);
    await mkdir(path.join(target, name));
  }
  await writeFile(path.join(target, "version.json"), JSON.stringify(marker));
  return {
    source, target,
    run: () => execute(process.execPath, [path.join(root, "scripts/prepare-pdf-assets.mjs")], { cwd: root }),
    read: name => readFile(path.join(target, name), "utf8"),
  };
}

test("version-only cache is replaced with matched legacy main and worker plus unchanged resource paths", async t => {
  const f = await fixture(t);
  await f.run();
  for (const name of entries) assert.equal(await f.read(name), `legacy ${version} ${name}`);
  assert.deepEqual(JSON.parse(await f.read("version.json")), { version, build: "legacy" });
  for (const name of directories) assert.equal(await f.read(`${name}/asset.bin`), `${name} shared resource`);
  assert.equal(await f.read("LICENSE"), "PDF.js license fixture");
});

test("matching legacy cache is reused but missing worker regenerates the matched pair", async t => {
  const f = await fixture(t, { version, build: "legacy" });
  await f.run();
  assert.equal(await f.read(entries[0]), `cached legacy ${entries[0]}`);
  await rm(path.join(f.target, entries[1]));
  await f.run();
  for (const name of entries) assert.equal(await f.read(name), `legacy ${version} ${name}`);
});

test("same-version modern flavor marker cannot suppress legacy regeneration", async t => {
  const f = await fixture(t, { version, build: "modern" });
  await f.run();
  for (const name of entries) assert.equal(await f.read(name), `legacy ${version} ${name}`);
});
