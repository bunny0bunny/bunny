export type TextDraftScope = { actorId: string; chapterId: string; revisionId: string; version: number };
export type TextDraft = { titleAr: string; novelBody: string };
export function textDraftKey(scope: TextDraftScope) {
  return `bunny:editor-text:${encodeURIComponent(scope.actorId)}:${encodeURIComponent(scope.chapterId)}:${encodeURIComponent(scope.revisionId)}:${scope.version}`;
}
export function encodeTextDraft(scope: TextDraftScope, text: TextDraft) {
  // Explicit allowlist: never persist private media paths, upload IDs or arbitrary editor state.
  return JSON.stringify({ schema: 1, ...scope, titleAr: text.titleAr, novelBody: text.novelBody });
}
export function decodeTextDraft(raw: string | null, scope: TextDraftScope): TextDraft | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || value.schema !== 1 || Object.entries(scope).some(([key, expected]) => value[key] !== expected) || typeof value.titleAr !== "string" || typeof value.novelBody !== "string") return null;
    return { titleAr: value.titleAr, novelBody: value.novelBody };
  } catch { return null; }
}
export function createSubmissionGate() {
  let busy = false;
  let uncertain = false;
  return {
    begin() { if (busy || uncertain) return false; busy = true; return true; },
    finish(ambiguous = false) { busy = false; uncertain = ambiguous; },
  };
}
export function shouldGuardLink(event: Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">, target: string, href: string, currentHref: string) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || (target && target !== "_self")) return false;
  const next = new URL(href, currentHref);
  const current = new URL(currentHref);
  return ["http:", "https:"].includes(next.protocol) && (next.origin !== current.origin || next.pathname !== current.pathname || next.search !== current.search);
}
export type FormTextDraftScope = { actorId: string; entityId: string; serverSnapshot: string };
export function formTextDraftKey(scope: FormTextDraftScope) {
  return `bunny:form-text:${encodeURIComponent(scope.actorId)}:${encodeURIComponent(scope.entityId)}`;
}
export function encodeFormTextDraft(scope: FormTextDraftScope, fields: Record<string, string>) {
  return JSON.stringify({ schema: 1, ...scope, fields });
}
export function decodeFormTextDraft(raw: string | null, scope: FormTextDraftScope, allowedFields: readonly string[]): Record<string, string> | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || value.schema !== 1 || Object.entries(scope).some(([key, expected]) => value[key] !== expected) || !value.fields || typeof value.fields !== "object" || Array.isArray(value.fields)) return null;
    if (Object.keys(value.fields).length !== allowedFields.length || Object.keys(value.fields).some(key => !allowedFields.includes(key) || typeof value.fields[key] !== "string")) return null;
    return Object.fromEntries(allowedFields.map(key => [key, value.fields[key]]));
  } catch { return null; }
}
