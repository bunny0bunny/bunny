import type { Metadata } from "next";
import { UsersRound } from "lucide-react";
import { requireRole, getAdminUsers } from "@/lib/queries";
import { getAccountInvitations } from "@/lib/account-service";
import { AdminUsersView } from "@/components/accounts/admin-users-view";
import { profileAvatarPath } from "@/lib/profile-avatar-policy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "المستخدمون والأدوار — لوحة الإدارة",
};

export default async function AdminUsersPage() {
  const me = await requireRole(["admin"]);
  const [users, rawInvitations] = await Promise.all([
    getAdminUsers(),
    getAccountInvitations(me.id),
  ]);

  const serializedUsers = users.map((u) => ({
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    role: u.role,
    avatarSeed: u.avatarSeed,
    avatarPath: profileAvatarPath(u.id, u.avatarKey),
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
    emailVerifiedAt: u.emailVerifiedAt ? (u.emailVerifiedAt instanceof Date ? u.emailVerifiedAt.toISOString() : String(u.emailVerifiedAt)) : null,
    disabledAt: u.disabledAt ? (u.disabledAt instanceof Date ? u.disabledAt.toISOString() : String(u.disabledAt)) : null,
    _count: u._count,
  }));

  const serializedInvitations = rawInvitations.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    expiresAt: i.expiresAt instanceof Date ? i.expiresAt.toISOString() : String(i.expiresAt),
    status: i.status,
  }));

  const isLocalMailboxAvailable =
    process.env.ACCOUNT_MAIL_MODE === "local" &&
    (process.env.BUNNY_LOCAL_PREVIEW === "1" || Boolean(process.env.READER_QA_DATABASE_NAME));

  return (
    <main className="mx-auto max-w-4xl p-4 pt-6 sm:p-6">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <UsersRound className="size-6 text-primary" aria-hidden />
          المستخدمون والأدوار
        </h1>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          شاشة حصرية للمدير — تغيير الدور يسري فورًا على الجلسة التالية للمستخدم. تعطيل الحساب يلغي وصوله فورًا.
        </p>
      </header>

      <AdminUsersView
        users={serializedUsers}
        invitations={serializedInvitations}
        currentAdminId={me.id}
        isLocalMailboxAvailable={isLocalMailboxAvailable}
      />
    </main>
  );
}
