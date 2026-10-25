import { beforeEach, expect, mock, test } from "bun:test";
import * as React from "react";

// Small component fixture: run the actual form handlers with deterministic hook slots.
// No DOM/browser automation or server mutations are involved.
let slots: any[] = [];
let cursor = 0;
let effects: (() => void)[] = [];
function fixtureEffect(effect: () => void, dependencies: any[] = []) {
  const index = cursor++;
  if (!(index in slots) || dependencies.some((value, i) => value !== slots[index][i])) { slots[index] = dependencies; effects.push(effect); }
}
function flushEffects() { const pending = effects; effects = []; for (const effect of pending) effect(); }
let storage = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} });
const actualReact = { ...React };
mock.module("react", () => ({ ...actualReact,
  useId: () => "fixture",
  useState: (initial: any) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (next: any) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
  },
  useRef: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
  useEffect: fixtureEffect,
  useLayoutEffect: fixtureEffect,
  useTransition: () => [false, (fn: any) => fn()],
}));
const push = mock(() => {});
mock.module("next/navigation", () => ({ useRouter: () => ({ push, refresh() {}, back() {} }) }));
mock.module("../../src/hooks/use-toast", () => ({ useToast: () => ({ toast() {} }) }));
mock.module("../../src/components/admin/series-cover-editor", () => ({ SeriesCoverEditor: () => null, uploadSeriesCover: mock() }));
let lastDirty = false;
mock.module("../../src/hooks/use-unsaved-changes", () => ({ useUnsavedChanges: (dirty: boolean) => {
  lastDirty = dirty;
  return { markSaved() {}, confirmLeave: () => true };
} }));
let upsert: (input: any) => Promise<any>;
const seriesCalls: any[] = [];
let create: (input: any) => Promise<any>;
const calls: any[] = [];
mock.module("../../src/lib/actions", () => ({
  createChapter: (input: any) => { calls.push(input); return create(input); },
  upsertSeries: (input: any) => { seriesCalls.push(input); return upsert(input); }, updateChapterMeta: mock(),
}));
const { ChapterForm, SeriesForm } = await import("../../src/components/admin/admin-client");
const options = [{ id: "series", titleAr: "عمل", format: "novel" as const }];
function render(seriesOptions = options): any { cursor = 0; const tree = ChapterForm({ seriesOptions, isAdmin: true, currentActorId: "actor-a" }); flushEffects(); return tree; }
function find(node: any, predicate: (node: any) => boolean): any {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) { const match = find(child, predicate); if (match) return match; }
}
const field = (tree: any, id: string) => find(tree, node => node.props?.id === `fixture-${id}`);
const submit = (tree: any) => tree.props.onSubmit({ preventDefault() {} });
beforeEach(() => { slots = []; effects = []; storage = new Map(); calls.length = 0; seriesCalls.length = 0; lastDirty = false; push.mockClear(); });

test("ChapterForm keeps inputs and stops loading after thrown network result; retry stays blocked", async () => {
  create = async () => { throw Error("offline"); };
  let tree = render();
  field(tree, "title").props.onChange({ target: { value: "عنوان محفوظ محليًا" } });
  tree = render(); field(tree, "body").props.onChange({ target: { value: "نص لم يُحفظ" } });
  tree = render(); await submit(tree); tree = render();
  expect(field(tree, "title").props.value).toBe("عنوان محفوظ محليًا");
  expect(field(tree, "body").props.value).toBe("نص لم يُحفظ");
  expect(find(tree, node => node.props?.role === "alert").props.children).toContain("تعذّر تأكيد");
  const button = find(tree, node => node.props?.type === "submit");
  expect(button.props.disabled).toBe(true);
  expect(button.props.children[0].type.displayName ?? button.props.children[0].type.name).not.toBe("LoaderCircle");
  await submit(tree);
  expect(calls).toHaveLength(1);
  expect(push).not.toHaveBeenCalled();
});

test("ChapterForm blocks same-tick duplicate submission; known validation errors permit retry", async () => {
  let complete!: (result: any) => void;
  create = () => new Promise(resolve => { complete = resolve; });
  const tree = render();
  const first = submit(tree); await submit(tree);
  expect(calls).toHaveLength(1);
  complete({ ok: false, error: "رقم مستخدم" }); await first;
  create = async () => ({ ok: false, error: "رقم مستخدم" });
  await submit(render());
  expect(calls).toHaveLength(2);
});

