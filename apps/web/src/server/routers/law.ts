import { z } from "zod";

import { publicProcedure, router } from "../trpc";

export const lawRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.law.findMany({
      orderBy: [{ year: "desc" }, { number: "asc" }],
      select: { id: true, citation: true, titleCs: true, year: true },
    }),
  ),

  byCitation: publicProcedure
    .input(z.object({ citation: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.law.findFirst({
        where: { citation: input.citation },
        include: { snapshots: { orderBy: { seq: "asc" } } },
      }),
    ),
});
