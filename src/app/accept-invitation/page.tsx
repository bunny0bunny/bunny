import { Suspense } from "react";
import type { Metadata } from "next";
import { getInvitationInfo } from "@/lib/account-service";
import { getSession } from "@/lib/queries";
import { AcceptInvitationView, type InvitationData } from "@/components/accounts/accept-invitation-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "قبول دعوة الانضمام — مكتبة بانيورا",
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const rawToken = token?.trim() || "";

  let invitationData: InvitationData | null = null;
  if (rawToken) {
    try {
      const info = await getInvitationInfo(rawToken);
      if (info) {
        invitationData = {
          token: rawToken,
          email: info.email,
          role: info.role,
          existingAccount: info.existingAccount,
        };
      }
    } catch {
      invitationData = null;
    }
  }

  const session = await getSession();
  const currentSession = session?.user?.id
    ? {
        id: session.user.id,
        email: session.user.email ?? null,
        name: session.user.name ?? null,
      }
    : null;

  return (
    <main className="bg-library-glow flex min-h-screen items-center justify-center px-4 py-10">
      <Suspense fallback={<div className="size-9 animate-pulse rounded-full bg-accent" />}>
        <AcceptInvitationView
          invitation={invitationData}
          currentSession={currentSession}
        />
      </Suspense>
    </main>
  );
}
