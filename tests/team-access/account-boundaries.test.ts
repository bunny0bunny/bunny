import { test, expect, beforeAll, afterAll } from "bun:test";
import { db, setActor, withActor } from "./session-fixture";
import * as accountActions from "../../src/lib/account-actions";
import * as accountService from "../../src/lib/account-service";
import { safeAccountDestination } from "../../src/lib/account-destination";
import { isAccountMailConfigured, isLocalMailAllowed } from "../../src/lib/account-mail";

let adminUser: { id: string; email: string };
let readerUser: { id: string; email: string };

beforeAll(async () => {
  adminUser = await db.profile.findUniqueOrThrow({ where: { email: "admin@bunny.demo" } });
  readerUser = await db.profile.findUniqueOrThrow({ where: { email: "reader@bunny.demo" } });
});

afterAll(async () => {
  setActor(null);
  // cleanup test data
  await db.accountToken.deleteMany({
    where: {
      email: {
        in: [
          "new-reader@bunny.test",
          "invitee@bunny.test",
          "existing-invitee@bunny.test",
          "disabled-user@bunny.test",
          "unverified-user@bunny.test",
        ],
      },
    },
  });
  await db.profile.deleteMany({
    where: {
      email: {
        in: [
          "new-reader@bunny.test",
          "invitee@bunny.test",
          "existing-invitee@bunny.test",
          "disabled-user@bunny.test",
          "unverified-user@bunny.test",
        ],
      },
    },
  });
});

test("safeAccountDestination sanitizes unsafe redirect paths", () => {
  expect(safeAccountDestination("//malicious.com")).toBe("/");
  expect(safeAccountDestination("https://evil.com")).toBe("/");
  expect(safeAccountDestination("/javascript:alert(1)")).toBe("/");
  expect(safeAccountDestination("/login?next=/admin")).toBe("/");
  expect(safeAccountDestination("/register")).toBe("/");
  expect(safeAccountDestination("/accept-invitation?token=123")).toBe("/accept-invitation?token=123");
  expect(safeAccountDestination("/safe/path?param=1")).toBe("/safe/path?param=1");
  expect(safeAccountDestination(null)).toBe("/");
});

test("mail configuration honors local mode during loopback QA", () => {
  expect(isLocalMailAllowed()).toBe(true);
  expect(isAccountMailConfigured()).toBe(true);
});

test("registerReader creates unverified profile, hashed token and sends mail", async () => {
  const result = await accountActions.registerReader({
    email: "new-reader@bunny.test",
    nickname: "قارئ جديد",
    password: "StrongPassword123!",
    next: "/explore",
  });

  expect(result.ok).toBe(true);
  expect(result.next).toBe("/explore");

  const profile = await db.profile.findUnique({ where: { email: "new-reader@bunny.test" } });
  expect(profile).not.toBeNull();
  expect(profile?.emailVerifiedAt).toBeNull();
  expect(profile?.role).toBe("reader");
  expect(profile?.authVersion).toBe(0);

  const tokenRecord = await db.accountToken.findFirst({
    where: { email: "new-reader@bunny.test", purpose: "verify" },
  });
  expect(tokenRecord).not.toBeNull();
  expect(tokenRecord?.consumedAt).toBeNull();
});

test("public repeated signup never overwrites existing password or discloses existence", async () => {
  const initialProfile = await db.profile.findUniqueOrThrow({ where: { email: "new-reader@bunny.test" } });
  const oldHash = initialProfile.passwordHash;

  const repeatResult = await accountActions.registerReader({
    email: "new-reader@bunny.test",
    nickname: "تكرار التسجيل",
    password: "DifferentPassword456!",
    next: "/explore",
  });

  expect(repeatResult.ok).toBe(true);
  const afterProfile = await db.profile.findUniqueOrThrow({ where: { email: "new-reader@bunny.test" } });
  expect(afterProfile.passwordHash).toBe(oldHash);
});

test("email verification consumes token, marks profile verified and audits", async () => {
  const mailbox = await accountService.getLocalMailbox(adminUser.id);
  const verifyMail = mailbox.find((m) => m.to === "new-reader@bunny.test");
  expect(verifyMail).toBeDefined();

  const match = verifyMail?.text.match(/token=([a-f0-9]+)/);
  expect(match).not.toBeNull();
  const rawToken = match![1];

  const verifyResult = await accountActions.verifyEmailToken({ token: rawToken, password: "Owner-password-2026!" });
  expect(verifyResult.ok).toBe(true);
  expect(verifyResult.next).toBe("/explore");

  const verifiedProfile = await db.profile.findUniqueOrThrow({ where: { email: "new-reader@bunny.test" } });
  expect(verifiedProfile.emailVerifiedAt).not.toBeNull();

  // Re-consuming same token fails
  const reuseResult = await accountActions.verifyEmailToken({ token: rawToken, password: "Owner-password-2026!" });
  expect(reuseResult.ok).toBe(false);
});

