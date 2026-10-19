import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { Prisma, UserRole, AccountTokenPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { sendAccountMail, isAccountMailConfigured, getTrustedAppOrigin, isLocalMailAllowed } from "@/lib/account-mail";
import { checkAndIncrementRateLimit } from "@/lib/account-ratelimit";
import { safeAccountDestination } from "@/lib/account-destination";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}

export type OperationResult = {
  ok: boolean;
  error?: string;
  message?: string;
  next?: string;
};

/* ------------------------------------------------------------------ */
/* Public Register Reader                                             */
/* ------------------------------------------------------------------ */

export async function registerReaderService(input: {
  email: string;
  nickname: string;
  password: string;
  next?: string;
}): Promise<OperationResult> {
  const email = input.email.trim().toLowerCase();
  const nickname = input.nickname.trim();
  const password = input.password;
  const next = safeAccountDestination(input.next, "/");

  // Check mail rate limit for email (3/hr)
  const allowedMail = await checkAndIncrementRateLimit(`verification-mail:${email}`, 3, 3600);
  if (!allowedMail) {
    return { ok: false, error: "تم تجاوز عدد الرسائل المسموح بها لهذا البريد، يرجى المحاولة لاحقًا." };
  }

  if (!isAccountMailConfigured()) {
    return { ok: false, error: "خدمة البريد غير متوفرة حاليًا، يرجى المحاولة لاحقًا." };
  }

  // Hash password
  const passwordHash = await hashPassword(password);
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000); // 24h

  // CAS inside serializable transaction
  let tokenCreated = false;
  let verificationNickname = nickname;
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await db.$transaction(
        async (tx) => {
          const existing = await tx.profile.findUnique({ where: { email } });
          if (existing?.emailVerifiedAt || existing?.disabledAt) {
            // Keep the same public response without reviving disabled accounts.
            return;
          }

          // A pending account can recover its activation link by signing up again.
          // Reuse it unchanged: signup must never replace its password or identity.
          const profile = existing ?? await tx.profile.create({
            data: {
              email,
              nickname,
              passwordHash,
              role: UserRole.reader,
              emailVerifiedAt: null,
              disabledAt: null,
              authVersion: 0,
            },
          });
          verificationNickname = profile.nickname;

          // Invalidate any older verify tokens for this email
          await tx.accountToken.updateMany({
            where: { email, purpose: AccountTokenPurpose.verify, revokedAt: null },
            data: { revokedAt: new Date() },
          });

          await tx.accountToken.create({
            data: {
              tokenHash,
              purpose: AccountTokenPurpose.verify,
              profileId: profile.id,
              email,
              expiresAt,
              nextPath: next,
            },
          });

          tokenCreated = true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      break;
    } catch (err: any) {
      if (err?.code === "P2034" || err?.meta?.code === "40001" || err?.code === "P2002") {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
          continue;
        }
      }
      throw err;
    }
  }

  if (tokenCreated) {
    const origin = getTrustedAppOrigin();
    const verifyUrl = `${origin}/verify-email?token=${rawToken}`;
    await sendAccountMail({
      to: email,
      subject: "تأكيد بريدك الإلكتروني في مكتبة باني",
      text: `مرحبًا ${verificationNickname}،\n\nيرجى تأكيد حسابك من خلال الرابط التالي:\n${verifyUrl}\n\nصلاحية هذا الرابط ٢٤ ساعة.`,
    });
  }

  return {
    ok: true,
    message: "إذا كان البريد متاحًا للتسجيل، ستصلك رسالة لتأكيد الحساب.",
    next,
  };
}

/* ------------------------------------------------------------------ */
/* Resend Verification                                                */
/* ------------------------------------------------------------------ */

