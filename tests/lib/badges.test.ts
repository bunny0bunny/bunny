import { expect, test } from "bun:test";
import { computeBadges, countedAr, type BadgeMetrics } from "../../src/lib/badges";

const zero: BadgeMetrics = { startedChapters: 0, completedChapters: 0, longestStreak: 0, finishedWorks: 0, libraryCount: 0, ratingCount: 0, commentCount: 0, genresRead: 0, bestDay: 0, signupRank: 500 };
const byId = (m: Partial<BadgeMetrics>) => Object.fromEntries(computeBadges({ ...zero, ...m }).map(b => [b.id, b]));

test("new readers see locked badges with the first target", () => {
  const b = byId({});
  expect(b.chapters.earned).toBe(false);
  expect(b.chapters.tier).toBeNull();
  expect(b.chapters.descriptionAr).toBe("أكمل 10 فصول");
  expect(b.chapters.hintAr).toBe("0/10");
  expect(b.pioneer).toBeUndefined();
});

test("tiers climb and the top tier is hard to reach", () => {
  expect(byId({ completedChapters: 99 }).chapters.tier).toBe("bronze");
  const silver = byId({ completedChapters: 120 }).chapters;
  expect(silver.tier).toBe("silver");
  expect(silver.labelAr).toBe("قارئ نهم");
  expect(silver.next).toEqual({ tier: "gold", current: 120, target: 500, labelAr: "دودة كتب" });
  expect(silver.descriptionAr).toBe("أكمل 500 فصلًا");
  const legend = byId({ completedChapters: 1500 }).chapters;
  expect(legend.tier).toBe("legendary");
  expect(legend.next).toBeNull();
  expect(byId({ longestStreak: 30 }).streak.tier).toBe("gold");
});

test("pioneer badge only for the first hundred accounts", () => {
  expect(byId({ signupRank: 100 }).pioneer.tier).toBe("legendary");
  expect(byId({ signupRank: 101 }).pioneer).toBeUndefined();
});

test("Arabic counted phrases", () => {
  const noun = { one: "عملًا واحدًا", two: "عملين", few: "أعمال", many: "عملًا" };
  expect(countedAr(1, noun)).toBe("عملًا واحدًا");
  expect(countedAr(2, noun)).toBe("عملين");
  expect(countedAr(5, noun)).toBe("5 أعمال");
  expect(countedAr(25, noun)).toBe("25 عملًا");
});