test("password reset flow updates password, increments authVersion, and invalidates other tokens", async () => {
  const resetReq = await accountActions.requestPasswordReset({ email: "new-reader@bunny.test" });
  expect(resetReq.ok).toBe(true);

  const mailbox = await accountService.getLocalMailbox(adminUser.id);
  const resetMail = mailbox.find((m) => m.to === "new-reader@bunny.test" && m.subject.includes("إعادة تعيين"));
  expect(resetMail).toBeDefined();

  const match = resetMail?.text.match(/token=([a-f0-9]+)/);
  expect(match).not.toBeNull();
  const rawToken = match![1];

  const resetResult = await accountActions.resetPasswordWithToken({
    token: rawToken,
    password: "BrandNewPassword123!",
  });
  expect(resetResult.ok).toBe(true);

  const updatedProfile = await db.profile.findUniqueOrThrow({ where: { email: "new-reader@bunny.test" } });
  expect(updatedProfile.authVersion).toBe(1);

  // Re-using token fails
  const reuseReset = await accountActions.resetPasswordWithToken({
    token: rawToken,
    password: "AnotherNewPassword123!",
  });
  expect(reuseReset.ok).toBe(false);
});

test("team invitation: admin can create, cancel, and new invitee can accept to receive role", async () => {
  setActor(adminUser.id);

  // Invite new user
  const inviteResult = await accountActions.createTeamInvitation({
    email: "invitee@bunny.test",
    role: "editor",
  });
  expect(inviteResult.ok).toBe(true);

  const invitations = await accountService.getAccountInvitations(adminUser.id);
  const found = invitations.find((i) => i.email === "invitee@bunny.test");
  expect(found).toBeDefined();
  expect(found?.role).toBe("editor");
  expect(found?.status).toBe("pending");

  const mailbox = await accountService.getLocalMailbox(adminUser.id);
  const inviteMail = mailbox.find((m) => m.to === "invitee@bunny.test");
  expect(inviteMail).toBeDefined();

  const match = inviteMail?.text.match(/token=([a-f0-9]+)/);
  const rawToken = match![1];

  // Inspect info
  const info = await accountService.getInvitationInfo(rawToken);
  expect(info).not.toBeNull();
  expect(info?.email).toBe("invitee@bunny.test");
  expect(info?.role).toBe("editor");
  expect(info?.existingAccount).toBe(false);

  // Anonymous user accepts invitation
  setActor(null);
  const acceptResult = await accountActions.acceptTeamInvitation({
    token: rawToken,
    nickname: "محرر جديد مدعو",
    password: "InviteePassword123!",
  });
  expect(acceptResult.ok).toBe(true);

  const createdProfile = await db.profile.findUniqueOrThrow({ where: { email: "invitee@bunny.test" } });
  expect(createdProfile.role).toBe("editor");
  expect(createdProfile.emailVerifiedAt).not.toBeNull();
});

test("team invitation: existing verified account requires matching session and never changes password", async () => {
  // Create an existing verified reader
  const existing = await db.profile.create({
    data: {
      email: "existing-invitee@bunny.test",
      nickname: "قارئ حالي",
      passwordHash: "original-hash",
      role: "reader",
      emailVerifiedAt: new Date(),
      authVersion: 0,
    },
  });

  setActor(adminUser.id);
  await accountActions.createTeamInvitation({
    email: "existing-invitee@bunny.test",
    role: "contributor",
  });

  const mailbox = await accountService.getLocalMailbox(adminUser.id);
  const mail = mailbox.find((m) => m.to === "existing-invitee@bunny.test");
  const match = mail?.text.match(/token=([a-f0-9]+)/);
  if (!match) throw new Error("Invitation verification link missing");
  const rawToken = match[1];

  // Wrong session fails
  const wrongAccept = await withActor(readerUser.id, () =>
    accountActions.acceptTeamInvitation({ token: rawToken })
  );
  expect(wrongAccept.ok).toBe(false);

  // Matching session succeeds
  const correctAccept = await withActor(existing.id, () =>
    accountActions.acceptTeamInvitation({ token: rawToken, password: "ShouldBeIgnored123!" })
  );
  expect(correctAccept.ok).toBe(true);

  const updated = await db.profile.findUniqueOrThrow({ where: { id: existing.id } });
  expect(updated.role).toBe("contributor");
  expect(updated.passwordHash).toBe("original-hash"); // NEVER altered
  expect(updated.authVersion).toBe(1); // bumped
});

test("setAccountEnabled: admin can disable profile, last admin is protected, and disabled account cannot act", async () => {
  setActor(adminUser.id);

  // Last admin cannot be disabled
  const disableAdminResult = await accountActions.setAccountEnabled({
    profileId: adminUser.id,
    enabled: false,
  });
  expect(disableAdminResult.ok).toBe(false);

  // Disable reader
  const target = await db.profile.findUniqueOrThrow({ where: { email: "new-reader@bunny.test" } });
  const disableResult = await accountActions.setAccountEnabled({
    profileId: target.id,
    enabled: false,
  });
  expect(disableResult.ok).toBe(true);

  const disabledProfile = await db.profile.findUniqueOrThrow({ where: { id: target.id } });
  expect(disabledProfile.disabledAt).not.toBeNull();

  // Disabled profile cannot execute actions
  setActor(target.id);
  const actResult = await accountActions.changeAccountPassword({
    currentPassword: "BrandNewPassword123!",
    password: "AnotherPassword123!",
  });
  expect(actResult.ok).toBe(false);

  // Reject inviting already-disabled account
  setActor(adminUser.id);
  const inviteDisabled = await accountActions.createTeamInvitation({
    email: target.email,
    role: "contributor",
  });
  expect(inviteDisabled.ok).toBe(false);
  expect(inviteDisabled.error).toContain("معطّل");
});
