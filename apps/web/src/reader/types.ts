import type { OverlayByNode, RangesByNode } from "@legisnote/shared";

import type { ExamHighlightInfo, UserHighlightInfo } from "~/server/routers/study";
import type { NodeChange } from "~/server/routers/versioning";

/** Overlay + versioning + study context threaded through the reader tree. */
export interface ReaderOverlayCtx {
  overlayByNode: OverlayByNode;
  isEditor: boolean;
  isAuthed: boolean;
  slug: string;
  /** Flat list of selectable link targets (nodeId + display label). */
  nodes: { nodeId: string; label: string }[];
  /** nodeId → display label, for showing the far side of a link. */
  labelByNode: Record<string, string>;
  /** Per-node change vs the previous snapshot (FR-9/10); empty if 1 snapshot. */
  changeByNode: Record<string, NodeChange>;
  // --- study aids (FR-11/12/13) ---
  exams: { id: string; name: string }[];
  currentExamId: string | null;
  examHighlightByNode: Record<string, ExamHighlightInfo>;
  myHighlightByNode: Record<string, UserHighlightInfo>;
  /** Inline word/range decorations per node (FR-3/4 word-level). */
  rangesByNode: RangesByNode;
}
