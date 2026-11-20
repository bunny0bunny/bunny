"use client";
import { signOut, type SignOutParams } from "next-auth/react";
import { clearLocalProgress } from "@/lib/progress-local";

/** Every sign-out goes through here so the next person on this device does not see the previous reader's progress. */
export function signOutAndForget<R extends boolean = true>(options?: SignOutParams<R>) {
  clearLocalProgress();
  try { window.sessionStorage.removeItem("bunny.progress.merged"); } catch { /* storage unavailable */ }
  return signOut(options);
}
