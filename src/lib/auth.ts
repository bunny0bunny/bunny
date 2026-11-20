import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { profileAvatarPath } from "@/lib/profile-avatar-policy";
import { verifyPassword } from "@/lib/password";
import { isRole, type Role } from "@/lib/constants";
import { allowAccountClient } from "@/lib/account-ratelimit";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().max(254).email("البريد الإلكتروني غير صالح"),
  password: z.string().min(6, "كلمة المرور ٦ أحرف على الأقل").max(128),
});

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "البريد الإلكتروني وكلمة المرور",
      credentials: {
        email: { label: "البريد الإلكتروني", type: "email" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(credentials, request) {
        try {
          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) return null;
          const { email, password } = parsed.data;
          const normalizedEmail = email.toLowerCase().trim();
          const forwarded = request.headers?.["x-forwarded-for"];
          if (!await allowAccountClient("login", typeof forwarded === "string" ? forwarded : null)) return null;

          const profile = await db.profile.findUnique({ where: { email: normalizedEmail } });
          if (!profile) return null;

          // Reject disabled accounts
          if (profile.disabledAt) return null;

          // Reject unverified accounts
          if (!profile.emailVerifiedAt) return null;

          const ok = await verifyPassword(password, profile.passwordHash);
          if (!ok) return null;

          // update last login event (non-blocking failure tolerated)
          try {
            await db.analyticsEvent.create({
              data: { type: "login", profileId: profile.id, metaJson: "{}" },
            });
          } catch {}

          return {
            id: profile.id,
            email: profile.email,
            name: profile.nickname,
            role: profile.role,
            authVersion: profile.authVersion,
          };
        } catch {
          return null; // safe login failure on exception
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role ?? "reader";
        token.authVersion = (user as { authVersion?: number }).authVersion ?? 0;
        return token;
      }

      // Subsequent reads: validate profile active + verified + matching authVersion
      if (token.uid) {
        try {
          const profile = await db.profile.findUnique({
            where: { id: token.uid as string },
            select: { id: true, role: true, authVersion: true, disabledAt: true, emailVerifiedAt: true, nickname: true },
          });

          if (
            !profile ||
            profile.disabledAt ||
            !profile.emailVerifiedAt ||
            profile.authVersion !== token.authVersion
          ) {
            // Empties UID on mismatch; DO NOT re-stamp old JWT to newer authVersion
            delete token.uid;
            delete token.role;
            delete token.authVersion;
          } else {
            token.role = profile.role;
            token.name = profile.nickname;
          }
        } catch {
          delete token.uid;
          delete token.role;
          delete token.authVersion;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // NextAuth v4 accepts null at runtime; its callback type does not expose it.
      if (!token.uid) return null as unknown as typeof session;
      if (session.user && token.uid) {
        session.user.id = (token.uid as string) ?? "";
        session.user.role = (isRole(token.role) ? token.role : "reader") as Role;
        session.user.authVersion = (token.authVersion as number) ?? 0;
        const current = await db.profile.findUnique({ where: { id: session.user.id }, select: { avatarSeed: true, avatarKey: true } });
        session.user.avatarSeed = current?.avatarSeed;
        session.user.avatarPath = profileAvatarPath(session.user.id, current?.avatarKey);
      } else if (session.user) {
        session.user.id = "";
      }
      return session;
    },
  },
};
