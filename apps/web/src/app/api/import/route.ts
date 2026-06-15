import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import type { Manifest, ManifestUnit } from "@legisnote/shared";

import { db } from "~/server/db";

/**
 * Token-authed importer endpoint consumed by the Python ingestion tool
 * (tools/ingestion → POST manifest.json). The web app owns the DB (D6); ingestion
 * never writes Postgres directly.
 *
 * Implements the consolidated-snapshot upsert (docs/data-model.md §2):
 *   1. upsert the law by (number, year)
 *   2. upsert the consolidated snapshot by (law_id, seq); clear its old units
 *   3. for each manifest unit, match the stable structural_node by (law_id, node_key)
 *      — reuse if present (carry-forward across amendments, FR-10a), else create
 *   4. insert snapshot_units (ltree path + sha256 text_hash) in pre-order
 *
 * The snapshot lands as a DRAFT (FR-16/17): import never publishes. An editor
 * cleans up the parsed text in /law/[citation]/edit and then publishes, which
 * is what points law.current_snapshot_id at the snapshot (D5). Re-importing an
 * already-published snapshot preserves its status (the upsert leaves it alone).
 *
 * Re-importing the same (law, seq) is idempotent: nodes are matched by node_key
 * and units are replaced.
 */

export const runtime = "nodejs";

function normalize(text?: string | null): string {
  return (text ?? "").trim().replace(/\s+/g, " ");
}

function textHash(text?: string | null): Buffer {
  return Buffer.from(createHash("sha256").update(normalize(text), "utf8").digest());
}

interface ImportSummary {
  lawId: string;
  snapshotId: string;
  status: "draft" | "published";
  nodesCreated: number;
  nodesMatched: number;
  unitsInserted: number;
}

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.IMPORTER_TOKEN;
  const auth = req.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let manifest: Manifest;
  try {
    manifest = (await req.json()) as Manifest;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const law = manifest?.law;
  if (
    manifest?.manifestVersion !== "1.0" ||
    !law?.citation ||
    !law?.number ||
    typeof law?.year !== "number" ||
    !Array.isArray(manifest.units)
  ) {
    return Response.json({ error: "unrecognized manifest envelope" }, { status: 422 });
  }

  try {
    const summary = await importManifest(manifest);
    return Response.json({ ok: true, ...summary }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "import_failed", message }, { status: 500 });
  }
}

async function importManifest(manifest: Manifest): Promise<ImportSummary> {
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
