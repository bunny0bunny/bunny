import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireProfile } from "@/lib/queries";
import { safeAccountDestination } from "@/lib/account-destination";
import { WelcomeOnboarding } from "@/components/accounts/welcome-onboarding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "مرحبًا بك — مكتبة بانيورا",
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const profile = await requireProfile();
  const { next } = await searchParams;

  const isStaff = profile.role !== "reader";
  const defaultDest = isStaff ? "/studio" : "/";
  const targetNext = safeAccountDestination(next, defaultDest);

  // If already onboarded, immediately redirect to target destination
  if (profile.onboardingCompletedAt) {
    redirect(targetNext);
  }

  return (
    <main className="bg-library-glow flex min-h-screen items-center justify-center px-4 py-10">
      <WelcomeOnboarding
        nickname={profile.nickname}
        isStaff={isStaff}
        next={targetNext}
      />
    </main>
  );
}
