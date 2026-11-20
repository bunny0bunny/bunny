"use client";

import { SessionProvider } from "next-auth/react";
import { GuestProgressMerge } from "@/components/guest-progress-merge";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider><GuestProgressMerge />{children}</SessionProvider>;
}
