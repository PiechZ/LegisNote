import { createCallerFactory, publicProcedure, router } from "../trpc";
import { lawRouter } from "./law";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, ts: new Date().toISOString() })),
  law: lawRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