export async function resendVerificationService(input: {
  email: string;
  next?: string;
}): Promise<OperationResult> {
  const email = input.email.trim().toLowerCase();
  const next = safeAccountDestination(input.next, "/");

  const allowedMail = await checkAndIncrementRateLimit(`verification-mail:${email}`, 3, 3600);
  if (!allowedMail) {
    return { ok: false, error: "تم تجاوز عدد الرسائل المسموح بها لهذا البريد، يرجى المحاولة لاحقًا." };
  }

  if (!isAccountMailConfigured()) {
    return { ok: false, error: "خدمة البريد غير متوفرة حاليًا، يرجى المحاولة لاحقًا." };
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

  let tokenCreated = false;
  let nickname = "";

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await db.$transaction(
        async (tx) => {
          const profile = await tx.profile.findUnique({ where: { email } });
          // If profile does not exist, or is disabled, or is already verified, do not create token
          if (!profile || profile.disabledAt || profile.emailVerifiedAt) {
            return;
          }

          nickname = profile.nickname;

          // Invalidate earlier verify tokens
          await tx.accountToken.updateMany({
            where: { email, purpose: AccountTokenPurpose.verify, revokedAt: null },
            data: { revokedAt: new Date() },
          });

          await tx.accountToken.create({
            data: {
              tokenHash,
              purpose: AccountTokenPurpose.verify,
              profileId: profile.id,
              email,
              expiresAt,
              nextPath: next,
            },
          });

          tokenCreated = true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      break;
    } catch (err: any) {
      if (err?.code === "P2034" || err?.meta?.code === "40001") {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
          continue;
        }
      }
      throw err;
    }
  }

  if (tokenCreated) {
    const origin = getTrustedAppOrigin();
    const verifyUrl = `${origin}/verify-email?token=${rawToken}`;
    await sendAccountMail({
      to: email,
      subject: "تأكيد بريدك الإلكتروني في مكتبة باني",
      text: `مرحبًا ${nickname}،\n\nيرجى تأكيد حسابك من خلال الرابط التالي:\n${verifyUrl}\n\nصلاحية هذا الرابط ٢٤ ساعة.`,
    });
  }

  // Consistent message whether email exists or not (no info disclosure)
  return {
    ok: true,
    message: "إذا كان البريد مسجلاً وغير مفعّل، ستصلك رسالة تأكيد عند إتمام الإرسال.",
  };
}

/* ------------------------------------------------------------------ */
/* Verify Email Token                                                 */
/* ------------------------------------------------------------------ */

export async function verifyEmailTokenService(input: {
  token: string;
  password: string;
}): Promise<OperationResult> {
  const tokenHash = hashToken(input.token.trim());
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await db.$transaction(
        async (tx) => {
          const record = await tx.accountToken.findUnique({
            where: { tokenHash },
            include: { profile: true },
          });

          if (!record || record.purpose !== AccountTokenPurpose.verify) {
            return { ok: false, error: "الرابط غير صالح أو منتهي الصلاحية." };
          }

          if (record.revokedAt || record.consumedAt || record.expiresAt <= now) {
            return { ok: false, error: "الرابط غير صالح أو منتهي الصلاحية." };
          }

          if (!record.profile || record.profile.disabledAt || record.profile.emailVerifiedAt) {
            return { ok: false, error: "الحساب غير متاح أو معطّل." };
          }

          // Single-use CAS consume
          await tx.accountToken.update({
            where: { id: record.id },
            data: { consumedAt: now },
          });

          // Mark profile verified
          await tx.profile.update({
            where: { id: record.profile.id },
            data: {
              emailVerifiedAt: now,
              passwordHash,
            },
          });

          await tx.accountAudit.create({
            data: {
              actorId: record.profile.id,
              targetId: record.profile.id,
              action: "email_verified",
              metadata: { email: record.email },
            },
          });

          const next = safeAccountDestination(record.nextPath, "/");
          return {
            ok: true,
            message: "تم تأكيد بريدك الإلكتروني بنجاح.",
            next,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      return res;
    } catch (err: any) {
      if (err?.code === "P2034" || err?.meta?.code === "40001") {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
          continue;
        }
      }
      throw err;
    }
  }

  return { ok: false, error: "حدث خطأ أثناء تأكيد الحساب، يرجى إعادة المحاولة." };
}

