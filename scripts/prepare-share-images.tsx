/** Run deliberately during content preparation; CI consumes the committed PNGs without database credentials. */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "../src/lib/db-url";
import { renderShareCard } from "../src/lib/share-card-renderer";
import { DEFAULT_SHARE_CARD_PATH, shareCardFingerprint, toShareCardData, validateSharePng, type ShareCardData, type ShareCardManifest } from "../src/lib/share-card-data";

const directory = path.join(process.cwd(), "public/share");
const manifestPath = path.join(directory, "manifest.json");
const force = process.argv.includes("--force"); // Explicitly refresh snapshot ratings as well.

async function atomicWrite(destination: string, data: string | Uint8Array) {
  const target = path.resolve(destination);
  const temporary = `${target}.${process.pid}.tmp`;
  const allowedDirectory = path.resolve(directory);
  if (path.dirname(target) !== allowedDirectory || path.dirname(temporary) !== allowedDirectory) {
    throw new Error("Share-image writes must remain inside public/share");
  }
  let writeFailed = false;
  try {
    await writeFile(temporary, data);
    await rename(temporary, target);
  } catch (error) {
    writeFailed = true;
    throw error;
  } finally {
    try {
      await rm(temporary, { force: true });
    } catch (error) {
      // Retain the original write/rename error if cleanup also fails.
      if (!writeFailed) throw error;
    }
  }
}

async function existingManifest(): Promise<ShareCardManifest | undefined> {
  try { return JSON.parse(await readFile(manifestPath, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function prepareCard(data: ShareCardData | null, assetPath: string, fingerprint: string, previous?: { path: string; fingerprint: string }) {
  const destination = path.join(directory, path.basename(assetPath));
  if (!force && previous?.fingerprint === fingerprint && previous.path === assetPath) {
    try { validateSharePng(await readFile(destination)); return; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code) throw error;
    }
  }
  const image = await renderShareCard(data);
  const bytes = new Uint8Array(await image.arrayBuffer());
  validateSharePng(bytes);
  // Complete image writes before publishing the new manifest.
  await atomicWrite(destination, bytes);
}

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) throw new Error("DATABASE_URL must be configured for share-image preparation");
const db = new PrismaClient({ datasourceUrl: databaseUrl });
try {
  // Match queries.ts liveChapterWhere; do not select draft-only or future-only works.
  const rows = await db.series.findMany({
    where: { chapters: { some: { workflow: "published", OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }] } } },
    select: { slug: true, titleAr: true, author: true, accent: true, format: true, genresJson: true, ratingAvg: true, ratingCount: true },
    orderBy: { slug: "asc" },
  });
  await mkdir(directory, { recursive: true });
  const previous = await existingManifest();
  const defaultFingerprint = await shareCardFingerprint(null);
  const manifest: ShareCardManifest = { version: 1, default: { fingerprint: defaultFingerprint, path: DEFAULT_SHARE_CARD_PATH }, cards: Object.create(null) };
  await prepareCard(null, DEFAULT_SHARE_CARD_PATH, defaultFingerprint, previous?.default);
  for (const row of rows) {
    const data = toShareCardData(row);
    const fingerprint = await shareCardFingerprint(data);
    const assetPath = `/share/${fingerprint}.png`;
    await prepareCard(data, assetPath, fingerprint, previous?.cards?.[row.slug]);
    manifest.cards[row.slug] = { fingerprint, path: assetPath };
  }
  // Old PNGs remain intact; only the allowlisted manifest entries change.
  await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Prepared share images for ${rows.length} public works and the brand fallback.`);
} finally {
  await db.$disconnect();
}
