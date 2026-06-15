import type { RangeSelector } from "@legisnote/shared";
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

/**
 * Find or create a range/term anchor for a node (FR-3/4 word-level). Matched by
 * (nodeId, selector.start, selector.end) so re-selecting the same span reuses
 * the anchor; otherwise created with the selector stored as JSON.
 */
export async function rangeAnchor(db: DbClient, nodeId: string, selector: RangeSelector): Promise<{ id: string }> {
  const node = await db.structuralNode.findUnique({
    where: { id: nodeId },
    select: { lawId: true, law: { select: { currentSnapshotId: true } } },
  });
  if (!node) throw new TRPCError({ code: "NOT_FOUND", message: "Unknown node." });

  const existing = await db.anchor.findFirst({
    where: {
      nodeId,
      AND: [
        { selector: { path: ["start"], equals: selector.start } },
        { selector: { path: ["end"], equals: selector.end } },
      ],
    },
    select: { id: true },
  });
  if (existing) return existing;

  return db.anchor.create({
    data: {
      lawId: node.lawId,
      nodeId,
      selector: selector as unknown as Prisma.InputJsonValue,
      createdInSnapshotId: node.law.currentSnapshotId,
    },
    select: { id: true },
  });
}

/** Zod-free selector shape + validity check used by the routers. */
export function isValidSelector(s: RangeSelector | null | undefined): s is RangeSelector {
  return !!s && Number.isInteger(s.start) && Number.isInteger(s.end) && s.end > s.start && s.quote.length > 0;
}
