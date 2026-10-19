import { describe, expect, test } from "bun:test";
import { shareCardFingerprint, resolveShareCardPath, toShareCardData, validateSharePng } from "../../src/lib/share-card-data";

const work = { slug: "public-work", titleAr: "عنوان", author: "كاتب", accent: "#9B7BFF", format: "novel", genresJson: '["خيال"]', ratingAvg: 4.2, ratingCount: 5 };
const hash = "a".repeat(64);
const manifest = { cards: { "public-work": { fingerprint: hash, path: `/share/${hash}.png` } } };

describe("stored share cards", () => {
  test("reader activity and rating churn leave editorial fingerprint unchanged", async () => {
    const before = await shareCardFingerprint(work);
    expect(before).toMatch(/^[a-f0-9]{64}$/);
    expect(await shareCardFingerprint({ ...work, ratingAvg: 1, ratingCount: 900, reads: 10000, updatedAt: new Date() } as typeof work)).toBe(before);
  });
  test("editorial fields, slug and renderer version invalidate the card", async () => {
    const before = await shareCardFingerprint(work);
    for (const change of [{ titleAr: "جديد" }, { author: "آخر" }, { accent: "#FFFFFF" }, { format: "manga" }, { genresJson: '["رعب"]' }, { slug: "another" }]) {
      expect(await shareCardFingerprint({ ...work, ...change })).not.toBe(before);
    }
    expect(await shareCardFingerprint(work, "next-design")).not.toBe(before);
  });
  test("serialized renderer input contains public card fields only", () => {
    expect(toShareCardData({ ...work, internalNote: "private", id: "private-id" } as typeof work)).toEqual(work);
  });
  test("selects a prepared asset for an eligible slug and brand fallback otherwise", () => {
    expect(resolveShareCardPath("public-work", manifest)).toBe(`/share/${hash}.png`);
    expect(resolveShareCardPath(null, manifest)).toBe("/share/default.png");
    expect(resolveShareCardPath("missing", manifest)).toBe("/share/default.png");
    expect(resolveShareCardPath("__proto__", manifest)).toBe("/share/default.png");
  });
  test("rejects external, traversal, query-string and malformed manifest paths", () => {
    for (const unsafe of ["https://example.com/x.png", "//example.com/x.png", "/share/../secret.png", `/share/${hash}.png?x=1`, `/share/%2e%2e/${hash}.png`, "/share/foo.png", "/share/default.png", null]) {
      expect(resolveShareCardPath("public-work", { cards: { "public-work": { fingerprint: hash, path: unsafe } } })).toBe("/share/default.png");
    }
    expect(resolveShareCardPath("public-work", { cards: { "public-work": { fingerprint: "invalid", path: `/share/${hash}.png` } } })).toBe("/share/default.png");
    expect(resolveShareCardPath("public-work", null)).toBe("/share/default.png");
  });
  test("validates PNG signature, IHDR and the required share-card dimensions", () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    const view = new DataView(png.buffer);
    view.setUint32(16, 1200); view.setUint32(20, 630);
    expect(() => validateSharePng(png)).not.toThrow();
    view.setUint32(20, 631);
    expect(() => validateSharePng(png)).toThrow();
    expect(() => validateSharePng(new Uint8Array(24))).toThrow();
  });
});
