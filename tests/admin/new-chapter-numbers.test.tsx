import { expect, mock, test } from "bun:test";
import * as React from "react";
mock.module("server-only", () => ({}));
mock.module("../../src/components/admin/admin-client", () => ({ ChapterForm: () => null }));
mock.module("../../src/lib/queries", () => ({
  currentProfileOrNull: async () => ({ id: "me", role: "contributor" }),
  getAdminSeries: async () => [{ id: "s1", titleAr: "عمل", titleOriginal: null, format: "manga", defaultReadingDirection: "rtl", defaultPresentation: "paged" }],
}));
mock.module("../../src/lib/db", () => ({ db: { chapter: {
  groupBy: async () => [{ seriesId: "s1", _max: { number: 3 } }],
  findMany: async () => [{ seriesId: "s1", number: 1 }, { seriesId: "s1", number: 2 }, { seriesId: "s1", number: 2.5 }, { seriesId: "s1", number: 3 }],
} } }));
const { default: NewChapterPage } = await import("../../src/app/admin/chapters/new/page");
function find(node: any, predicate: (node: any) => boolean): any {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) { const match = find(child, predicate); if (match) return match; }
}
test("the new chapter form gets every number already used in the work, drafts included", async () => {
  const tree = await NewChapterPage({ searchParams: Promise.resolve({ series: "s1" }) });
  const form = find(tree, (n) => Array.isArray(n.props?.seriesOptions));
  expect(form.props.seriesOptions[0].takenNumbers).toEqual([1, 2, 2.5, 3]);
  expect(form.props.seriesOptions[0].nextNumber).toBe(4);
});
