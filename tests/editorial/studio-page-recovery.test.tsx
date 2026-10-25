import { expect, mock, test } from "bun:test";
import * as React from "react";
mock.module("server-only", () => ({}));
mock.module("../../src/components/library/chrome", () => ({ SiteHeader: () => null, SiteFooter: () => null, BottomNav: () => null }));
mock.module("../../src/components/studio/editorial-editor", () => ({ EditorialEditor: () => null }));
mock.module("../../src/lib/queries", () => ({ currentProfileOrNull: async () => ({ id: "admin", role: "admin" }) }));
mock.module("../../src/lib/team-access", () => ({ isStaffRole: () => true, canManageSeries: async () => true }));
mock.module("../../src/lib/editorial", () => ({ openOrCreateDraft: async () => ({ ok: false, error: "conflict" }) }));
mock.module("../../src/lib/db", () => ({ withDatabaseScope: (work: () => unknown) => work(), db: { chapter: { findUnique: async () => ({ id: "owned-chapter", seriesId: "owned-series", series: {}, revisions: [], editorialEvents: [] }) } } }));
const { default: StudioChapterPage } = await import("../../src/app/studio/chapters/[id]/page");
function find(node: any, predicate: (node: any) => boolean): any {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) { const match = find(child, predicate); if (match) return match; }
}
test("exhausted draft initialization conflicts render a fresh-navigation retry instead of a generic error", async () => {
  const tree = await StudioChapterPage({ params: Promise.resolve({ id: "owned-chapter" }) });
  expect(find(tree, node => node.type === "h1").props.children).toBe("تعذّر فتح النسخة الآن");
  const retry = find(tree, node => node.type === "a" && node.props.href === "/studio/chapters/owned-chapter");
  expect(retry.props.children).toBe("إعادة محاولة فتح النسخة");
  expect(find(tree, node => node.props?.href === "/admin/series/owned-series")).toBeTruthy();
});