test("ChapterForm without assigned works explains next step and blocks creation", async () => {
  const tree = render([]);
  expect(find(tree, node => node.props?.role === "status")).toBeTruthy();
  expect(find(tree, node => node.props?.type === "submit").props.disabled).toBe(true);
  await submit(tree); expect(calls).toHaveLength(0);
});


test("confirmed chapter creation is never replayed while navigation is pending", async () => {
  create = async () => ({ ok: true, id: "created-chapter" });
  const tree = render();
  await submit(tree); await submit(tree); await submit(render());
  expect(calls).toHaveLength(1);
  expect(push).toHaveBeenCalledWith("/studio/chapters/created-chapter");
});


const initialSeries = { id: "existing", titleAr: "الأول", titleOriginal: "", slug: "existing", synopsisAr: "وصف", category: null, format: "manga" as const, status: "ongoing" as const, author: "", translator: "", genres: [], isFeatured: false };
function renderSeries(initial: any = initialSeries): any { cursor = 0; const tree = SeriesForm({ initial, currentActorId: "actor-a" }); flushEffects(); return tree; }

test("SeriesForm existing edit can save twice on the same mounted form with an updated dirty baseline", async () => {
  upsert = async () => ({ ok: true, id: "existing" });
  let tree = renderSeries();
  expect(lastDirty).toBe(false);
  field(tree, "title").props.onChange({ target: { value: "التعديل الأول" } });
  tree = renderSeries(); expect(lastDirty).toBe(true);
  await submit(tree); tree = renderSeries();
  expect(lastDirty).toBe(false);
  field(tree, "title").props.onChange({ target: { value: "التعديل الثاني" } });
  tree = renderSeries(); expect(lastDirty).toBe(true);
  await submit(tree); renderSeries();
  expect(seriesCalls).toHaveLength(2);
  expect(seriesCalls[1].titleAr).toBe("التعديل الثاني");
  expect(lastDirty).toBe(false);
});

test("SeriesForm successful creation stays guarded while navigating", async () => {
  upsert = async () => ({ ok: true, id: "created" });
  const initial = { ...initialSeries, id: undefined };
  const tree = renderSeries(initial);
  await submit(tree); await submit(tree); await submit(renderSeries(initial));
  expect(seriesCalls).toHaveLength(1);
});


test("ChapterForm restores tab text explicitly after remount and retains uncertain-outcome protection", async () => {
  create = async () => { throw Error("offline"); };
  let tree = render();
  field(tree, "title").props.onChange({ target: { value: "عنوان التبويب" } });
  tree = render(); field(tree, "body").props.onChange({ target: { value: "نص خاص للتبويب" } });
  tree = render(); await submit(tree); render();
  expect(storage.size).toBe(1);
  slots = []; effects = [];
  render(); tree = render();
  expect(field(tree, "title").props.value).toBe("");
  const restore = find(tree, node => node.props?.children === "استعادة النص");
  expect(restore).toBeTruthy(); restore.props.onClick(); tree = render();
  expect(field(tree, "title").props.value).toBe("عنوان التبويب");
  expect(field(tree, "body").props.value).toBe("نص خاص للتبويب");
  expect(find(tree, node => node.props?.type === "submit").props.disabled).toBe(true);
  await submit(tree); expect(calls).toHaveLength(1);
});

test("SeriesForm recovery restores text only, while a newer saved server snapshot rejects it", () => {
  let tree = renderSeries();
  field(tree, "title").props.onChange({ target: { value: "عنوان غير محفوظ" } });
  renderSeries();
  expect(storage.size).toBe(1);
  expect([...storage.values()][0]).not.toContain("coverPath");
  slots = []; effects = [];
  renderSeries(); tree = renderSeries();
  expect(field(tree, "title").props.value).toBe(initialSeries.titleAr);
  find(tree, node => node.props?.children === "استعادة النص").props.onClick();
  tree = renderSeries(); expect(field(tree, "title").props.value).toBe("عنوان غير محفوظ");
  slots = []; effects = [];
  const newer = { ...initialSeries, titleAr: "نسخة خادم أحدث" };
  renderSeries(newer); tree = renderSeries(newer);
  expect(field(tree, "title").props.value).toBe("نسخة خادم أحدث");
  expect(find(tree, node => node.props?.children === "استعادة النص")).toBeUndefined();
});

