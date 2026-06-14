import { initTRPC } from "@trpc/server";
import superjson from "superjson";

import { db } from "./db";

export interface Context {
  db: typeof db;
}

export function createContext(): Context {
  return { db };
}

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// TODO(auth): add `protectedProcedure` / `editorProcedure` middleware enforcing
// the Reader -> Editor -> Admin RBAC (docs/architecture.md §2.4) once Auth.js is wired.
