import { createCallerFactory, publicProcedure, router } from "../trpc";
import { lawRouter } from "./law";
import { overlayRouter } from "./overlay";
import { searchRouter } from "./search";
import { studyRouter } from "./study";
import { versioningRouter } from "./versioning";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, ts: new Date().toISOString() })),
  law: lawRouter,
  overlay: overlayRouter,
  search: searchRouter,
  study: studyRouter,
  versioning: versioningRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
