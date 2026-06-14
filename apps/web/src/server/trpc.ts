import type { UserRole } from "@prisma/client";
import { initTRPC, TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import superjson from "superjson";

import { auth } from "./auth";
import { db } from "./db";

export interface Context {
  db: typeof db;
  session: Session | null;
}

/**
 * Builds the per-request context. `auth()` reads the session from cookies and
 * works both in Route Handlers (the tRPC fetch adapter) and Server Components,
 * so the same factory serves `createCaller` and the HTTP endpoint.
 */
export async function createContext(): Promise<Context> {
  const session = await auth();
  return { db, session };
}

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// --- RBAC (architecture §2.4): Reader -> Editor -> Admin -------------------
const enforceRole = (allowed: UserRole[]) =>
  t.middleware(({ ctx, next }) => {
    const user = ctx.session?.user;
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
    if (!allowed.includes(user.role)) throw new TRPCError({ code: "FORBIDDEN" });
    // Narrow `session`/`user` to non-null for downstream procedures.
    return next({ ctx: { ...ctx, session: ctx.session, user } });
  });

/** Any authenticated user. */
export const protectedProcedure = t.procedure.use(enforceRole(["reader", "editor", "admin"]));
/** Editors and admins (curation, import, publish, shared annotations). */
export const editorProcedure = t.procedure.use(enforceRole(["editor", "admin"]));
/** Admins only (user management, ops). */
export const adminProcedure = t.procedure.use(enforceRole(["admin"]));
