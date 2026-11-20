import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/constants";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      authVersion: number;
      avatarSeed?: string;
      avatarPath?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth" {
  interface User {
    authVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: string;
    authVersion?: number;
  }
}