/* ------------------------------------------------------------------ */
/* Request Password Reset                                             */
/* ------------------------------------------------------------------ */

export async function requestPasswordResetService(input: {
  email: string;
}): Promise<OperationResult> {
  const email = input.email.trim().toLowerCase();

  const allowedMail = await checkAndIncrementRateLimit(`reset-mail:${email}`, 3, 3600);
  if (!allowedMail) {
    return { ok: false, error: "تم تجاوز عدد الرسائل المسموح بها لهذا البريد، يرجى المحاولة لاحقًا." };
  }

  if (!isAccountMailConfigured()) {
    return { ok: false, error: "خدمة البريد غير متوفرة حاليًا، يرجى المحاولة لاحقًا." };
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

  let tokenCreated = false;
  let nickname = "";

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await db.$transaction(
        async (tx) => {
          const profile = await tx.profile.findUnique({ where: { email } });
          // Must exist, not disabled, and emailVerifiedAt must not be null
          if (!profile || profile.disabledAt || !profile.emailVerifiedAt) {
            return;
          }

          nickname = profile.nickname;

          // Invalidate earlier reset tokens
          await tx.accountToken.updateMany({
            where: { email, purpose: AccountTokenPurpose.reset, revokedAt: null },
            data: { revokedAt: new Date() },
          });

          await tx.accountToken.create({
            data: {
              tokenHash,
              purpose: AccountTokenPurpose.reset,
              profileId: profile.id,
              email,
              expiresAt,
            },
          });

          tokenCreated = true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      break;
    } catch (err: any) {
      if (err?.code === "P2034" || err?.meta?.code === "40001") {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
          continue;
        }
      }
      throw err;
    }
  }

  if (tokenCreated) {
    const origin = getTrustedAppOrigin();
    const resetUrl = `${origin}/reset-password?token=${rawToken}`;
    await sendAccountMail({
      to: email,
      subject: "إعادة تعيين كلمة المرور في مكتبة باني",
      text: `مرحبًا ${nickname}،\n\nتلقينا طلبًا لإعادة تعيين كلمة المرور الخاصة بحسابك:\n${resetUrl}\n\nصلاحية هذا الرابط ساعة واحدة. إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.`,
    });
  }

  return {
    ok: true,
    message: "إذا كان البريد مسجلاً لدينا، ستصلك رسالة استعادة عند إتمام الإرسال.",
  };
}

/* ------------------------------------------------------------------ */
/* Reset Password With Token                                          */
/* ------------------------------------------------------------------ */