let routeRole = "admin";
let routeSeries: any[] = [];
let groupedInput: any;
mock.module("../../src/lib/queries", () => ({ currentProfileOrNull: async () => ({ id: "actor-a", role: routeRole }), getAdminSeries: async () => routeSeries }));
mock.module("../../src/lib/db", () => ({ db: { chapter: { groupBy: async (input: any) => { groupedInput = input; return [{ seriesId: "series", _max: { number: 35 } }]; } } } }));
const { default: NewChapterPage } = await import("../../src/app/admin/chapters/new/page");
test("real empty new-chapter route offers admins create-work and staff assignment guidance", async () => {
  routeSeries = [];
  routeRole = "admin";
  let tree = await NewChapterPage({ searchParams: Promise.resolve({}) });
  expect(find(tree, node => node.props?.href === "/admin/series/new")).toBeTruthy();
  routeRole = "contributor";
  tree = await NewChapterPage({ searchParams: Promise.resolve({}) });
  expect(find(tree, node => typeof node.props?.children === "string" && node.props.children.includes("إسناد العمل"))).toBeTruthy();
  expect(find(tree, node => node.props?.href === "/admin/series/new")).toBeUndefined();
});

test("new chapter route suggests maximum existing number plus one only for authorized works", async () => {
  routeRole = "contributor";
  routeSeries = [{ id: "series", titleAr: "عمل", format: "manga" }, { id: "empty", titleAr: "بلا فصول", format: "novel" }];
  const tree = await NewChapterPage({ searchParams: Promise.resolve({ series: "empty" }) });
  const form = find(tree, node => node.type === ChapterForm);
  expect(form.props.seriesOptions.map((s: any) => [s.id, s.nextNumber])).toEqual([["empty", 1], ["series", 36]]);
  expect(groupedInput.where.seriesId.in).toEqual(["series", "empty"]);
  routeSeries = [];
});

test("chapter number suggestion follows the selected work while allowing manual override", async () => {
  create = async () => ({ ok: false, error: "known validation" });
  const works = [{ ...options[0], nextNumber: 36 }, { id: "series-b", titleAr: "عمل ثان", format: "novel" as const, nextNumber: 8 }];
  let tree = render(works);
  expect(field(tree, "number").props.value).toBe("36");
  expect(lastDirty).toBe(false);
  find(tree, node => typeof node.props?.onValueChange === "function" && node.props.value === "series").props.onValueChange("series-b");
  tree = render(works);
  expect(field(tree, "number").props.value).toBe("8");
  field(tree, "number").props.onChange({ target: { value: "10" } });
  await submit(render(works));
  expect(calls[0].number).toBe(10);
  expect(calls[0].seriesId).toBe("series-b");
});


test("ChapterForm A/B/A keeps A recovery intact before explicit restore and reload", () => {
  const works = [...options, { id: "series-b", titleAr: "عمل ثان", format: "novel" as const }];
  let tree = render(works);
  field(tree, "title").props.onChange({ target: { value: "نص العمل أ" } });
  tree = render(works);
  const selectWork = (node: any, id: string) => find(node, item => typeof item.props?.onValueChange === "function" && works.some(work => work.id === item.props.value)).props.onValueChange(id);
  selectWork(tree, "series-b"); tree = render(works);
  field(tree, "title").props.onChange({ target: { value: "نص العمل ب" } });
  tree = render(works); selectWork(tree, "series");
  tree = render(works); tree = render(works);
  const savedA = () => [...storage.values()].map(value => JSON.parse(value)).find(value => value.entityId === "chapter:new:series");
  expect(savedA().fields.titleAr).toBe("نص العمل أ");
  expect(field(tree, "title").props.value).toBe("");
  slots = []; effects = [];
  render(works); tree = render(works);
  expect(savedA().fields.titleAr).toBe("نص العمل أ");
  find(tree, node => node.props?.children === "استعادة النص").props.onClick();
  tree = render(works);
  expect(field(tree, "title").props.value).toBe("نص العمل أ");
});
