import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const prismaPackagePath = require.resolve("prisma/package.json")
const prismaPackage = JSON.parse(await readFile(prismaPackagePath, "utf8"))
const prismaCli = path.resolve(path.dirname(prismaPackagePath), typeof prismaPackage.bin === "string" ? prismaPackage.bin : prismaPackage.bin.prisma)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const output = path.join(root, ".generated/prisma-worker")
const source = await readFile(path.join(root, "prisma/schema.prisma"), "utf8")
const generators = [...source.matchAll(/^generator\s+client\s*\{[^}]*\}/gm)]
if (generators.length !== 1) throw new Error("Expected exactly one Prisma client generator")
const generator = `generator client {
  provider = "prisma-client"
  output = ${JSON.stringify(output.replaceAll("\\", "/"))}
  runtime = "workerd"
  engineType = "client"
  moduleFormat = "esm"
  generatedFileExtension = "ts"
  importFileExtension = "ts"
}`
const schema = source.replace(generators[0][0], generator)
// Generate outside the checkout so Prisma CLI cannot discover project .env files.
// Only the generator block changes; datasource and model semantics stay identical.
const staging = await mkdtemp(path.join(tmpdir(), "bunny-worker-prisma-"))
try {
  const schemaPath = path.join(staging, "schema.prisma")
  await writeFile(schemaPath, schema)
  const result = spawnSync(process.execPath, [prismaCli, "generate", "--schema", schemaPath], {
    cwd: staging,
    stdio: "inherit",
    env: { ...process.env, PRISMA_GENERATE_SKIP_AUTOINSTALL: "true", CHECKPOINT_DISABLE: "1" },
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Worker Prisma generation failed (exit ${result.status})`)
} finally {
  if (path.dirname(staging) !== path.resolve(tmpdir()) || !path.basename(staging).startsWith("bunny-worker-prisma-")) {
    throw new Error("Refusing to remove an unexpected Prisma staging directory")
  }
  await rm(staging, { recursive: true, force: true })
}
