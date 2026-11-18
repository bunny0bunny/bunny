import { afterAll, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { db, setActor, actions as libraryActions } from "./session-fixture";
import * as accounts from "../../src/lib/account-actions";
import { verifyPassword } from "../../src/lib/password";
import { currentProfileOrNull } from "../../src/lib/queries";
import { safeAccountDestination } from "../../src/lib/account-destination";
import { isLocalMailAllowed, isAccountMailConfigured } from "../../src/lib/account-mail";
import { allowAccountClient, hashRateLimitKey } from "../../src/lib/account-ratelimit";

const prefix = `coordinator-accounts-${Date.now()}`;
const email = (suffix: string) => `${prefix}-${suffix}@bunny.test`;
const originalPassword = "Original-password-2026!";
const changedPassword = "Changed-password-2026!";

async function mailedToken(to: string, route: string) {
  const root = process.env.ACCOUNT_MAIL_LOCAL_DIR!;
  const files = await readdir(root);
  // readdir order is filesystem-specific; names start with a timestamp, so sort newest first.
  for (const filename of files.sort().reverse()) {
    if (!filename.endsWith(".json")) continue;
    const message = JSON.parse(await readFile(path.join(root, filename), "utf8"));
    if (message.to !== to || !message.text.includes(route)) continue;
    const match = message.text.match(/https?:\/\/[^\s]+/);
    if (match) return new URL(match[0]).searchParams.get("token")!;
  }
  throw new Error("Expected private captured account mail");
}

afterAll(async () => {
  setActor(null);
  await db.accountToken.deleteMany({ where: { email: { startsWith: prefix } } });
  await db.profile.deleteMany({ where: { email: { startsWith: prefix } } });
});

test("public registration ignores privilege input and duplicate registration cannot replace a pending password", async () => {
  setActor(null);
  const first = await accounts.registerReader({ email: email("signup"), nickname: "قارئ جديد", password: originalPassword, role: "admin", next: "//evil.example" });
  expect(first.ok).toBe(true);
  expect(JSON.stringify(first)).not.toContain("token=");
  const profile = await db.profile.findUniqueOrThrow({ where: { email: email("signup") } });
  expect(profile.role).toBe("reader");
  expect(profile.emailVerifiedAt).toBeNull();
  const duplicate = await accounts.registerReader({ email: profile.email, nickname: "اسم آخر", password: changedPassword });
  expect(duplicate.ok).toBe(first.ok);
  const unchanged = await db.profile.findUniqueOrThrow({ where: { id: profile.id } });
  expect(await verifyPassword(originalPassword, unchanged.passwordHash)).toBe(true);
  expect(await verifyPassword(changedPassword, unchanged.passwordHash)).toBe(false);
});

test("verification token cannot reset a password and only one concurrent verification consumes it", async () => {
  const token = await mailedToken(email("signup"), "/verify-email");
  expect((await accounts.resetPasswordWithToken({ token, password: changedPassword })).ok).toBe(false);
  const results = await Promise.all([accounts.verifyEmailToken({ token, password: originalPassword }), accounts.verifyEmailToken({ token, password: originalPassword })]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect((await db.profile.findUniqueOrThrow({ where: { email: email("signup") } })).emailVerifiedAt).not.toBeNull();
});

test("the mailbox owner replaces a squatter password only when verifying and replay cannot replace it", async () => {
  setActor(null);
  const address = email("squatted");
  await accounts.registerReader({ email: address, nickname: "شخص آخر", password: originalPassword });
  await accounts.resendVerification({ email: address });
  const token = await mailedToken(address, "/verify-email");
  expect((await accounts.verifyEmailToken({ token })).ok).toBe(false);
  expect((await accounts.verifyEmailToken({ token, password: changedPassword })).ok).toBe(true);
  const owner = await db.profile.findUniqueOrThrow({ where: { email: address } });
  expect(await verifyPassword(originalPassword, owner.passwordHash)).toBe(false);
  expect(await verifyPassword(changedPassword, owner.passwordHash)).toBe(true);
  expect((await accounts.verifyEmailToken({ token, password: originalPassword })).ok).toBe(false);
});

test("pending invitations cannot grant privileges after the inviting admin loses access", async () => {
  const inviter = await db.profile.create({ data: { email: email("inviter"), nickname: "مسؤول", role: "admin", passwordHash: "test", emailVerifiedAt: new Date() } });
  setActor(inviter.id);
  await accounts.createTeamInvitation({ email: email("revoked-invite"), role: "admin" });
  const token = await mailedToken(email("revoked-invite"), "/accept-invitation");
  await db.profile.update({ where: { id: inviter.id }, data: { disabledAt: new Date() } });
  setActor(null);
  expect((await accounts.acceptTeamInvitation({ token, nickname: "عضو", password: changedPassword })).ok).toBe(false);
  expect(await db.profile.count({ where: { email: email("revoked-invite") } })).toBe(0);
});

test("password reset invalidates old sessions and cannot be replayed", async () => {
  setActor(null);
  expect((await accounts.requestPasswordReset({ email: email("signup") })).ok).toBe(true);
  const token = await mailedToken(email("signup"), "/reset-password");
  expect((await accounts.resetPasswordWithToken({ token, password: changedPassword })).ok).toBe(true);
  expect((await accounts.resetPasswordWithToken({ token, password: originalPassword })).ok).toBe(false);
  const profile = await db.profile.findUniqueOrThrow({ where: { email: email("signup") } });
  expect(profile.authVersion).toBeGreaterThan(0);
  setActor(profile.id); // The fixture deliberately represents its original version-zero JWT.
  expect(await currentProfileOrNull()).toBeNull();
  expect(await verifyPassword(changedPassword, profile.passwordHash)).toBe(true);
});

test("rate limits isolate trusted clients and reset mail from verification requests", async () => {
  const previousTrust = process.env.ACCOUNT_TRUST_PROXY_HEADER;
  try {
    process.env.ACCOUNT_TRUST_PROXY_HEADER = "1";
    const keyHash = hashRateLimitKey("client:review-regression:192.0.2.1");
    await db.accountRateLimit.create({ data: { keyHash, count: 200, windowEnd: new Date(Date.now() + 60000) } });
    expect(await allowAccountClient("review-regression", "192.0.2.1")).toBe(false);
    expect(await allowAccountClient("review-regression", "192.0.2.2")).toBe(true);
    process.env.ACCOUNT_TRUST_PROXY_HEADER = "0";
    expect(await allowAccountClient("review-regression", "192.0.2.1")).toBe(true);
  } finally {
    if (previousTrust === undefined) delete process.env.ACCOUNT_TRUST_PROXY_HEADER;
    else process.env.ACCOUNT_TRUST_PROXY_HEADER = previousTrust;
  }
  setActor(null);
  const keyHash = hashRateLimitKey(`verification-mail:${email("signup")}`);
  await db.accountRateLimit.update({ where: { keyHash }, data: { count: 3 } });
  expect((await accounts.resendVerification({ email: email("signup") })).ok).toBe(false);
  expect((await accounts.requestPasswordReset({ email: email("signup") })).ok).toBe(true);
});

test("an invitation never promotes an existing account without matching authenticated acceptance", async () => {
  const admin = await db.profile.findUniqueOrThrow({ where: { email: "admin@bunny.demo" } });
  const reader = await db.profile.create({ data: { email: email("existing"), nickname: "قارئ قائم", role: "reader", passwordHash: "unchanged-existing-hash", emailVerifiedAt: new Date() } });
  setActor(admin.id);
  expect((await accounts.createTeamInvitation({ email: reader.email, role: "editor" })).ok).toBe(true);
  const token = await mailedToken(reader.email, "/accept-invitation");
  setActor(null);
  expect((await accounts.acceptTeamInvitation({ token, nickname: "محاولة", password: changedPassword })).ok).toBe(false);
  expect((await db.profile.findUniqueOrThrow({ where: { id: reader.id } })).role).toBe("reader");
  setActor(admin.id);
  expect((await accounts.acceptTeamInvitation({ token })).ok).toBe(false);
  setActor(reader.id);
  expect((await accounts.acceptTeamInvitation({ token, password: changedPassword })).ok).toBe(true);
  const accepted = await db.profile.findUniqueOrThrow({ where: { id: reader.id } });
  expect(accepted.role).toBe("editor");
  expect(accepted.passwordHash).toBe("unchanged-existing-hash");
  expect((await accounts.acceptTeamInvitation({ token })).ok).toBe(false);
});

test("disabled accounts cannot be revived with recovery or a team invitation", async () => {
  const admin = await db.profile.findUniqueOrThrow({ where: { email: "admin@bunny.demo" } });
  const target = await db.profile.create({ data: { email: email("disabled"), nickname: "حساب معطل", role: "reader", passwordHash: "test-only", emailVerifiedAt: new Date() } });
  setActor(null);
  await accounts.requestPasswordReset({ email: target.email });
  const reset = await mailedToken(target.email, "/reset-password");
  setActor(admin.id);
  expect((await accounts.setAccountEnabled({ profileId: target.id, enabled: false })).ok).toBe(true);
  expect((await accounts.createTeamInvitation({ email: target.email, role: "admin" })).ok).toBe(false);
  setActor(target.id);
  expect(await currentProfileOrNull()).toBeNull();
  expect((await accounts.resetPasswordWithToken({ token: reset, password: changedPassword })).ok).toBe(false);
});

test("profile updates reject arbitrary avatars and password changes require the current secret and revoke the session", async () => {
  setActor(null);
  const address = email("settings");
  await accounts.registerReader({ email: address, nickname: "إعدادات", password: originalPassword });
  const token = await mailedToken(address, "/verify-email");
  await accounts.verifyEmailToken({ token, password: originalPassword });
  const profile = await db.profile.findUniqueOrThrow({ where: { email: address } });
  setActor(profile.id);
  expect((await libraryActions.updateProfile({ nickname: "قارئ", bio: "", avatarSeed: "https://external.example/avatar" })).ok).toBe(false);
  expect((await libraryActions.updateProfile({ nickname: "قارئ", bio: "نبذة", avatarSeed: "bunny" })).ok).toBe(true);
  expect((await accounts.changeAccountPassword({ currentPassword: changedPassword, password: changedPassword })).ok).toBe(false);
  expect((await accounts.changeAccountPassword({ currentPassword: originalPassword, password: changedPassword })).ok).toBe(true);
  const changed = await db.profile.findUniqueOrThrow({ where: { id: profile.id } });
  expect(changed.avatarSeed).toBe("bunny");
  expect(changed.authVersion).toBe(1);
  expect(await currentProfileOrNull()).toBeNull();
});

test("reader cannot invite or administratively disable accounts", async () => {
  const reader = await db.profile.findUniqueOrThrow({ where: { email: "reader@bunny.demo" } });
  setActor(reader.id);
  expect((await accounts.createTeamInvitation({ email: email("forbidden"), role: "admin" })).ok).toBe(false);
  expect((await accounts.setAccountEnabled({ profileId: reader.id, enabled: false })).ok).toBe(false);
  expect(await db.accountToken.count({ where: { email: email("forbidden") } })).toBe(0);
});

test("invitation cannot bypass administrator role protection", async () => {
  const admin = await db.profile.findUniqueOrThrow({ where: { email: "admin@bunny.demo" } });
  const target = await db.profile.create({ data: { email: email("admin"), nickname: "أدمن", role: "admin", passwordHash: "test-only", emailVerifiedAt: new Date() } });
  setActor(admin.id);
  expect((await accounts.createTeamInvitation({ email: target.email, role: "editor" })).ok).toBe(false);
  expect((await db.profile.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("admin");
});

test("expired verification links cannot verify a pending reader", async () => {
  setActor(null);
  expect((await accounts.registerReader({ email: email("expired"), nickname: "قارئ", password: originalPassword })).ok).toBe(true);
  const token = await mailedToken(email("expired"), "/verify-email");
  await db.accountToken.updateMany({ where: { email: email("expired"), purpose: "verify" }, data: { expiresAt: new Date(Date.now() - 1000) } });
  expect((await accounts.verifyEmailToken({ token, password: originalPassword })).ok).toBe(false);
  expect((await db.profile.findUniqueOrThrow({ where: { email: email("expired") } })).emailVerifiedAt).toBeNull();
});

test("destination validation permits invitation return but blocks encoded external paths and auth loops", () => {
  expect(safeAccountDestination("/accept-invitation?token=123")).toBe("/accept-invitation?token=123");
  for (const destination of ["//evil.example", "/%2f%2fevil.example", "/%5cevil.example", "/a/../login", "/welcome?next=/welcome", "javascript:alert(1)"]) expect(safeAccountDestination(destination)).toBe("/");
});

test("private local capture requires exact loopback hosts and disabled mail mode stays disabled", () => {
  const origin = process.env.APP_ORIGIN;
  const mode = process.env.ACCOUNT_MAIL_MODE;
  try {
    process.env.APP_ORIGIN = "https://localhost.evil.example";
    expect(isLocalMailAllowed()).toBe(false);
    expect(isAccountMailConfigured()).toBe(false);
    process.env.APP_ORIGIN = origin;
    process.env.ACCOUNT_MAIL_MODE = "disabled";
    expect(isAccountMailConfigured()).toBe(false);
  } finally {
    process.env.APP_ORIGIN = origin;
    process.env.ACCOUNT_MAIL_MODE = mode;
  }
});
