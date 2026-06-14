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
    citation: string;
    titleCs: string;
    shortTitle?: string | null;
    year: number;
    number: string;
  };
  snapshot: {
    seq: number;
    effectiveFrom: string; // ISO date
    effectiveTo?: string | null;
    amendingAct?: string | null;
  };
  units: ReaderUnit[]; // top-level units, ordered
}
