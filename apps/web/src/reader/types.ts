import type { OverlayByNode } from "@legisnote/shared";

import type { NodeChange } from "~/server/routers/versioning";

/** Overlay + versioning context threaded through the reader component tree. */
export interface ReaderOverlayCtx {
  overlayByNode: OverlayByNode;
  isEditor: boolean;
  slug: string;
  /** Flat list of selectable link targets (nodeId + display label). */
  nodes: { nodeId: string; label: string }[];
  /** nodeId → display label, for showing the far side of a link. */
  labelByNode: Record<string, string>;
  /** Per-node change vs the previous snapshot (FR-9/10); empty if 1 snapshot. */
  changeByNode: Record<string, NodeChange>;
}
