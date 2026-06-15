import { createHash, randomUUID } from "node:crypto";

import type { Manifest, ManifestUnit } from "@legisnote/shared";
import { Prisma } from "@prisma/client";

import { db } from "~/server/db";

/**
 * Consolidated-snapshot upsert shared by the token-authed importer route
 * (POST /api/import) and the editor-gated web import (editorial.importManifest).
 * See docs/data-model.md §2. The snapshot lands as a DRAFT (FR-16/17); nothing
 * here points law.current_snapshot_id — publishing does that.
 */

export interface ImportSummary {
  lawId: string;
  snapshotId: string;
  status: "draft" | "published";
  nodesCreated: number;
  nodesMatched: number;
  unitsInserted: number;
}

/** Narrow an arbitrary parsed object to a Manifest envelope (cheap structural check). */
export function isManifestEnvelope(m: unknown): m is Manifest {
  if (!m || typeof m !== "object") return false;
  const x = m as Record<string, unknown>;
  const law = x.law as Record<string, unknown> | undefined;
  return (
    x.manifestVersion === "1.0" &&
    !!law &&
    typeof law.citation === "string" &&
    typeof law.number === "string" &&
    typeof law.year === "number" &&
    Array.isArray(x.units)
  );
}

function normalize(text?: string | null): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

function textHash(text?: string | null): Buffer {
  return Buffer.from(createHash("sha256").update(normalize(text), "utf8").digest());
}

export async function importManifest(manifest: Manifest): Promise<ImportSummary> {
  const { law, snapshot, source, units } = manifest;

  return db.$transaction(
    async (tx) => {
      const lawRow = await tx.law.upsert({
        where: { number_year: { number: law.number, year: law.year } },
        create: {
          citation: law.citation,
          number: law.number,
          year: law.year,
          titleCs: law.titleCs,
          shortTitle: law.shortTitle ?? null,
          sourceKind: source?.kind ?? null,
        },
        update: {
          citation: law.citation,
          titleCs: law.titleCs,
          shortTitle: law.shortTitle ?? null,
          sourceKind: source?.kind ?? null,
        },
      });

      const snap = await tx.lawSnapshot.upsert({
        where: { lawId_seq: { lawId: lawRow.id, seq: snapshot.seq } },
        create: {
          lawId: lawRow.id,
          seq: snapshot.seq,
          effectiveFrom: new Date(snapshot.effectiveFrom),
          effectiveTo: snapshot.effectiveTo ? new Date(snapshot.effectiveTo) : null,
          amendingAct: snapshot.amendingAct ?? null,
          amendingMeta: (snapshot.amendingMeta ?? {}) as Prisma.InputJsonValue,
          sourceCommit: source?.commit ?? null, // git backup SHA (FR-24)
          status: "draft", // editorial gate: never auto-publish (FR-17)
        },
        update: {
          // status intentionally untouched: a re-import keeps a published
          // snapshot published and a draft a draft.
          effectiveFrom: new Date(snapshot.effectiveFrom),
          effectiveTo: snapshot.effectiveTo ? new Date(snapshot.effectiveTo) : null,
          amendingAct: snapshot.amendingAct ?? null,
          amendingMeta: (snapshot.amendingMeta ?? {}) as Prisma.InputJsonValue,
          sourceCommit: source?.commit ?? null, // git backup SHA (FR-24)
        },
      });

      // Idempotent re-import: drop this snapshot's existing units, keep nodes.
      await tx.snapshotUnit.deleteMany({ where: { snapshotId: snap.id } });

      let nodesCreated = 0;
      let nodesMatched = 0;
      let unitsInserted = 0;

      const insertTree = async (
        list: ManifestUnit[],
        parentUnitId: string | null,
        parentPath: string,
      ): Promise<void> => {
        for (const u of list) {
          // Match the stable node by semantic key (carry-forward across snapshots).
          const existing = await tx.structuralNode.findUnique({
            where: { lawId_nodeKey: { lawId: lawRow.id, nodeKey: u.nodeKey } },
          });

          let nodeId: string;
          if (existing) {
            nodeId = existing.id;
            nodesMatched += 1;
          } else {
            const node = await tx.structuralNode.create({
              data: {
                lawId: lawRow.id,
                nodeType: u.nodeType,
                nodeKey: u.nodeKey,
                firstSeenSnapshotId: snap.id,
              },
            });
            nodeId = node.id;
            nodesCreated += 1;
          }

          const unitId = randomUUID();
          const path = parentPath ? `${parentPath}.${u.ordinal}` : `${u.ordinal}`;

          // Raw INSERT: ltree path + bytea text_hash are not expressible via the
          // typed client; fts is a generated column and is left for the DB.
          await tx.$executeRaw`
            INSERT INTO snapshot_unit
              (id, snapshot_id, node_id, parent_unit_id, node_type,
               label, ordinal, path, text, text_hash, metadata)
            VALUES
              (${unitId}::uuid, ${snap.id}::uuid, ${nodeId}::uuid,
               ${parentUnitId}::uuid, ${u.nodeType}::node_type,
               ${u.label ?? null}, ${u.ordinal}, text2ltree(${path}),
               ${u.text ?? null}, ${textHash(u.text)}, '{}'::jsonb)`;
          unitsInserted += 1;

          if (u.children?.length) {
            await insertTree(u.children, unitId, path);
          }
        }
      };

      await insertTree(units, null, "");

      // NB: law.current_snapshot_id is NOT set here — publishing does that
      // (editorial.publishSnapshot). Import only ever produces draft content.

      return {
        lawId: lawRow.id,
        snapshotId: snap.id,
        status: snap.status,
        nodesCreated,
        nodesMatched,
        unitsInserted,
      };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
