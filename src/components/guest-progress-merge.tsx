"use client";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { clearLocalProgress, readAllLocal } from "@/lib/progress-local";
import { mergeGuestProgress } from "@/lib/actions";

const FLAG = "bunny.progress.merged";

/** Once per signed-in browser session, move this device's guest reading positions into the account. */
export function GuestProgressMerge() {
  const { data, status } = useSession();
  const router = useRouter();
  const profileId = data?.user?.id;
  useEffect(() => {
    if (status !== "authenticated" || !profileId) return;
    try { if (window.sessionStorage.getItem(FLAG) === profileId) return; } catch { return; }
    const entries = readAllLocal().map((p) => ({ seriesSlug: p.seriesSlug, chapterNumber: p.chapterNumber, pageIndex: p.pageIndex, pageOffset: p.pageOffset ?? null, percent: p.percent, completed: p.completed, updatedAt: p.updatedAt }));
    const done = () => { try { window.sessionStorage.setItem(FLAG, profileId); } catch { /* ignore */ } };
    if (!entries.length) { done(); return; }
    mergeGuestProgress(entries).then((result) => {
      if (!result.ok) return;
      done();
      clearLocalProgress();
      if (result.merged) router.refresh();
    }).catch(() => {});
  }, [status, profileId, router]);
  return null;
}
