import { beforeEach, expect, mock, test } from "bun:test";
let scopes = 0, runs = 0;
mock.module("../../src/lib/db", () => ({ withDatabaseScope: async (run: () => Promise<unknown>) => { scopes++; return run(); } }));
const summary = { examined: 0, deleted: 0, skipped: 0, failed: 0 };
mock.module("../../src/lib/media/source-retention", () => ({
  maintainCompletedSources: async ({ limit }: { limit: number }) => { expect(limit).toBe(5); runs++; return summary; },
  maintainAbandonedUploads: async ({ limit }: { limit: number }) => { expect(limit).toBe(3); runs++; return summary; },
}));
const route = await import("../../src/app/api/media/maintenance/route");
beforeEach(() => { scopes = 0; runs = 0; process.env.EDITORIAL_CRON_SECRET = "test-secret"; });
test("missing, empty, and wrong bearer tokens cannot enter database scope", async () => {
  for (const authorization of ["", "Bearer wrong", "test-secret"]) {
    expect((await route.POST(new Request("https://test.invalid/api/media/maintenance", { method: "POST", headers: { authorization } }))).status).toBe(401);
  }
  process.env.EDITORIAL_CRON_SECRET = " ";
  expect((await route.POST(new Request("https://test.invalid/api/media/maintenance", { method: "POST", headers: { authorization: "Bearer " } }))).status).toBe(401);
  expect(scopes).toBe(0); expect(runs).toBe(0);
});
test("authorized maintenance uses bounded request scope without a user mutation guard", async () => {
  const result = await route.POST(new Request("https://test.invalid/api/media/maintenance", { method: "POST", headers: { authorization: "Bearer test-secret" } }));
  expect(result.status).toBe(200); expect(await result.json()).toEqual({ ok: true, completed: summary, abandoned: summary }); expect(scopes).toBe(1); expect(runs).toBe(2);
  expect("GET" in route).toBe(false);
});
