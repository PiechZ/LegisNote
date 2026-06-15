import { createCallerFactory, publicProcedure, router } from "../trpc";
import { editorialRouter } from "./editorial";
import { lawRouter } from "./law";
import { overlayRouter } from "./overlay";
import { searchRouter } from "./search";
import { studyRouter } from "./study";
import { versioningRouter } from "./versioning";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, ts: new Date().toISOString() })),
  law: lawRouter,
  editorial: editorialRouter,
  overlay: overlayRouter,
  search: searchRouter,
  study: studyRouter,
  versioning: versioningRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
