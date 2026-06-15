import { createHash } from "node:crypto";

import type { Manifest, NodeType } from "@legisnote/shared";
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { fetchLawGptManifest } from "../import/lawgpt";
import { importManifest, isManifestEnvelope } from "../import/manifest";
import { editorProcedure, router } from "../trpc";

/**
 * Editorial workflow (FR-16/17): editors clean up the parsed text of a DRAFT
 * snapshot and then publish it. Import lands snapshots as drafts; publishing is
 * the only thing that points law.current_snapshot_id at a snapshot (D5) and
 * makes it visible to readers.
 */

const toIsoDate = (d: Date): string => d.toISOString().slice(0, 10);

function normalize(text?: string | null): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

function textHash(text?: string | null): Buffer {
  return Buffer.from(createHash("sha256").update(normalize(text), "utf8").digest());
}

/** A draft unit rendered as a flat, pre-ordered, depth-tagged list for editing. */
export interface EditableUnit {
  unitId: string;
  nodeId: string;
  nodeType: NodeType;
  label: string | null;
  depth: number;
  text: string | null;
}

export const editorialRouter = router({
  /**
   * Import a manifest from the web UI (FR-14/15/17) — same upsert as the
   * token-authed /api/import, but gated by the editor role instead of a bearer
   * token. The snapshot lands as a draft; the editor then cleans + publishes.
   */
  importManifest: editorProcedure
    .input(z.object({ manifest: z.unknown() }))
    .mutation(async ({ input }) => {
      if (!isManifestEnvelope(input.manifest)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Neplatný manifest (chybí law/units/manifestVersion)." });
      }
      const m = input.manifest as Manifest;
      const summary = await importManifest(m);
      return { ...summary, slug: `${m.law.number}-${m.law.year}`, citation: m.law.citation };
    }),

  /**
   * Fetch a law from the LawGPT.cz proxy by citation, parse it, and import it as
   * a draft (FR-14/15/22). No browsable catalogue exists upstream, so the UI
   * drives this by number/year.
   */
  importFromLawGpt: editorProcedure
    .input(z.object({ number: z.string().trim().min(1).max(12), year: z.number().int().min(1918).max(2100) }))
    .mutation(async ({ input }) => {
      const manifest = await fetchLawGptManifest(input.number, input.year);
      const summary = await importManifest(manifest);
      return {
        ...summary,
        slug: `${manifest.law.number}-${manifest.law.year}`,
        citation: manifest.law.citation,
        titleCs: manifest.law.titleCs,
      };
    }),

  /** All snapshots of a law with status + unit counts (editor dashboard). */
  snapshots: editorProcedure
    .input(z.object({ number: z.string(), year: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const law = await ctx.db.law.findUnique({
        where: { number_year: { number: input.number, year: input.year } },
        select: { id: true, currentSnapshotId: true },
      });
      if (!law) return null;

      const rows = await ctx.db.lawSnapshot.findMany({
        where: { lawId: law.id },
        orderBy: { seq: "asc" },
        select: {
          id: true,
          seq: true,
          status: true,
          effectiveFrom: true,
          effectiveTo: true,
          amendingAct: true,
          _count: { select: { units: true } },
        },
      });

      return {
        lawId: law.id,
        currentSnapshotId: law.currentSnapshotId,
        snapshots: rows.map((s) => ({
          id: s.id,
          seq: s.seq,
          status: s.status,
          effectiveFrom: toIsoDate(s.effectiveFrom),
          effectiveTo: s.effectiveTo ? toIsoDate(s.effectiveTo) : null,
          amendingAct: s.amendingAct,
          unitCount: s._count.units,
          isCurrent: s.id === law.currentSnapshotId,
        })),
      };
    }),

  /** One snapshot's units as a flat pre-ordered list for the text editor. */
  draftDocument: editorProcedure
    .input(z.object({ snapshotId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const snapshot = await ctx.db.lawSnapshot.findUnique({
        where: { id: input.snapshotId },
        include: { law: { select: { id: true, citation: true, titleCs: true, number: true, year: true } } },
      });
      if (!snapshot) throw new TRPCError({ code: "NOT_FOUND" });

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
        },
      });

      // Rebuild the tree from parent_unit_id, then flatten in pre-order with depth.
      type Row = (typeof rows)[number];
      const childrenOf = new Map<string | null, Row[]>();
      for (const r of rows) {
        const list = childrenOf.get(r.parentUnitId) ?? [];
        list.push(r);
        childrenOf.set(r.parentUnitId, list);
      }
      const units: EditableUnit[] = [];
      const walk = (parentId: string | null, depth: number): void => {
        const list = (childrenOf.get(parentId) ?? []).sort((a, b) => a.ordinal - b.ordinal);
        for (const r of list) {
          units.push({
            unitId: r.id,
            nodeId: r.nodeId,
            nodeType: r.nodeType as NodeType,
            label: r.label,
            depth,
            text: r.text,
          });
          walk(r.id, depth + 1);
        }
      };
      walk(null, 0);

      return {
        law: {
          id: snapshot.law.id,
          citation: snapshot.law.citation,
          titleCs: snapshot.law.titleCs,
          number: snapshot.law.number,
          year: snapshot.law.year,
        },
        snapshot: {
          id: snapshot.id,
          seq: snapshot.seq,
          status: snapshot.status,
          effectiveFrom: toIsoDate(snapshot.effectiveFrom),
          amendingAct: snapshot.amendingAct,
        },
        units,
      };
    }),

  /** Edit the cleaned-up text of a unit. Only DRAFT snapshots are editable. */
  updateUnitText: editorProcedure
    .input(z.object({ unitId: z.string().uuid(), text: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const unit = await ctx.db.snapshotUnit.findUnique({
        where: { id: input.unitId },
        select: { snapshot: { select: { status: true } } },
      });
      if (!unit) throw new TRPCError({ code: "NOT_FOUND" });
      if (unit.snapshot.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Publikované znění nelze upravovat. Vytvořte nové znění (draft).",
        });
      }

      // Raw UPDATE: text_hash is bytea and fts is a generated column.
      await ctx.db.$executeRaw`
        UPDATE snapshot_unit
           SET text = ${input.text}, text_hash = ${textHash(input.text)}
         WHERE id = ${input.unitId}::uuid`;
      return { ok: true };
    }),

  /** Publish a draft: make it visible to readers and the new live text (D5, FR-17). */
  publishSnapshot: editorProcedure
    .input(z.object({ snapshotId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const snap = await tx.lawSnapshot.findUnique({
          where: { id: input.snapshotId },
          select: { id: true, lawId: true, status: true },
        });
        if (!snap) throw new TRPCError({ code: "NOT_FOUND" });
        if (snap.status === "published") return { ok: true, alreadyPublished: true };

        await tx.lawSnapshot.update({ where: { id: snap.id }, data: { status: "published" } });
        await rechainPublished(tx, snap.lawId);
        return { ok: true };
      }),
    ),

  /** Pull a published snapshot back to draft (e.g. to fix a mistake). */
  unpublishSnapshot: editorProcedure
    .input(z.object({ snapshotId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const snap = await tx.lawSnapshot.findUnique({
          where: { id: input.snapshotId },
          select: { id: true, lawId: true, status: true },
        });
        if (!snap) throw new TRPCError({ code: "NOT_FOUND" });
        if (snap.status === "draft") return { ok: true, alreadyDraft: true };

        await tx.lawSnapshot.update({
          where: { id: snap.id },
          data: { status: "draft", effectiveTo: null },
        });
        await rechainPublished(tx, snap.lawId);
        return { ok: true };
      }),
    ),
});

/**
 * Recompute effective_to chaining + current_snapshot_id over a law's published
 * snapshots (ordered by effective_from): each runs until the day before the next
 * one starts; the latest stays in force (effective_to NULL) and becomes current.
 */
async function rechainPublished(tx: Prisma.TransactionClient, lawId: string): Promise<void> {
  const pub = await tx.lawSnapshot.findMany({
    where: { lawId, status: "published" },
    orderBy: { effectiveFrom: "asc" },
    select: { id: true, effectiveFrom: true },
  });

  for (let i = 0; i < pub.length; i++) {
    const next = pub[i + 1];
    let effectiveTo: Date | null = null;
    if (next) {
      const d = new Date(next.effectiveFrom);
      d.setUTCDate(d.getUTCDate() - 1);
      effectiveTo = d;
    }
    await tx.lawSnapshot.update({ where: { id: pub[i]!.id }, data: { effectiveTo } });
  }

  const current = pub.length ? pub[pub.length - 1]!.id : null;
  await tx.law.update({ where: { id: lawId }, data: { currentSnapshotId: current } });
}
