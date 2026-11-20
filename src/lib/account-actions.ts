"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { profileNameSchema } from "@/lib/profile-name";
import { removeProfileAvatarAsAdmin } from "@/lib/profile-avatar";
import { GENRES } from "@/lib/constants";
import { currentProfileOrNull } from "@/lib/queries";
import { headers } from "next/headers";
import { allowAccountClient } from "@/lib/account-ratelimit";
import {
  registerReaderService,
  resendVerificationService,
  verifyEmailTokenService,
  requestPasswordResetService,
  resetPasswordWithTokenService,
  changeAccountPasswordService,
  saveOnboardingService,
  createTeamInvitationService,
  cancelTeamInvitationService,
  acceptTeamInvitationService,
  setAccountEnabledService,
  type OperationResult,
} from "@/lib/account-service";

async function safely(operation: Promise<OperationResult>): Promise<OperationResult> {
  try { return await operation; } catch { return { ok: false, error: "تعذّر إكمال العملية. حاول مرة أخرى." }; }
}

const registerSchema = z.object({
  email: z.string().trim().max(254).email("البريد الإلكتروني غير صالح"),
  nickname: profileNameSchema,
  password: z.string().min(12, "كلمة المرور ١٢ حرفًا على الأقل").max(128, "كلمة المرور ١٢٨ حرفًا على الأكثر"),
  next: z.string().optional(),
});

const resendSchema = z.object({
  email: z.string().trim().max(254).email("البريد الإلكتروني غير صالح"),
  next: z.string().optional(),
});

const verifyTokenSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12, "كلمة المرور ١٢ حرفًا على الأقل").max(128),
});

const requestResetSchema = z.object({
  email: z.string().trim().max(254).email("البريد الإلكتروني غير صالح"),
});

const resetWithTokenSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12, "كلمة المرور ١٢ حرفًا على الأقل").max(128, "كلمة المرور ١٢٨ حرفًا على الأكثر"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة").max(128),
  password: z.string().min(12, "كلمة المرور الجديدة ١٢ حرفًا على الأقل").max(128, "كلمة المرور الجديدة ١٢٨ حرفًا على الأكثر"),
});

const onboardingSchema = z.object({
  genres: z.array(z.enum(GENRES)).max(GENRES.length),
  skip: z.boolean().optional(),
  next: z.string().optional(),
});

const createInviteSchema = z.object({
  email: z.string().trim().max(254).email("البريد الإلكتروني غير صالح"),
  role: z.enum(["contributor", "editor", "admin"]),
});

const cancelInviteSchema = z.object({
  invitationId: z.string().min(1, "معرّف الدعوة مطلوب"),
});

const acceptInviteSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  nickname: profileNameSchema.optional(),
  password: z.string().min(12).max(128).optional(),
});

const setEnabledSchema = z.object({
  profileId: z.string().min(1, "معرّف الحساب مطلوب"),
  enabled: z.boolean(),
});

export async function registerReader(input: unknown): Promise<OperationResult> {
  if (!await allowAccountClient("signup", (await headers()).get("x-forwarded-for"))) return { ok: false, error: "تم تجاوز الحد الأقصى للمحاولات." };
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  return safely(registerReaderService(parsed.data));
}

export async function resendVerification(input: unknown): Promise<OperationResult> {
  if (!await allowAccountClient("resend", (await headers()).get("x-forwarded-for"))) return { ok: false, error: "تم تجاوز الحد الأقصى للمحاولات." };
  const parsed = resendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  return safely(resendVerificationService(parsed.data));
}

export async function verifyEmailToken(input: unknown): Promise<OperationResult> {
  if (!await allowAccountClient("verify", (await headers()).get("x-forwarded-for"))) return { ok: false, error: "تم تجاوز الحد الأقصى للمحاولات." };
  const parsed = verifyTokenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "رمز غير صالح" };
  }
  return safely(verifyEmailTokenService(parsed.data));
}

