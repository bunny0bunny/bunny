import { describe, expect, test } from "bun:test";
import { createSubmissionGate, decodeTextDraft, encodeTextDraft, textDraftKey, shouldGuardLink, encodeFormTextDraft, decodeFormTextDraft, formTextDraftKey } from "../../src/lib/unsaved-text";

const scope = { actorId: "actor-a", chapterId: "chapter", revisionId: "revision", version: 3 };
describe("session text recovery", () => {
  test("only recovers the exact actor, chapter, revision and server version", () => {
    const encoded = encodeTextDraft(scope, { titleAr: "عنوان", novelBody: "نص خاص", pagesJson: [{ imagePath: "private" }] } as any);
    expect(decodeTextDraft(encoded, scope)).toEqual({ titleAr: "عنوان", novelBody: "نص خاص" });
    for (const changed of [{ actorId: "actor-b" }, { chapterId: "other" }, { revisionId: "next" }, { version: 4 }]) {
      expect(decodeTextDraft(encoded, { ...scope, ...changed })).toBeNull();
    }
    expect(encoded).not.toContain("private");
    expect(textDraftKey(scope)).not.toBe(textDraftKey({ ...scope, actorId: "actor-b" }));
  });
  test("malformed or unsupported drafts are ignored", () => {
    for (const value of ["broken", "null", "{}", JSON.stringify({ ...scope, schema: 9, titleAr: "x", novelBody: "x" })]) {
      expect(decodeTextDraft(value, scope)).toBeNull();
    }
  });
});
describe("submission guard", () => {
  test("blocks simultaneous actions synchronously and releases after known failures", async () => {
    const gate = createSubmissionGate();
    expect(gate.begin()).toBe(true);
    expect(gate.begin()).toBe(false);
    gate.finish();
    expect(gate.begin()).toBe(true);
    gate.finish();
  });
  test("ambiguous creation remains blocked until authoritative state is checked", () => {
    const gate = createSubmissionGate();
    gate.begin(); gate.finish(true);
    expect(gate.begin()).toBe(false);
  });
});
test("navigation guard respects modified/new-tab clicks and hash-only navigation", () => {
  const base = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
  expect(shouldGuardLink(base, "_self", "https://bunny.test/admin", "https://bunny.test/studio")).toBe(true);
  expect(shouldGuardLink({ ...base, ctrlKey: true }, "", "https://bunny.test/admin", "https://bunny.test/studio")).toBe(false);
  expect(shouldGuardLink(base, "_blank", "https://bunny.test/admin", "https://bunny.test/studio")).toBe(false);
  expect(shouldGuardLink(base, "", "https://bunny.test/studio#preview", "https://bunny.test/studio")).toBe(false);
});


test("form recovery is actor/entity/server-snapshot bound and rejects non-allowlisted fields", () => {
  const scope = { actorId: "actor-a", entityId: "series:1", serverSnapshot: "server-v1" };
  const fields = { titleAr: "نص", synopsisAr: "وصف" };
  const encoded = encodeFormTextDraft(scope, fields);
  expect(decodeFormTextDraft(encoded, scope, ["titleAr", "synopsisAr"])).toEqual(fields);
  for (const changed of [{ actorId: "actor-b" }, { entityId: "series:2" }, { serverSnapshot: "server-v2" }]) {
    expect(decodeFormTextDraft(encoded, { ...scope, ...changed }, ["titleAr", "synopsisAr"])).toBeNull();
  }
  const polluted = JSON.stringify({ ...JSON.parse(encoded), fields: { ...fields, coverPath: "/private/cover" } });
  expect(decodeFormTextDraft(polluted, scope, ["titleAr", "synopsisAr"])).toBeNull();
  expect(formTextDraftKey(scope)).not.toBe(formTextDraftKey({ ...scope, actorId: "actor-b" }));
});
