import { expect, mock, test } from "bun:test";
import * as React from "react";
mock.module("server-only", () => ({}));
mock.module("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
mock.module("../../src/components/library/chrome", () => ({ SiteHeader: () => null, SiteFooter: () => null, BottomNav: () => null }));
mock.module("../../src/components/studio/publish-due-button", () => ({ PublishDueAdminButton: () => null }));
let assignments: any[] = [];
const ago = (min: number) => new Date(Date.now() - min * 60000);
const chapter = (id: string, status: string, min: number) => ({
  id, number: Number(id.slice(1)), title: null, seriesId: "s1", updatedAt: ago(500), workflow: "draft", format: "manga",
  series: { id: "s1", titleAr: "عمل تجريبي", titleOriginal: null, assignments: [] },
  revisions: [{ id: `r${id}`, status, revisionNumber: 1, version: 1, updatedAt: ago(min) }],
  _count: { pages: 0, editorialEvents: 0 },
});
const chapters = [chapter("c1", "published", 1), chapter("c2", "draft", 30), chapter("c3", "review", 5), chapter("c4", "approved", 2)];
mock.module("../../src/lib/queries", () => ({ currentProfileOrNull: async () => ({ id: "me", role: "contributor" }) }));
mock.module("../../src/lib/team-access", () => ({ isStaffRole: () => true, isAdminRole: () => false }));
mock.module("../../src/lib/db", () => ({ db: {
  seriesAssignment: { findMany: async () => assignments },
  chapter: { findMany: async () => chapters },
  chapterEditorialEvent: { findMany: async () => [{ chapterId: "c4" }] },
} }));
const { default: StudioPage } = await import("../../src/app/studio/page");
function all(node: any, predicate: (node: any) => boolean, out: any[] = []): any[] {
  if (!node || typeof node !== "object") return out;
  if (predicate(node)) out.push(node);
  for (const child of React.Children.toArray(node.props?.children)) all(child, predicate, out);
  return out;
}
const text = (node: any): string => typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : "";
const hrefs = (tree: any) => all(tree, (n) => typeof n.props?.href === "string").map((n) => n.props.href);

test("contributors land on the work that needs them, newest first, with a new-chapter shortcut per work", async () => {
  assignments = [{ seriesId: "s1", series: { id: "s1", titleAr: "عمل تجريبي", titleOriginal: null, coverPath: null } }];
  const tree = await StudioPage({ searchParams: Promise.resolve({}) } as any);
  const chapterLinks = hrefs(tree).filter((h) => h.startsWith("/studio/chapters/"));
  expect([...new Set(chapterLinks)]).toEqual(["/studio/chapters/c3", "/studio/chapters/c2"]);
  expect(hrefs(tree)).toContain("/admin/chapters/new?series=s1");
  expect(text(tree)).toContain("آخر تعديل منذ 5 دقيقة");
});

test("the mine filter and the empty state for people with no works", async () => {
  const mine = await StudioPage({ searchParams: Promise.resolve({ status: "mine" }) } as any);
  expect([...new Set(hrefs(mine).filter((h) => h.startsWith("/studio/chapters/")))]).toEqual(["/studio/chapters/c4"]);
  assignments = [];
  const empty = await StudioPage({ searchParams: Promise.resolve({}) } as any);
  expect(text(empty)).toContain("لم تُسند إليك أعمال بعد");
});
