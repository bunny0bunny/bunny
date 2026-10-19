import { beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
let existing: any;
const sent: any[] = [];
const issued: any[] = [];
const createProfile = mock(async ({ data }: any) => ({ id: "new-id", ...data }));
const revokeTokens = mock(async () => ({ count: 1 }));
const transaction = {
  profile: { findUnique: async () => existing, create: createProfile },
  accountToken: { updateMany: revokeTokens, create: async ({ data }: any) => { issued.push(data); return data; } },
};
mock.module("../../src/lib/db", () => ({ db: { $transaction: async (operation: any) => operation(transaction) } }));
mock.module("../../src/lib/password", () => ({ hashPassword: async () => "unused-new-hash", verifyPassword: async () => false }));
mock.module("../../src/lib/account-ratelimit", () => ({ checkAndIncrementRateLimit: async () => true }));
mock.module("../../src/lib/account-mail", () => ({
  isAccountMailConfigured: () => true, isLocalMailAllowed: () => false,
  getTrustedAppOrigin: () => "https://library.example",
  sendAccountMail: async (payload: any) => { sent.push(payload); return { ok: true }; },
}));
const { registerReaderService } = await import("../../src/lib/account-service");
const input = { email: "reader@example.test", nickname: "Replacement", password: "Do-not-overwrite123!" };
beforeEach(() => {
  existing = Object.freeze({ id: "existing-id", email: input.email, nickname: "Original", passwordHash: "existing-hash", emailVerifiedAt: null, disabledAt: null });
  sent.length = 0; issued.length = 0; createProfile.mockClear(); revokeTokens.mockClear();
});
test("repeated signup recovers an unverified account with a fresh activation email, without overwriting it", async () => {
  const result = await registerReaderService(input);
  expect(result.ok).toBe(true);
  expect(sent).toHaveLength(1);
  expect(issued).toHaveLength(1);
  expect(issued[0].profileId).toBe("existing-id");
  expect(issued[0].tokenHash).not.toBe(sent[0].text.match(/token=([a-f0-9]{64})/)[1]);
  expect(sent[0].text).toContain("Original");
  expect(createProfile).not.toHaveBeenCalled();
  expect(existing.passwordHash).toBe("existing-hash");
});
test("verified and disabled accounts receive the same public response without activation mail", async () => {
  let expected: unknown;
  for (const change of [{}, { emailVerifiedAt: new Date() }, { disabledAt: new Date() }]) {
    existing = { ...existing, emailVerifiedAt: null, disabledAt: null, ...change };
    const result = await registerReaderService(input);
    expected ??= result;
    expect(result).toEqual(expected);
    if (change.emailVerifiedAt || change.disabledAt) expect(sent).toHaveLength(1);
  }
});
test("new signup still creates one account and one activation email", async () => {
  existing = null;
  expect((await registerReaderService(input)).ok).toBe(true);
  expect(createProfile).toHaveBeenCalledTimes(1);
  expect(issued).toHaveLength(1);
  expect(sent).toHaveLength(1);
});
