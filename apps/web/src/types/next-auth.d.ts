import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Carry the app user's id + role through the session and JWT (set in auth.ts
// callbacks; consumed by the tRPC RBAC middleware).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
  }
}
