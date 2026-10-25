import { expect, test } from "bun:test";
import { requestMutation, createSubmission } from "../../src/components/content-requests/client";
test("ambiguous mutations are attempted once and retain the submission identity for explicit retry", async () => {
  const calls: any[] = [];
  const send = createSubmission("stable-id");
  const fetcher = async (_url: any, init: any) => { calls.push(JSON.parse(init.body)); throw Error("offline"); };
  expect((await send({ title: "عنوان", category: "manga" }, fetcher as any)).ok).toBe(false);
  expect(calls).toHaveLength(1);
  await send({ title: "عنوان", category: "manga" }, fetcher as any);
  expect(calls.map(call => call.submissionId)).toEqual(["stable-id", "stable-id"]);
});
test("mutation sends the same-origin protocol and handles non-JSON failures without replay", async () => {
  let count = 0;
  const result = await requestMutation("/api/content-requests/a/status", { expectedVersion: 2 }, (async (_url, init) => {
    count++; expect(init?.headers).toEqual({ "Content-Type": "application/json", "X-Bunny-Request": "1" });
    return new Response("unavailable", { status: 502 });
  }) as typeof fetch);
  expect(result.ok).toBe(false); expect(count).toBe(1);
});
for (const stalledPhase of ["fetch", "json"] as const) test(`mutation deadline bounds stalled ${stalledPhase} even when adapter ignores abort`, async () => {
  let count = 0; let signal: AbortSignal | undefined;
  const fetcher = (async (_url, init) => {
    count++; signal = init?.signal as AbortSignal;
    if (stalledPhase === "fetch") return new Promise<Response>(() => {});
    return { ok: true, json: () => new Promise(() => {}) } as Response;
  }) as typeof fetch;
  const result = await requestMutation("/api/content-requests", {submissionId:"stable-id"}, fetcher, 5);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.uncertain).toBe(true);
  expect(signal?.aborted).toBe(true);
  expect(count).toBe(1);
}, 100);
