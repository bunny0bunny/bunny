import { expect, test } from "bun:test";
import { cleanHandle, coverClass, parseIdList, publicProfileHref } from "../../src/lib/public-profile-policy";

test("handles are lowercase latin, 3-24 chars, not reserved", () => {
  expect(cleanHandle("  @Reader_01 ")).toEqual({ ok: true, handle: "reader_01" });
  expect(cleanHandle("")).toEqual({ ok: true, handle: null });
  expect(cleanHandle(null)).toEqual({ ok: true, handle: null });
  expect(cleanHandle("ab").ok).toBe(false);
  expect(cleanHandle("1abc").ok).toBe(false);
  expect(cleanHandle("قارئ").ok).toBe(false);
  expect(cleanHandle("admin").ok).toBe(false);
  expect(cleanHandle("the_bunyora_fan").ok).toBe(false);
});

test("stored lists and covers read defensively", () => {
  expect(parseIdList('["a","a","b",3,"<x>"]', 6)).toEqual(["a", "b"]);
  expect(parseIdList("not json", 6)).toEqual([]);
  expect(parseIdList('["a","b","c"]', 2)).toEqual(["a", "b"]);
  expect(coverClass("nope")).toBe(coverClass("dusk"));
});

test("public link uses handle, then id; private or disabled has none", () => {
  expect(publicProfileHref({ id: "p1", handle: "sara", profilePublic: true })).toBe("/u/sara");
  expect(publicProfileHref({ id: "p1", handle: null, profilePublic: true })).toBe("/u/p1");
  expect(publicProfileHref({ id: "p1", profilePublic: false })).toBeNull();
  expect(publicProfileHref({ id: "p1", profilePublic: true, disabledAt: new Date() })).toBeNull();
});
