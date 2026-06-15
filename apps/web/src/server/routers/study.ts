import { z } from "zod";

import { rangeAnchor, wholeUnitAnchor } from "../anchors";
import { editorProcedure, protectedProcedure, publicProcedure, router } from "../trpc";

const selectorSchema = z
  .object({ start: z.number().int().min(0), end: z.number().int(), quote: z.string().min(1).max(2000) })
  .refine((s) => s.end > s.start, { message: "end must be > start" });

/**
 * Study aids (FR-11/12/13). Exams + admin-curated exam highlights are the shared
 * test-relevance database (D9); reads are public so students can filter "what's
 * relevant for test X" (FR-13). UserHighlight is the personal layer (FR-12),
 * scoped to the logged-in user.
 */

export interface ExamHighlightInfo {
  anchorId: string;
  note: string | null;
  weight: number | null;
}
export interface UserHighlightInfo {
  anchorId: string;
  color: string | null;
  note: string | null;
}

export const studyRouter = router({
  exams: publicProcedure.query(({ ctx }) =>
    ctx.db.exam.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, _count: { select: { highlights: true } } },
    }),
  ),

  /** nodeId → exam-highlight info for one exam within one law (FR-11/13). */
  examHighlightsForLaw: publicProcedure
    .input(z.object({ lawId: z.string().uuid(), examId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<Record<string, ExamHighlightInfo>> => {
      const rows = await ctx.db.examHighlight.findMany({
        where: { examId: input.examId, anchor: { lawId: input.lawId } },
        select: { note: true, weight: true, anchor: { select: { id: true, nodeId: true } } },
      });
      const byNode: Record<string, ExamHighlightInfo> = {};
      for (const r of rows) byNode[r.anchor.nodeId] = { anchorId: r.anchor.id, note: r.note, weight: r.weight };
      return byNode;
    }),

  createExam: editorProcedure
    .input(z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).optional() }))
    .mutation(({ ctx, input }) =>
      ctx.db.exam.create({ data: { name: input.name, description: input.description ?? null, createdBy: ctx.user.id } }),
    ),

  deleteExam: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.exam.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  addExamHighlight: editorProcedure
    .input(
      z.object({
        examId: z.string().uuid(),
        nodeId: z.string().uuid(),
        note: z.string().trim().max(2000).optional(),
        weight: z.number().int().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const anchor = await wholeUnitAnchor(ctx.db, input.nodeId);
      await ctx.db.examHighlight.upsert({
        where: { examId_anchorId: { examId: input.examId, anchorId: anchor.id } },
        update: { note: input.note ?? null, weight: input.weight ?? null },
        create: { examId: input.examId, anchorId: anchor.id, note: input.note ?? null, weight: input.weight ?? null, createdBy: ctx.user.id },
      });
      return { ok: true };
    }),

  removeExamHighlight: editorProcedure
    .input(z.object({ examId: z.string().uuid(), anchorId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.examHighlight.delete({ where: { examId_anchorId: { examId: input.examId, anchorId: input.anchorId } } });
      return { ok: true };
    }),

  // --- personal study layer (FR-12) ----------------------------------------
  myHighlightsForLaw: protectedProcedure
    .input(z.object({ lawId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<Record<string, UserHighlightInfo>> => {
      const rows = await ctx.db.userHighlight.findMany({
        where: { userId: ctx.user.id, anchor: { lawId: input.lawId } },
        select: { color: true, note: true, anchor: { select: { id: true, nodeId: true } } },
      });
      const byNode: Record<string, UserHighlightInfo> = {};
      for (const r of rows) byNode[r.anchor.nodeId] = { anchorId: r.anchor.id, color: r.color, note: r.note };
      return byNode;
    }),

  toggleMyHighlight: protectedProcedure
    .input(z.object({ nodeId: z.string().uuid(), color: z.string().max(32).optional() }))
    .mutation(async ({ ctx, input }) => {
      const anchor = await wholeUnitAnchor(ctx.db, input.nodeId);
      const existing = await ctx.db.userHighlight.findUnique({
        where: { userId_anchorId: { userId: ctx.user.id, anchorId: anchor.id } },
      });
      if (existing) {
        await ctx.db.userHighlight.delete({ where: { id: existing.id } });
        return { highlighted: false };
      }
      await ctx.db.userHighlight.create({ data: { userId: ctx.user.id, anchorId: anchor.id, color: input.color ?? "#ffd54f" } });
      return { highlighted: true };
    }),

  /** Add a personal highlight on a whole unit or a selected range (FR-12). */
  addHighlight: protectedProcedure
    .input(z.object({ nodeId: z.string().uuid(), selector: selectorSchema.optional(), color: z.string().max(32).optional() }))
    .mutation(async ({ ctx, input }) => {
      const anchor = input.selector
        ? await rangeAnchor(ctx.db, input.nodeId, input.selector)
        : await wholeUnitAnchor(ctx.db, input.nodeId);
      await ctx.db.userHighlight.upsert({
        where: { userId_anchorId: { userId: ctx.user.id, anchorId: anchor.id } },
        update: { color: input.color ?? undefined },
        create: { userId: ctx.user.id, anchorId: anchor.id, color: input.color ?? "#ffd54f" },
      });
      return { ok: true };
    }),

  removeHighlight: protectedProcedure
    .input(z.object({ anchorId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.userHighlight.deleteMany({ where: { userId: ctx.user.id, anchorId: input.anchorId } });
      return { ok: true };
    }),
});
