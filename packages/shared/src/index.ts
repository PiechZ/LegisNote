/**
 * @legisnote/shared — the cross-language contract types.
 *
 * These TypeScript types mirror `schema/manifest.schema.json`, the JSON the
 * Python ingestion tool emits and the TS importer consumes (docs/architecture.md §8).
 * Keep this file and the JSON schema in lock-step.
 */

export const MANIFEST_VERSION = "1.0" as const;

export type NodeType =
  | "law"
  | "part"
  | "title"
  | "chapter"
  | "section"
  | "paragraph"
  | "point"
  | "sentence"
  | "span";

export type SourceKind =
  | "esbirka_json"
  | "lawgpt"
  | "zakonyprolidi"
  | "eurlex"
  | "pdf";

export interface ManifestLaw {
  citation: string; // "91/2012 Sb."
  number: string; // "91"
  year: number; // 2012
  titleCs: string;
  shortTitle?: string | null;
}

export interface ManifestSnapshot {
  seq: number;
  effectiveFrom: string; // ISO date
  effectiveTo?: string | null;
  amendingAct?: string | null;
  amendingMeta?: Record<string, unknown>;
}

export interface ManifestSource {
  kind?: SourceKind;
  url?: string | null;
  fetchedAt?: string | null;
  rawSha256?: string | null;
  adapterVersion?: string | null;
  llmModel?: string | null;
}

export interface ManifestUnit {
  nodeKey: string;
  nodeType: NodeType;
  label?: string | null;
  ordinal: number;
  text?: string | null;
  children?: ManifestUnit[];
}

export interface Manifest {
  manifestVersion: typeof MANIFEST_VERSION;
  law: ManifestLaw;
  snapshot: ManifestSnapshot;
  source?: ManifestSource;
  units: ManifestUnit[];
}

/** Depth-first walk over a unit tree (importer + diff helpers). */
export function* walkUnits(units: ManifestUnit[]): Generator<ManifestUnit> {
  for (const u of units) {
    yield u;
    if (u.children) yield* walkUnits(u.children);
  }
}

/**
 * Read-only view model for the reader UI (`apps/web/src/reader`) and any static
 * export. Unlike the ingestion `Manifest`, it carries the resolved stable
 * `nodeId` (the annotation `data-anchor`, architecture §2.2) and a single chosen
 * snapshot. The DB reader maps `snapshot_unit` rows onto this shape; a static
 * build maps `ManifestUnit` onto the same shape.
 */
export interface ReaderUnit {
  nodeId: string; // stable structural_node id → rendered as data-anchor
  nodeKey?: string | null;
  nodeType: NodeType;
  label?: string | null; // "§ 5", "(2)", "a)", "ČÁST PRVNÍ"
  ordinal: number;
  text?: string | null;
  children: ReaderUnit[]; // ordered by ordinal
}

export interface LawDocument {
  law: {
    id: string;
    citation: string;
    titleCs: string;
    shortTitle?: string | null;
    year: number;
    number: string;
  };
  snapshot: {
    id: string;
    seq: number;
    effectiveFrom: string; // ISO date
    effectiveTo?: string | null;
    amendingAct?: string | null;
  };
  units: ReaderUnit[]; // top-level units, ordered
}

/**
 * Annotation overlay (FR-3/4/5/6), keyed by stable nodeId. The reader merges
 * this onto the {@link LawDocument} as a decoration layer — the canonical text
 * is never mutated. v1 exposes the shared/canonical layer only (FR-7).
 */
export interface OverlayTag {
  tagId: string;
  anchorId: string;
  name: string;
  color?: string | null;
}

export interface OverlayAnnotation {
  id: string;
  text: string;
  authorId?: string | null;
  createdAt: string;
}

export interface OverlayComment {
  id: string;
  body: string;
  parentId?: string | null;
  authorId?: string | null;
  createdAt: string;
}

export interface OverlayLink {
  id: string;
  direction: "from" | "to"; // "from" = this node is the source
  kind: string;
  label?: string | null;
  otherNodeId: string;
}

export interface NodeOverlay {
  tags: OverlayTag[];
  annotations: OverlayAnnotation[];
  comments: OverlayComment[];
  links: OverlayLink[];
}

/** nodeId → its overlay. Nodes with no overlay are simply absent. */
export type OverlayByNode = Record<string, NodeOverlay>;

/**
 * Range/term anchoring within a single unit's text (FR-3/4 word-level). Offsets
 * index the unit's `text`; `quote` is the literal substring (self-healing seam
 * for re-anchoring across snapshots). A NULL selector = whole-unit anchor.
 */
export interface RangeSelector {
  start: number;
  end: number;
  quote: string;
}

/** One inline decoration to render within a unit's text. */
export interface RangeDeco {
  anchorId: string;
  start: number;
  end: number;
  kind: "tag" | "annotation" | "highlight";
  label: string | null; // tag name / note text / null
  color: string | null;
  tagId?: string | null; // removal handle for tags
  itemId?: string | null; // annotation id / personal-highlight id
  mine?: boolean; // personal highlight owned by the viewer
}

/** nodeId → inline range decorations. */
export type RangesByNode = Record<string, RangeDeco[]>;
