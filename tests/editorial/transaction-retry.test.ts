import { beforeEach, expect, mock, test } from "bun:test";
import { Prisma as WorkerPrisma } from "../../.generated/prisma-worker/client";

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath() {} }));
const actor = { id: "admin", role: "admin", nickname: "QA", authVersion: 0, disabledAt: null, emailVerifiedAt: new Date() };
mock.module("../../src/lib/queries", () => ({ currentProfileOrNull: async () => actor }));
let attempts = 0;
let failures: unknown[] = [];
mock.module("../../src/lib/db", () => ({ db: { $transaction: async (work: (tx: unknown) => unknown) => {
  attempts++;
  if (failures.length) throw failures.shift();
  return work({ profile: { findUnique: async () => actor } });
} } }));
const { withSerializableTx } = await import("../../src/lib/editorial");
const workerError = (code: string) => new WorkerPrisma.PrismaClientKnownRequestError("isolated Worker conflict", { code, clientVersion: "6.19.3" });
beforeEach(() => { attempts = 0; failures = []; });

for (const code of ["P2034", "P2002"]) test(`retries ${code} from the Worker Prisma runtime and returns the committed result`, async () => {
  failures = [workerError(code)];
  const result = await withSerializableTx(async () => ({ ok: true, data: { id: "same-draft" } }), { invalidate: false });
  expect(result).toEqual({ ok: true, data: { id: "same-draft" } });
  expect(attempts).toBe(2);
});

test("exhausted Worker conflicts return a bounded safe conflict", async () => {
  failures = Array.from({ length: 4 }, () => workerError("P2034"));
  expect(await withSerializableTx(async () => ({ ok: true }), { invalidate: false })).toEqual({ ok: false, error: "conflict" });
  expect(attempts).toBe(4);
});

test("does not retry unrelated database or application errors", async () => {
  const error = workerError("P2025"); failures = [error];
  await expect(withSerializableTx(async () => ({ ok: true }), { invalidate: false })).rejects.toBe(error);
  expect(attempts).toBe(1);
});