export async function resetPasswordWithTokenService(input: {
  token: string;
  password: string;
}): Promise<OperationResult> {
  const tokenHash = hashToken(input.token.trim());
  const newPassword = input.password;
  const now = new Date();

  // Guard consume bounds before expensive scrypt
  const preCheck = await db.accountToken.findUnique({
    where: { tokenHash },
    select: { id: true, purpose: true, expiresAt: true, consumedAt: true, revokedAt: true },
  });
  if (
    !preCheck ||
    preCheck.purpose !== AccountTokenPurpose.reset ||
    preCheck.consumedAt ||
    preCheck.revokedAt ||
    preCheck.expiresAt <= now
  ) {
    return { ok: false, error: "الرابط غير صالح أو منتهي الصلاحية." };
  }

  const passwordHash = await hashPassword(newPassword);

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await db.$transaction(
        async (tx) => {
          const record = await tx.accountToken.findUnique({
            where: { tokenHash },
            include: { profile: true },
          });

          if (
            !record ||
            record.purpose !== AccountTokenPurpose.reset ||
            record.consumedAt ||
            record.revokedAt ||
            record.expiresAt <= now
          ) {
            return { ok: false, error: "الرابط غير صالح أو منتهي الصلاحية." };
          }

          if (!record.profile || record.profile.disabledAt) {
            return { ok: false, error: "الحساب غير متاح أو معطّل." };
          }

          // Single use CAS consume
          await tx.accountToken.update({
            where: { id: record.id },
            data: { consumedAt: now },
          });

          // Invalidate ALL other reset tokens for this email
          await tx.accountToken.updateMany({
            where: {
              email: record.email,
              purpose: AccountTokenPurpose.reset,
              id: { not: record.id },
              revokedAt: null,
            },
            data: { revokedAt: now },
          });

          // Update password and bump authVersion to revoke existing sessions
          await tx.profile.update({
            where: { id: record.profile.id },
            data: {
              passwordHash,
              authVersion: { increment: 1 },
            },
          });

          await tx.accountAudit.create({
            data: {
              actorId: record.profile.id,
              targetId: record.profile.id,
              action: "password_reset",
              metadata: { email: record.email },
            },
          });

          return {
            ok: true,
            message: "تم تغيير كلمة المرور بنجاح، يمكنك الآن تسجيل الدخول.",
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      return res;
    } catch (err: any) {
      if (err?.code === "P2034" || err?.meta?.code === "40001") {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
          continue;
        }
      }
      throw err;
    }
  }

  return { ok: false, error: "حدث خطأ أثناء إعادة تعيين كلمة المرور، يرجى المحاولة لاحقًا." };
}

/* ------------------------------------------------------------------ */
/* Change Account Password (authenticated)                           */
/* ------------------------------------------------------------------ */

export async function changeAccountPasswordService(
  actorProfileId: string,
  input: {
    currentPassword: string;
    password: string;
  },
  expectedAuthVersion?: number
): Promise<OperationResult> {
  const profile = await db.profile.findUnique({ where: { id: actorProfileId } });
  if (!profile || profile.disabledAt || !profile.emailVerifiedAt || (expectedAuthVersion !== undefined && profile.authVersion !== expectedAuthVersion)) {
    return { ok: false, error: "الحساب غير متاح أو غير مؤكد." };
  }

  const ok = await verifyPassword(input.currentPassword, profile.passwordHash);
  if (!ok) {
    return { ok: false, error: "كلمة المرور الحالية غير صحيحة." };
  }

  const newHash = await hashPassword(input.password);

  const changed = await db.$transaction(async tx => {
    const result = await tx.profile.updateMany({ where: { id: profile.id, authVersion: profile.authVersion, disabledAt: null, emailVerifiedAt: { not: null } }, data: { passwordHash: newHash, authVersion: { increment: 1 } } });
    if (result.count !== 1) return false;
    await tx.accountAudit.create({ data: { actorId: profile.id, targetId: profile.id, action: "password_changed", metadata: {} } });
    return true;
  });
  if (!changed) return { ok: false, error: "تغير الحساب أثناء العملية. سجل الدخول مجددًا." };

  return { ok: true, message: "تم تغيير كلمة المرور بنجاح." };
}

/* ------------------------------------------------------------------ */
/* Save Onboarding                                                    */
/* ------------------------------------------------------------------ */

export async function saveOnboardingService(
  actorProfileId: string,
  input: {
    genres: string[];
    skip?: boolean;
    next?: string;
  },
  expectedAuthVersion?: number
): Promise<OperationResult> {
  const profile = await db.profile.findUnique({ where: { id: actorProfileId } });
  if (!profile || profile.disabledAt || !profile.emailVerifiedAt || (expectedAuthVersion !== undefined && profile.authVersion !== expectedAuthVersion)) {
    return { ok: false, error: "unauthenticated" };
  }

  const next = safeAccountDestination(input.next, "/");

  await db.profile.update({
    where: { id: profile.id },
    data: {
      onboardingCompletedAt: new Date(),
      preferredGenresJson: input.skip ? profile.preferredGenresJson : JSON.stringify(input.genres),
    },
  });

  await db.accountAudit.create({
    data: {
      actorId: profile.id,
      targetId: profile.id,
      action: "onboarding_completed",
      metadata: { skipped: Boolean(input.skip), genresCount: input.genres.length },
    },
  });

  return { ok: true, next };
}

