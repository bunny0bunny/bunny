import { beforeEach, expect, mock, test } from "bun:test";
import * as React from "react";
let slots: any[] = []; let cursor = 0;
let transitionPending = false; let lifecycleEnabled = false; let effects: Array<() => void> = [];
function flushEffects() { const queued = effects; effects = []; queued.forEach(effect => effect()); }
const realReact = {...React};
mock.module("react", () => ({...realReact, useTransition() { return [transitionPending, (work: () => void) => { transitionPending = true; work(); }]; }, useEffect(effect: () => void, deps: any[]) { const index = cursor++; const previous = slots[index]; if (!previous || deps.some((value, i) => value !== previous[i])) { slots[index] = deps; if (lifecycleEnabled) effects.push(effect); } }, useRef(initial: any) { const index = cursor++; return slots[index] ??= {current:initial}; }, useState(initial: any) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (next: any) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; }}));
const push = mock(() => {}); const refresh = mock(() => {});
mock.module("next/navigation", () => ({ useRouter: () => ({push,refresh}) }));
const {NewRequestForm} = await import("../../src/components/content-requests/new-request-form");
const {AdminRequestControls} = await import("../../src/components/content-requests/admin-request-controls");
const calls: any[] = [];
let respond: () => Promise<Response>;
globalThis.fetch = (async (url: any, init: any) => { calls.push({url,body:JSON.parse(init.body)}); return respond(); }) as typeof fetch;
function find(node: any, predicate: (node: any) => boolean): any {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) { const match = find(child,predicate); if (match) return match; }
}
const render = () => { cursor=0; return NewRequestForm({initialTitle:"عنوان"}); };
const submit = (tree: any) => tree.props.onSubmit({preventDefault(){}});
beforeEach(() => { transitionPending=false;lifecycleEnabled=false;effects=[];slots=[];cursor=0;calls.length=0;push.mockClear();refresh.mockClear(); });
test("reader form retains text and UUID on explicit retry after an uncertain response", async () => {
  respond = async () => { throw Error("network"); };
  let tree = render(); find(tree,n => n.props?.id === "request-message").props.onChange({target:{value:"رسالتي الخاصة"}});
  await submit(render()); tree=render();
  expect(find(tree,n=>n.props?.id === "request-message").props.value).toBe("رسالتي الخاصة");
  expect(find(tree,n=>n.props?.role === "alert")).toBeTruthy();
  expect(find(tree,n=>n.props?.id === "request-message").props.disabled).toBe(true);
  expect(find(tree,n=>n.props?.type === "submit").props.disabled).toBe(false);
  expect(calls).toHaveLength(1); await submit(tree);
  expect(calls).toHaveLength(2); expect(calls[0].body.submissionId).toBe(calls[1].body.submissionId);
});
test("reader form blocks same-tick duplicates and confirmed-success replay", async () => {
  let finish!: (value: Response) => void;
  respond = () => new Promise(resolve => {finish=resolve;});
  const tree=render(); const first=submit(tree); await submit(tree); expect(calls).toHaveLength(1);
  finish(Response.json({ok:true,id:"owned-id"})); await first; await submit(render());
  expect(calls).toHaveLength(1); expect(push).toHaveBeenCalledWith("/requests/owned-id");
});
const detail: any = {id:"source",title:"عمل",category:"manga",status:"new",version:4,statusNote:null,seriesId:null,requesterCount:1,createdAt:"2026-10-25",updatedAt:"2026-10-25",members:[{id:"member",nickname:"قارئ",title:"عنوان",message:"رسالة",reply:null,internalNote:null,version:2,createdAt:"2026-10-25"}],workOptions:[],mergeTargets:[{id:"target",title:"الوجهة",status:"preparing",version:9,requesterCount:2}]};
function renderMerge() { cursor=0; const tree=AdminRequestControls({detail}); const element=find(tree,n=>n.props?.detail && n.type?.name === "MergeForm"); return element.type(element.props); }
test("merge requires explicit target confirmation and sends both current versions", async () => {
  respond=async()=>Response.json({ok:true,id:"target"});
  let tree=renderMerge(); await submit(tree); expect(calls).toHaveLength(0);
  find(tree,n=>n.props?.id === "merge-target").props.onChange({target:{value:"target"}}); tree=renderMerge();
  await submit(tree); expect(calls).toHaveLength(0);
  find(tree,n=>n.props?.type === "checkbox").props.onChange({target:{checked:true}}); tree=renderMerge(); await submit(tree);
  expect(calls[0].body).toEqual({targetId:"target",expectedSourceVersion:4,expectedTargetVersion:9});
  expect(push).toHaveBeenCalledWith("/admin/requests/target");
});
test("changing merge target clears the explicit confirmation", () => {
  let tree=renderMerge(); find(tree,n=>n.props?.id === "merge-target").props.onChange({target:{value:"target"}}); tree=renderMerge();
  find(tree,n=>n.props?.type === "checkbox").props.onChange({target:{checked:true}}); tree=renderMerge();
  find(tree,n=>n.props?.id === "merge-target").props.onChange({target:{value:""}}); tree=renderMerge();
  expect(find(tree,n=>n.props?.type === "submit").props.disabled).toBe(true);
});
test("admin reply addresses the original member version and keeps internal note separate", async () => {
  respond=async()=>Response.json({ok:true,id:"member"});
  const renderReply=()=>{cursor=0;const tree=AdminRequestControls({detail}); const element=find(tree,n=>n.props?.member && n.type?.name === "MemberReply");return element.type(element.props);};
  let tree=renderReply();
  find(tree,n=>n.props?.id === "reply-member").props.onChange({target:{value:"رد خاص"}});
  tree=renderReply();find(tree,n=>n.props?.id === "note-member").props.onChange({target:{value:"للإدارة فقط"}});
  await submit(renderReply());
  expect(calls[0]).toEqual({url:"/api/content-requests/member/reply",body:{expectedVersion:2,reply:"رد خاص",internalNote:"للإدارة فقط"}});
  expect(refresh).toHaveBeenCalled();
});
test("group update sends shared note and requires a public work selection for available", async () => {
  respond=async()=>Response.json({ok:true,id:"source"});
  const renderStatus=()=>{cursor=0;const tree=AdminRequestControls({detail}); const element=find(tree,n=>n.props?.detail && n.type?.name === "StatusForm");return element.type(element.props);};
  let tree=renderStatus();find(tree,n=>n.props?.id === "group-status").props.onChange({target:{value:"available"}});
  tree=renderStatus();expect(find(tree,n=>n.props?.type === "submit").props.disabled).toBe(true);
  find(tree,n=>n.props?.id === "group-work").props.onChange({target:{value:"public-work"}});
  tree=renderStatus();find(tree,n=>n.props?.id === "group-note").props.onChange({target:{value:"متاح الآن"}});
  tree=renderStatus();await submit(tree);
  expect(calls[0].body).toEqual({expectedVersion:4,status:"available",statusNote:"متاح الآن",seriesId:"public-work"});
});