export async function requestPasswordReset(input: unknown): Promise<OperationResult> {
  if (!await allowAccountClient("reset", (await headers()).get("x-forwarded-for"))) return { ok: false, error: "تم تجاوز الحد الأقصى للمحاولات." };
  const parsed = requestResetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  return safely(requestPasswordResetService(parsed.data));
}

export async function resetPasswordWithToken(input: unknown): Promise<OperationResult> {
  if (!await allowAccountClient("reset-consume", (await headers()).get("x-forwarded-for"))) return { ok: false, error: "تم تجاوز الحد الأقصى للمحاولات." };
  const parsed = resetWithTokenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  return safely(resetPasswordWithTokenService(parsed.data));
}

export async function changeAccountPassword(input: unknown): Promise<OperationResult> {
  const session = await currentProfileOrNull();
  if (!session?.id) {
    return { ok: false, error: "unauthenticated" };
  }
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  return safely(changeAccountPasswordService(session.id, parsed.data, session.authVersion));
}

export async function saveOnboarding(input: unknown): Promise<OperationResult> {
  const session = await currentProfileOrNull();
  if (!session?.id) {
    return { ok: false, error: "unauthenticated" };
  }
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  return safely(saveOnboardingService(session.id, parsed.data, session.authVersion));
}

export async function createTeamInvitation(input: unknown): Promise<OperationResult> {
  const session = await currentProfileOrNull();
  if (!session?.id) {
    return { ok: false, error: "forbidden" };
  }
  const parsed = createInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  return safely(createTeamInvitationService(session.id, parsed.data, session.authVersion));
}

export async function cancelTeamInvitation(input: unknown): Promise<OperationResult> {
  const session = await currentProfileOrNull();
  if (!session?.id) {
    return { ok: false, error: "forbidden" };
  }
  const parsed = cancelInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  return safely(cancelTeamInvitationService(session.id, parsed.data, session.authVersion));
}

export async function acceptTeamInvitation(input: unknown): Promise<OperationResult> {
  if (!await allowAccountClient("invite-consume", (await headers()).get("x-forwarded-for"))) return { ok: false, error: "تم تجاوز الحد الأقصى للمحاولات." };
  const session = await currentProfileOrNull();
  const parsed = acceptInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  return safely(acceptTeamInvitationService(
    session ? { id: session.id, email: session.email, authVersion: session.authVersion } : null,
    parsed.data
  ));
}

export async function setAccountEnabled(input: unknown): Promise<OperationResult> {
  const session = await currentProfileOrNull();
  if (!session?.id) {
    return { ok: false, error: "forbidden" };
  }
  const parsed = setEnabledSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  return safely(setAccountEnabledService(session.id, parsed.data, session.authVersion));
}

const removeAvatarSchema = z.object({ profileId: z.string().min(1).max(96) });

/** Admin moderation: remove a member's uploaded picture (audited). */
export async function removeProfileAvatar(input: unknown): Promise<OperationResult> {
  const parsed = removeAvatarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const result = await removeProfileAvatarAsAdmin(parsed.data.profileId);
    return result.ok ? { ok: true } : { ok: false, error: result.error ?? "invalid" };
  } catch { return { ok: false, error: "تعذّر إكمال العملية. حاول مرة أخرى." }; }
}

const preferredGenresSchema = z.object({ genres: z.array(z.enum(GENRES)).max(GENRES.length) });

/** Readers edit the genres they like; the "for you" rail uses them. */
export async function updatePreferredGenres(input: unknown): Promise<OperationResult> {
  const profile = await currentProfileOrNull();
  if (!profile) return { ok: false, error: "unauthenticated" };
  const parsed = preferredGenresSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await db.profile.update({ where: { id: profile.id }, data: { preferredGenresJson: JSON.stringify([...new Set(parsed.data.genres)]) } });
  revalidatePath("/");
  revalidatePath("/profile");
  return { ok: true };
}