/* ------------------------------------------------------------------ */
/* Team Invitations                                                   */
/* ------------------------------------------------------------------ */

export async function createTeamInvitationService(
  actorAdminId: string,
  input: {
    email: string;
    role: "contributor" | "editor" | "admin";
  },
  expectedAuthVersion?: number
): Promise<OperationResult> {
  const admin = await db.profile.findUnique({ where: { id: actorAdminId } });
  if (!admin || admin.role !== "admin" || admin.disabledAt || !admin.emailVerifiedAt || (expectedAuthVersion !== undefined && admin.authVersion !== expectedAuthVersion)) {
    return { ok: false, error: "forbidden" };
  }

  const email = input.email.trim().toLowerCase();
  const role = input.role as UserRole;

  // Reject inviting already-disabled accounts
  const existingProfile = await db.profile.findUnique({ where: { email } });
  if (existingProfile && existingProfile.disabledAt) {
    return { ok: false, error: "لا يمكن دعوة حساب معطّل." };
  }

  if (!isAccountMailConfigured()) {
    return { ok: false, error: "خدمة البريد غير متوفرة حاليًا، يرجى المحاولة لاحقًا." };
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await db.$transaction(
        async (tx) => {
          // Invalidate earlier invite tokens for this email
          const freshAdmin = await tx.profile.findUnique({ where: { id: admin.id } });
          if (!freshAdmin || freshAdmin.role !== "admin" || freshAdmin.disabledAt || !freshAdmin.emailVerifiedAt || freshAdmin.authVersion !== admin.authVersion) throw new Error("forbidden");
          const freshTarget = await tx.profile.findUnique({ where: { email } });
          if (freshTarget?.disabledAt || (freshTarget?.role === "admin" && role !== "admin")) throw new Error("invitation_not_allowed");
          await tx.accountToken.updateMany({
            where: { email, purpose: AccountTokenPurpose.invite, revokedAt: null },
            data: { revokedAt: new Date() },
          });

          await tx.accountToken.create({
            data: {
              tokenHash,
              purpose: AccountTokenPurpose.invite,
              createdById: freshAdmin.id,
              createdByAuthVersion: freshAdmin.authVersion,
              email,
              role,
              expiresAt,
            },
          });

          await tx.accountAudit.create({
            data: {
              actorId: admin.id,
              targetId: existingProfile?.id ?? null,
              action: "team_invitation_created",
              metadata: { email, role },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      break;
    } catch (err: any) {
      if (err?.code === "P2034" || err?.meta?.code === "40001") {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
          continue;
        }
      }
      throw err;
    }
  }

  const origin = getTrustedAppOrigin();
  const inviteUrl = `${origin}/accept-invitation?token=${rawToken}`;
  const delivery = await sendAccountMail({
    to: email,
    subject: "دعوة للانضمام إلى فريق عمل مكتبة باني",
    text: `مرحبًا،\n\nتمت دعوتك للانضمام إلى فريق عمل مكتبة باني بدور (${role}):\n${inviteUrl}\n\nصلاحية هذه الدعوة ٧ أيام.`,
  });
  if (!delivery.ok) return { ok: false, error: "تعذّر إرسال الدعوة. يمكنك إعادة المحاولة أو إلغاء الدعوة من القائمة." };
  return { ok: true, message: "تم إرسال الدعوة بنجاح." };
}

export async function cancelTeamInvitationService(
  actorAdminId: string,
  input: { invitationId: string },
  expectedAuthVersion?: number
): Promise<OperationResult> {
  const admin = await db.profile.findUnique({ where: { id: actorAdminId } });
  if (!admin || admin.role !== "admin" || admin.disabledAt || !admin.emailVerifiedAt || (expectedAuthVersion !== undefined && admin.authVersion !== expectedAuthVersion)) {
    return { ok: false, error: "forbidden" };
  }

  return db.$transaction(async tx => {
    const actor = await tx.profile.findUnique({ where: { id: admin.id } });
    if (!actor || actor.role !== "admin" || actor.disabledAt || !actor.emailVerifiedAt || actor.authVersion !== admin.authVersion) return { ok: false, error: "forbidden" };
    const invite = await tx.accountToken.findUnique({ where: { id: input.invitationId } });
    if (!invite || invite.purpose !== AccountTokenPurpose.invite || invite.consumedAt || invite.revokedAt) return { ok: false, error: "invitation_not_pending" };
    await tx.accountToken.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
    await tx.accountAudit.create({ data: { actorId: admin.id, targetId: invite.profileId, action: "team_invitation_cancelled", metadata: { invitationId: invite.id, email: invite.email } } });
    return { ok: true, message: "تم إلغاء الدعوة." };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

}

export async function acceptTeamInvitationService(
  sessionActor: { id?: string; email?: string; authVersion?: number } | null,
  input: {
    token: string;
    nickname?: string;
    password?: string;
  }
): Promise<OperationResult> {
  const tokenHash = hashToken(input.token.trim());
  const now = new Date();

  // Guard bounds
  const pre = await db.accountToken.findUnique({
    where: { tokenHash },
  });
  if (!pre || pre.purpose !== AccountTokenPurpose.invite || pre.consumedAt || pre.revokedAt || pre.expiresAt <= now) {
    return { ok: false, error: "الدعوة غير صالحة أو منتهية الصلاحية." };
  }

  const inviteEmail = pre.email.toLowerCase();
  const assignedRole = pre.role;
  if (!assignedRole) {
    return { ok: false, error: "الدعوة غير صالحة." };
  }

  let newPasswordHash: string | null = null;
  if (input.password) {
    newPasswordHash = await hashPassword(input.password);
  }

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await db.$transaction(
        async (tx) => {
          const invite = await tx.accountToken.findUnique({
            where: { tokenHash },
          });

          if (!invite || invite.purpose !== AccountTokenPurpose.invite || invite.consumedAt || invite.revokedAt || invite.expiresAt <= now) {
            return { ok: false, error: "الدعوة غير صالحة أو منتهية الصلاحية." };
          }

          const inviter = invite.createdById ? await tx.profile.findUnique({ where: { id: invite.createdById } }) : null;
          if (!inviter || inviter.role !== "admin" || inviter.disabledAt || !inviter.emailVerifiedAt || inviter.authVersion !== invite.createdByAuthVersion) {
            return { ok: false, error: "الدعوة لم تعد متاحة. اطلب دعوة جديدة من الإدارة." };
          }

          const existingProfile = await tx.profile.findUnique({
            where: { email: inviteEmail },
          });

          if (existingProfile) {
            // Existing-account acceptance requires matching signed-in verified active account
            // and must NEVER change password; accepting invite cannot re-enable disabled account
            // or unverified existing account.
            if (!sessionActor?.id || sessionActor.id !== existingProfile.id || sessionActor.authVersion !== existingProfile.authVersion) {
              return {
                ok: false,
                error: "قبول هذه الدعوة يتطلب تسجيل الدخول بنفس الحساب المدعو أولاً.",
              };
            }

            if (existingProfile.disabledAt) {
              return { ok: false, error: "الحساب معطّل، لا يمكن قبول الدعوة." };
            }

            if (!existingProfile.emailVerifiedAt) {
              return { ok: false, error: "يجب تأكيد البريد الإلكتروني للحساب قبل قبول الدعوة." };
            }
            if (existingProfile.role === "admin" && assignedRole !== "admin") return { ok: false, error: "تغيير دور الأدمن يتم من إدارة الأدوار، وليس من الدعوات." };

            // Consume invite
            await tx.accountToken.update({
              where: { id: invite.id },
              data: { consumedAt: now },
            });

            // Update role to stored role and bump authVersion to cycle session
            await tx.profile.update({
              where: { id: existingProfile.id },
              data: {
                role: assignedRole,
                authVersion: { increment: 1 },
              },
            });

            await tx.accountAudit.create({
              data: {
                actorId: existingProfile.id,
                targetId: existingProfile.id,
                action: "team_invitation_accepted_existing",
                metadata: { role: assignedRole, email: inviteEmail },
              },
            });

            return {
              ok: true,
              message: "تم قبول الدعوة وتحديث صلاحيات حسابك بنجاح.",
              next: "/login?next=%2Fstudio",
            };
          } else {
            // New invitee
            if (!input.nickname || !newPasswordHash) {
              return { ok: false, error: "الاسم وكلمة المرور مطلوبان لإنشاء الحساب." };
            }

            // Consume invite
            await tx.accountToken.update({
              where: { id: invite.id },
              data: { consumedAt: now },
            });

            // New invitee verifies by accepting bound mailed link and creates storedrole
            const created = await tx.profile.create({
              data: {
                email: inviteEmail,
                nickname: input.nickname.trim(),
                passwordHash: newPasswordHash,
                role: assignedRole,
                emailVerifiedAt: now,
                disabledAt: null,
                authVersion: 0,
              },
            });

            await tx.accountAudit.create({
              data: {
                actorId: created.id,
                targetId: created.id,
                action: "team_invitation_accepted_new",
                metadata: { role: assignedRole, email: inviteEmail },
              },
            });

            return {
              ok: true,
              message: "تم إنشاء حسابك وتفعيل انضمامك إلى الفريق بنجاح.",
              next: "/login",
            };
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      return res;
    } catch (err: any) {
      if (err?.code === "P2034" || err?.meta?.code === "40001") {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
          continue;
        }
      }
      throw err;
    }
  }

  return { ok: false, error: "حدث خطأ أثناء قبول الدعوة، يرجى المحاولة لاحقًا." };
}

/* ------------------------------------------------------------------ */
/* Set Account Enabled (Admin only)                                   */
/* ------------------------------------------------------------------ */

export async function setAccountEnabledService(
  actorAdminId: string,
  input: {
    profileId: string;
    enabled: boolean;
  },
  expectedAuthVersion?: number
): Promise<OperationResult> {
  const admin = await db.profile.findUnique({ where: { id: actorAdminId } });
  if (!admin || admin.role !== "admin" || admin.disabledAt || !admin.emailVerifiedAt || (expectedAuthVersion !== undefined && admin.authVersion !== expectedAuthVersion)) {
    return { ok: false, error: "forbidden" };
  }

  const { profileId, enabled } = input;

  if (profileId === admin.id && !enabled) {
    return { ok: false, error: "لا يمكنك تعطيل حسابك الخاص." };
  }

  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await db.$transaction(
        async (tx) => {
          const freshAdmin = await tx.profile.findUnique({ where: { id: admin.id } });
          if (!freshAdmin || freshAdmin.role !== "admin" || freshAdmin.disabledAt || !freshAdmin.emailVerifiedAt || freshAdmin.authVersion !== admin.authVersion) {
            return { ok: false, error: "forbidden" };
          }

          const target = await tx.profile.findUnique({ where: { id: profileId } });
          if (!target) return { ok: false, error: "not_found" };
          if (enabled === !Boolean(target.disabledAt)) return { ok: true };

          // Protect last active verified admin under concurrent disable
          if (target.role === "admin" && !target.disabledAt && target.emailVerifiedAt && !enabled) {
            const activeAdminCount = await tx.profile.count({
              where: {
                role: "admin",
                disabledAt: null,
                emailVerifiedAt: { not: null },
              },
            });
            if (activeAdminCount <= 1) {
              return { ok: false, error: "last_admin" };
            }
          }

          const disabledAt = enabled ? null : new Date();

          await tx.profile.update({
            where: { id: profileId },
            data: {
              disabledAt,
              authVersion: { increment: 1 }, // bump authVersion on disabling/enabling
            },
          });

          await tx.accountAudit.create({
            data: {
              actorId: freshAdmin.id,
              targetId: target.id,
              action: enabled ? "account_enabled" : "account_disabled",
              metadata: { targetEmail: target.email },
            },
          });

          return { ok: true, message: enabled ? "تم تفعيل الحساب." : "تم تعطيل الحساب." };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      return res;
    } catch (err: any) {
      if (err?.code === "P2034" || err?.meta?.code === "40001") {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
          continue;
        }
      }
      throw err;
    }
  }

  return { ok: false, error: "conflict" };
}

/* ------------------------------------------------------------------ */
/* Read-Side Helpers                                                  */
/* ------------------------------------------------------------------ */

export async function getInvitationInfo(token: string): Promise<{
  email: string;
  role: string;
  existingAccount: boolean;
} | null> {
  const tokenHash = hashToken(token.trim());
  const now = new Date();

  const record = await db.accountToken.findUnique({
    where: { tokenHash },
  });

  if (
    !record ||
    record.purpose !== AccountTokenPurpose.invite ||
    record.consumedAt ||
    record.revokedAt ||
    record.expiresAt <= now ||
    !record.role
  ) {
    return null;
  }

  const existingProfile = await db.profile.findUnique({
    where: { email: record.email.toLowerCase() },
  });

  return {
    email: record.email,
    role: record.role,
    existingAccount: Boolean(existingProfile),
  };
}

export async function getAccountInvitations(actorAdminId: string): Promise<
  Array<{
    id: string;
    email: string;
    role: string;
    expiresAt: Date;
    status: "pending" | "consumed" | "revoked" | "expired";
  }>
> {
  const admin = await db.profile.findUnique({ where: { id: actorAdminId } });
  if (!admin || admin.role !== "admin" || admin.disabledAt || !admin.emailVerifiedAt) {
    return [];
  }

  const tokens = await db.accountToken.findMany({
    where: { purpose: AccountTokenPurpose.invite },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      consumedAt: true,
      revokedAt: true,
    },
  });

  const now = new Date();
  return tokens.map((t) => {
    let status: "pending" | "consumed" | "revoked" | "expired" = "pending";
    if (t.consumedAt) status = "consumed";
    else if (t.revokedAt) status = "revoked";
    else if (t.expiresAt <= now) status = "expired";

    return {
      id: t.id,
      email: t.email,
      role: t.role ?? "contributor",
      expiresAt: t.expiresAt,
      status,
    };
  });
}

export async function getLocalMailbox(actorAdminId: string): Promise<
  Array<{
    id: string;
    to: string;
    subject: string;
    text: string;
    createdAt: string;
  }>
> {
  const admin = await db.profile.findUnique({ where: { id: actorAdminId } });
  if (!admin || admin.role !== "admin" || admin.disabledAt || !admin.emailVerifiedAt) {
    return [];
  }

  const localDir = process.env.ACCOUNT_MAIL_LOCAL_DIR;
  if (!localDir || !isLocalMailAllowed()) {
    return [];
  }

  try {
    const files = await readdir(localDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json")).sort().reverse();
    const results: Array<{ id: string; to: string; subject: string; text: string; createdAt: string }> = [];
    for (const file of jsonFiles) {
      const content = await readFile(path.join(localDir, file), "utf8");
      results.push(JSON.parse(content));
    }
    return results;
  } catch {
    return [];
  }
}