for (const kind of ["status", "reply"] as const) test(`${kind} no-op save remains guarded until refresh completes, then permits a real edit with unchanged version`, async () => {
  lifecycleEnabled = true;
  respond = async () => Response.json({ok:true,id:kind === "status" ? "source" : "member"});
  const renderForm = () => { cursor=0; const tree=AdminRequestControls({detail}); const element=find(tree,n=>n.type?.name === (kind === "status" ? "StatusForm" : "MemberReply")); const result=element.type(element.props); flushEffects(); return result; };
  await submit(renderForm());
  let tree=renderForm();
  expect(find(tree,n=>n.props?.type === "submit").props.disabled).toBe(true);
  await submit(tree); expect(calls).toHaveLength(1);
  transitionPending=false; tree=renderForm();
  expect(find(tree,n=>n.props?.type === "submit").props.disabled).toBe(false);
  find(tree,n=>n.props?.id === (kind === "status" ? "group-note" : "reply-member")).props.onChange({target:{value:"تعديل بعد الحفظ"}});
  await submit(renderForm());
  expect(calls).toHaveLength(2);
  expect(calls[1].body.expectedVersion).toBe(kind === "status" ? 4 : 2);
  expect(calls[1].body[kind === "status" ? "statusNote" : "reply"]).toBe("تعديل بعد الحفظ");
});
