import { expect, test } from "bun:test";
import { sourceDeletionEligible, sourceDeletionDate } from "../../src/lib/media/source-retention-policy";

const completed = new Date("2026-10-01T00:00:00Z");
const now = new Date("2026-10-09T00:00:00Z");
const base = { state: "ready", keepSource: false, completedAt: completed, sourceSha256: "a".repeat(64), processingProfile: "balanced-v1", sourceReviewedAt: completed, sourceDeleteAfter: sourceDeletionDate(completed), sourceDeletedAt: null };
test("seven days start at completion", () => expect(sourceDeletionDate(completed).toISOString()).toBe("2026-10-08T00:00:00.000Z"));
test("completed reviewed temporary source becomes eligible at its due instant", () => {
  expect(sourceDeletionEligible(base, now)).toBe(true);
  expect(sourceDeletionEligible(base, base.sourceDeleteAfter)).toBe(true);
  expect(sourceDeletionEligible(base, new Date(base.sourceDeleteAfter.getTime() - 1))).toBe(false);
});
test("permanent, legacy, unfinished, deleted, and unreviewed sources stay protected", () => {
  for (const change of [{ keepSource: true }, { completedAt: null }, { sourceSha256: null }, { processingProfile: null }, { state: "failed" }, { sourceDeletedAt: now }, { sourceReviewedAt: null }, { sourceDeleteAfter: null }]) expect(sourceDeletionEligible({ ...base, ...change }, now)).toBe(false);
});
test("a forged earlier schedule cannot shorten seven days", () => expect(sourceDeletionEligible({ ...base, sourceDeleteAfter: completed }, new Date("2026-10-02"))).toBe(false));
