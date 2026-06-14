import type { LawDocument, NodeType, ReaderUnit } from "@legisnote/shared";
import { z } from "zod";

import { publicProcedure, router } from "../trpc";

const toIsoDate = (d: Date): string => d.toISOString().slice(0, 10);

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

  /**
   * Read-only view of a law's consolidated snapshot as an ordered unit tree
   * (FR-1/2). Snapshot selection: explicit `seq` → that snapshot; else `asOf`
   * date → the snapshot in force on that date (FR-10 "as of"); else the law's
   * current snapshot (D5). Returns null when the law or a viewable snapshot is
   * missing. The tree is reconstructed from `parentUnitId` + `ordinal` (the
   * ltree `path` is Unsupported(...) in Prisma, so we don't query it).
   */
  getDocument: publicProcedure
    .input(
      z.object({
        number: z.string(),
        year: z.number().int(),
        asOf: z.string().optional(),
        seq: z.number().int().optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<LawDocument | null> => {
      const law = await ctx.db.law.findUnique({
        where: { number_year: { number: input.number, year: input.year } },
      });
      if (!law) return null;

      let snapshot = null;
      if (input.seq != null) {
        snapshot = await ctx.db.lawSnapshot.findUnique({
          where: { lawId_seq: { lawId: law.id, seq: input.seq } },
        });
      } else if (input.asOf) {
        const asOf = new Date(input.asOf);
        snapshot = await ctx.db.lawSnapshot.findFirst({
          where: {
            lawId: law.id,
            effectiveFrom: { lte: asOf },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
          },
          orderBy: { effectiveFrom: "desc" },
        });
      } else if (law.currentSnapshotId) {
        snapshot = await ctx.db.lawSnapshot.findUnique({
          where: { id: law.currentSnapshotId },
        });
      }
      if (!snapshot) return null;

      const rows = await ctx.db.snapshotUnit.findMany({
        where: { snapshotId: snapshot.id },
        select: {
          id: true,
          nodeId: true,
          parentUnitId: true,
          nodeType: true,
          label: true,
          ordinal: true,
          text: true,
          node: { select: { nodeKey: true } },
        },
      });

      // Build the tree from parent_unit_id; keep parent linkage on a scratch field.
      type Scratch = ReaderUnit & { _parentUnitId: string | null };
      const byId = new Map<string, Scratch>();
      for (const r of rows) {
        byId.set(r.id, {
          nodeId: r.nodeId,
          nodeKey: r.node.nodeKey,
          nodeType: r.nodeType as NodeType,
          label: r.label,
          ordinal: r.ordinal,
          text: r.text,
          children: [],
          _parentUnitId: r.parentUnitId,
        });
      }

      const roots: Scratch[] = [];
      for (const node of byId.values()) {
        const parent = node._parentUnitId ? byId.get(node._parentUnitId) : undefined;
        if (parent) parent.children.push(node);
        else roots.push(node);
      }

      // Return clean ReaderUnit objects (drop the scratch field), ordinal-sorted.
      const finalize = (list: ReaderUnit[]): ReaderUnit[] =>
        [...list]
          .sort((a, b) => a.ordinal - b.ordinal)
          .map((u) => ({
            nodeId: u.nodeId,
            nodeKey: u.nodeKey,
            nodeType: u.nodeType,
            label: u.label,
            ordinal: u.ordinal,
            text: u.text,
            children: finalize(u.children),
          }));

      return {
        law: {
          id: law.id,
          citation: law.citation,
          titleCs: law.titleCs,
          shortTitle: law.shortTitle,
          year: law.year,
          number: law.number,
        },
        snapshot: {
          id: snapshot.id,
          seq: snapshot.seq,
          effectiveFrom: toIsoDate(snapshot.effectiveFrom),
          effectiveTo: snapshot.effectiveTo ? toIsoDate(snapshot.effectiveTo) : null,
          amendingAct: snapshot.amendingAct,
        },
        units: finalize(roots),
      };
    }),
});
