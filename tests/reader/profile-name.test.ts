import { expect, test } from "bun:test";
import { cleanProfileName } from "../../src/lib/profile-name";

test("cleans whitespace and invisible characters", () => {
  expect(cleanProfileName("  سارة   أحمد ")).toEqual({ ok: true, name: "سارة أحمد" });
  expect(cleanProfileName("سا​رة‮")).toEqual({ ok: true, name: "سارة" });
});
test("enforces length and letters", () => {
  expect(cleanProfileName("س").ok).toBe(false);
  expect(cleanProfileName("ا".repeat(41)).ok).toBe(false);
  expect(cleanProfileName("!!!").ok).toBe(false);
  expect(cleanProfileName(42).ok).toBe(false);
});
test("refuses staff and brand words as whole words, normalized", () => {
  for (const name of ["الإدارة", "مشرف الموقع", "Admin", "فريق بانيورا", "BunyoraFan", "الدعم الفني", "إدارة"]) expect(cleanProfileName(name).ok).toBe(false);
});
test("ordinary names that merely contain those letters are fine", () => {
  for (const name of ["بانياس", "Bunnyan", "مشرفاوي", "Admiral", "داعم القراءة"]) expect(cleanProfileName(name).ok).toBe(true);
});
