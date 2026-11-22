import { expect, test } from "bun:test";
import { timeAgoAr } from "../../src/lib/time-ago";

const now = Date.UTC(2026, 10, 21, 12);
const ago = (ms: number, opts = {}) => timeAgoAr(now - ms, { now, ...opts });
const M = 60000, H = 60 * M, D = 24 * H;

test("Arabic number agreement", () => {
  expect(ago(30 * 1000)).toBe("الآن");
  expect(ago(M)).toBe("قبل دقيقة");
  expect(ago(2 * M)).toBe("قبل دقيقتين");
  expect(ago(5 * M)).toBe("قبل 5 دقائق");
  expect(ago(45 * M)).toBe("قبل 45 دقيقة");
  expect(ago(2 * H)).toBe("قبل ساعتين");
  expect(ago(D)).toBe("قبل يوم");
  expect(ago(2 * D)).toBe("قبل يومين");
  expect(ago(3 * D, { prefix: "منذ" })).toBe("منذ 3 أيام");
  expect(ago(11 * D)).toBe("قبل 11 يومًا");
  expect(ago(65 * D)).toBe("قبل شهرين");
  expect(ago(400 * D)).toBe("قبل سنة");
});

test("day precision says today for recent dates", () => {
  expect(ago(3 * H, { precision: "day" })).toBe("اليوم");
  expect(ago(3 * D, { precision: "day" })).toBe("قبل 3 أيام");
  expect(timeAgoAr("not a date")).toBe("");
});
