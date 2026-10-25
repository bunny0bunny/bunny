import { beforeEach, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
mock.module("../src/lib/account-mail", () => ({ getTrustedAppOrigin: () => "https://bunny.test" }));
let scopes = 0, calls = 0;
mock.module("../src/lib/db", () => ({ withDatabaseScope: async (work: () => Promise<unknown>) => { scopes++; return work(); } }));
const { guardedContentRequest, contentRequestResponse } = await import("../src/lib/content-requests/controller");
const request = (body = '{"title":"عمل مطلوب"}', extra: Record<string, string> = {}) => new Request("https://bunny.test/api/content-requests", { method: "POST", headers: { origin: "https://bunny.test", "x-bunny-request": "1", "content-type": "application/json", ...extra }, body });
beforeEach(() => { scopes = calls = 0; });
const action = async (body: Record<string, unknown>) => { calls++; return { ok: true as const, data: { id: "owned", receivedTitle: body.title } }; };

test("valid same-origin bounded JSON invokes one scoped mutation and returns private no-store JSON", async () => {
  const response = await guardedContentRequest(request(), action);
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ ok: true, id: "owned", receivedTitle: "عمل مطلوب" }); expect(calls).toBe(1); expect(scopes).toBe(1);
});
test("cross-origin, missing intent and non-JSON mutations never reach the service", async () => {
  for (const headers of [{ origin: "https://evil.test" }, { "x-bunny-request": "" }, { "content-type": "text/plain" }]) {
    const response = await guardedContentRequest(request("{}", headers), action);
    expect([400, 403, 415]).toContain(response.status);
  }
  expect(calls).toBe(0); expect(scopes).toBe(0);
});
test("invalid JSON and non-object bodies cannot invoke a mutation", async () => {
  for (const body of ["{", "null", "[]", '"hello"']) expect((await guardedContentRequest(request(body), action)).status).toBe(400);
  expect(calls).toBe(0);
});
test("actual oversized body is refused even without a supplied Content-Length", async () => {
  const response = await guardedContentRequest(request(JSON.stringify({ message: "س".repeat(12000) })), action);
  expect(response.status).toBe(413); expect(calls).toBe(0);
});
test("valid maximum-length multilingual reply and internal note fit the byte boundary", async () => {
  const response = await guardedContentRequest(request(JSON.stringify({ reply: "語".repeat(1000), internalNote: "語".repeat(2000) })), action);
  expect(response.status).toBe(200); expect(calls).toBe(1);
});
test("authorization, ownership, quota and concurrency errors map to safe distinct responses", async () => {
  for (const [error, status] of [["unauthenticated", 401], ["forbidden", 403], ["not_found", 404], ["rate_limit", 429], ["rate_limited", 429], ["quota", 429], ["quota_exceeded", 429], ["conflict", 409], ["invalid_series", 400]] as const) {
    const response = contentRequestResponse({ ok: false, error }); expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(error); expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
});
test("unexpected service exceptions never expose database or connection details", async () => {
  const response = await guardedContentRequest(request(), async () => { throw Error("private-database-connection-secret"); });
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-database-connection-secret");
});
