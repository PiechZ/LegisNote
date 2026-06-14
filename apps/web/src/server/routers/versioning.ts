import { z } from "zod";

import { publicProcedure, router } from "../trpc";
import { type DiffSeg, wordDiff } from "../versioning/diff";

/**
 * Consolidated-snapshot versioning (FR-8/9/10). Change detection rides on stable
 * structural_node ids (FR-10a): the importer carries a node forward across
 * snapshots by node_key, so a node's text across snapshots is its history. We
 * report, per node visible in the selected snapshot: whether it changed vs the
 * previous snapshot, how many times it changed over its history, when it last
 * changed, and the word-level diff vs the previous snapshot.
 */
const norm = (t: string | null): string => (t ?? "").trim().replace(/\s+/g, " ");
const iso = (d: Date): string => d.toISOString().slice(0, 10);

export interface NodeChange {
  status: "added" | "modified";
  timesChanged: number;
  lastChangedOn: string | null;
  diff: DiffSeg[] | null;
}

export interface SnapshotMeta {
  id: string;
  seq: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  amendingAct: string | null;
}

export interface ChangeSet {
  snapshots: SnapshotMeta[];
  currentSnapshotId: string;
  currentSeq: number;
  changeByNode: Record<string, NodeChange>;
  removedCount: number;
}

export const versioningRouter = router({
  changeSet: publicProcedure
    .input(z.object({ lawId: z.string().uuid(), snapshotId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<ChangeSet> => {
      const snaps = await ctx.db.lawSnapshot.findMany({
        where: { lawId: input.lawId },
        orderBy: { seq: "asc" },
        select: { id: true, seq: true, effectiveFrom: true, effectiveTo: true, amendingAct: true },
      });

      const snapshots: SnapshotMeta[] = snaps.map((s) => ({
        id: s.id,
        seq: s.seq,
        effectiveFrom: iso(s.effectiveFrom),
        effectiveTo: s.effectiveTo ? iso(s.effectiveTo) : null,
        amendingAct: s.amendingAct,
      }));

      const current = snaps.find((s) => s.id === input.snapshotId) ?? snaps[snaps.length - 1];
      const empty: ChangeSet = {
        snapshots,
        currentSnapshotId: current?.id ?? input.snapshotId,
        currentSeq: current?.seq ?? 0,
        changeByNode: {},
        removedCount: 0,
      };
      if (!current) return empty;

      const prev = [...snaps].reverse().find((s) => s.seq < current.seq);
      if (!prev) return empty; // first snapshot → nothing to diff against

      const effFromBySeq = new Map(snaps.map((s) => [s.seq, iso(s.effectiveFrom)]));
      const seqById = new Map(snaps.map((s) => [s.id, s.seq]));

      // All unit texts for the law, across snapshots, grouped per stable node.
      const units = await ctx.db.snapshotUnit.findMany({
        where: { snapshot: { lawId: input.lawId } },
        select: { snapshotId: true, nodeId: true, text: true },
      });

      const history = new Map<string, { seq: number; text: string | null }[]>();
      for (const u of units) {
        const seq = seqById.get(u.snapshotId);
        if (seq === undefined) continue;
        (history.get(u.nodeId) ?? history.set(u.nodeId, []).get(u.nodeId)!).push({ seq, text: u.text });
      }

      const changeByNode: Record<string, NodeChange> = {};
      for (const [nodeId, versions] of history) {
        versions.sort((a, b) => a.seq - b.seq);
        const upToCurrent = versions.filter((v) => v.seq <= current.seq);
        const cur = upToCurrent.find((v) => v.seq === current.seq);
        if (!cur) continue; // node not present in the selected snapshot

        // History: count modifications + last-changed date (relative to current).
        let timesChanged = 0;
        let lastChangedOn: string | null = null;
        for (let k = 1; k < upToCurrent.length; k++) {
          if (norm(upToCurrent[k]!.text) !== norm(upToCurrent[k - 1]!.text)) {
            timesChanged++;
            lastChangedOn = effFromBySeq.get(upToCurrent[k]!.seq) ?? null;
          }
        }

        const prevVersion = upToCurrent.find((v) => v.seq === prev.seq);
        if (!prevVersion) {
          changeByNode[nodeId] = { status: "added", timesChanged, lastChangedOn, diff: null };
        } else if (norm(prevVersion.text) !== norm(cur.text)) {
          changeByNode[nodeId] = {
            status: "modified",
            timesChanged,
            lastChangedOn,
            diff: wordDiff(prevVersion.text ?? "", cur.text ?? ""),
          };
        }
      }

      // Nodes present in prev but gone from current = removed.
      let removedCount = 0;
      for (const versions of history.values()) {
        const hasPrev = versions.some((v) => v.seq === prev.seq);
        const hasCur = versions.some((v) => v.seq === current.seq);
        if (hasPrev && !hasCur) removedCount++;
      }

      return { snapshots, currentSnapshotId: current.id, currentSeq: current.seq, changeByNode, removedCount };
    }),
});
