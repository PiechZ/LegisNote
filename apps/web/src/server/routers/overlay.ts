import type { NodeOverlay, OverlayByNode } from "@legisnote/shared";
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { db as Db } from "../db";
import { editorProcedure, publicProcedure, router } from "../trpc";

/**
 * Annotation overlay (FR-3/4/5/6). Reads are public (the shared/canonical layer
 * is visible to everyone, FR-7); writes require Editor/Admin. All anchors in v1
 * are whole-unit (NULL selector); range/term selectors are a later increment.
 */

type DbClient = typeof Db;

const iso = (d: Date): string => d.toISOString();

/** Find or create the whole-unit (NULL-selector) anchor for a node. */
async function wholeUnitAnchor(db: DbClient, nodeId: string): Promise<{ id: string }> {
  const node = await db.structuralNode.findUnique({
    where: { id: nodeId },
    select: { id: true, lawId: true, law: { select: { currentSnapshotId: true } } },
  });
  if (!node) throw new TRPCError({ code: "NOT_FOUND", message: "Unknown node." });

  const existing = await db.anchor.findFirst({
    where: { nodeId, selector: { equals: Prisma.DbNull } },
    select: { id: true },
  });
  if (existing) return existing;

  return db.anchor.create({
    data: {
      lawId: node.lawId,
      nodeId,
      createdInSnapshotId: node.law.currentSnapshotId,
    },
    select: { id: true },
  });
}

const annotationText = (body: Prisma.JsonValue): string => {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const t = (body as Record<string, unknown>).text;
    if (typeof t === "string") return t;
  }
  return "";
};

export const overlayRouter = router({
  /** All overlay items for a law, grouped by stable nodeId. */
  forLaw: publicProcedure
    .input(z.object({ lawId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<OverlayByNode> => {
      const anchors = await ctx.db.anchor.findMany({
        where: { lawId: input.lawId },
        include: {
          annotations: true,
          comments: true,
          tagAssignments: { include: { tag: true } },
          linksFrom: { include: { dst: { select: { nodeId: true } } } },
          linksTo: { include: { src: { select: { nodeId: true } } } },
        },
      });

      const byNode: OverlayByNode = {};
      const bucket = (nodeId: string): NodeOverlay =>
        (byNode[nodeId] ??= { tags: [], annotations: [], comments: [], links: [] });

      for (const a of anchors) {
        const o = bucket(a.nodeId);
        for (const ta of a.tagAssignments) {
          o.tags.push({ tagId: ta.tag.id, anchorId: a.id, name: ta.tag.name, color: ta.tag.color });
        }
        for (const an of a.annotations) {
          o.annotations.push({ id: an.id, text: annotationText(an.body), authorId: an.authorId, createdAt: iso(an.createdAt) });
        }
        for (const c of a.comments) {
          o.comments.push({ id: c.id, body: c.body, parentId: c.parentId, authorId: c.authorId, createdAt: iso(c.createdAt) });
        }
        for (const l of a.linksFrom) {
          o.links.push({ id: l.id, direction: "from", kind: l.kind, label: l.label, otherNodeId: l.dst.nodeId });
        }
        for (const l of a.linksTo) {
          o.links.push({ id: l.id, direction: "to", kind: l.kind, label: l.label, otherNodeId: l.src.nodeId });
        }
      }
      return byNode;
    }),

  /** Shared tag catalog (for the add-tag UI). */
  tagCatalog: publicProcedure.query(({ ctx }) =>
    ctx.db.tag.findMany({
      where: { scope: "shared", ownerId: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ),

  // --- writes (Editor/Admin, shared layer) ---------------------------------
  addTag: editorProcedure
    .input(z.object({ nodeId: z.string().uuid(), name: z.string().trim().min(1).max(64), color: z.string().max(32).optional() }))
    .mutation(async ({ ctx, input }) => {
      const anchor = await wholeUnitAnchor(ctx.db, input.nodeId);
      let tag = await ctx.db.tag.findFirst({ where: { scope: "shared", ownerId: null, name: input.name } });
      tag ??= await ctx.db.tag.create({ data: { scope: "shared", name: input.name, color: input.color ?? null } });
      await ctx.db.tagAssignment.upsert({
        where: { tagId_anchorId: { tagId: tag.id, anchorId: anchor.id } },
        update: {},
        create: { tagId: tag.id, anchorId: anchor.id, assignedBy: ctx.user.id },
      });
      return { ok: true };
    }),

  removeTag: editorProcedure
    .input(z.object({ tagId: z.string().uuid(), anchorId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.tagAssignment.delete({ where: { tagId_anchorId: { tagId: input.tagId, anchorId: input.anchorId } } });
      return { ok: true };
    }),

  addAnnotation: editorProcedure
    .input(z.object({ nodeId: z.string().uuid(), text: z.string().trim().min(1).max(10000) }))
    .mutation(async ({ ctx, input }) => {
      const anchor = await wholeUnitAnchor(ctx.db, input.nodeId);
      await ctx.db.annotation.create({ data: { anchorId: anchor.id, body: { text: input.text }, authorId: ctx.user.id } });
      return { ok: true };
    }),

  deleteAnnotation: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.annotation.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  addComment: editorProcedure
    .input(z.object({ nodeId: z.string().uuid(), body: z.string().trim().min(1).max(10000), parentId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const anchor = await wholeUnitAnchor(ctx.db, input.nodeId);
      await ctx.db.comment.create({ data: { anchorId: anchor.id, body: input.body, parentId: input.parentId ?? null, authorId: ctx.user.id } });
      return { ok: true };
    }),

  deleteComment: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.comment.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  addLink: editorProcedure
    .input(
      z.object({
        srcNodeId: z.string().uuid(),
        dstNodeId: z.string().uuid(),
        kind: z.enum(["reference", "cross_law", "definition", "related", "amends", "see_also", "custom"]).default("reference"),
        label: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.srcNodeId === input.dstNodeId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A link needs two different units." });
      }
      const [src, dst] = await Promise.all([
        wholeUnitAnchor(ctx.db, input.srcNodeId),
        wholeUnitAnchor(ctx.db, input.dstNodeId),
      ]);
      await ctx.db.link.create({
        data: { srcAnchorId: src.id, dstAnchorId: dst.id, kind: input.kind, label: input.label ?? null, ownerId: null },
      });
      return { ok: true };
    }),

  deleteLink: editorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.link.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
