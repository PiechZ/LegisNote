import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import type { db as Db } from "./db";

type DbClient = typeof Db;

/**
 * Find or create the whole-unit (NULL-selector) anchor for a node. Anchors are
 * the shared attachment point for the overlay (FR-3/4/5/6) and study aids
 * (FR-11/12). Range/term anchors (non-null selector) are a later increment.
 */
export async function wholeUnitAnchor(db: DbClient, nodeId: string): Promise<{ id: string }> {
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
    data: { lawId: node.lawId, nodeId, createdInSnapshotId: node.law.currentSnapshotId },
    select: { id: true },
  });
}
