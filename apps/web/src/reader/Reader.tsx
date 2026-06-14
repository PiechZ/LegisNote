import type { LawDocument } from "@legisnote/shared";

import { ReaderUnitView } from "./ReaderUnit";
import styles from "./reader.module.css";
import type { ReaderOverlayCtx } from "./types";

/**
 * Pure, loader-agnostic renderer for a consolidated law snapshot. Takes a fully
 * resolved {@link LawDocument} plus the overlay context (annotations/tags/
 * comments/links, FR-3/4/5/6). Each unit renders with a stable `data-anchor`,
 * the seam the overlay decorations attach to (architecture §2.2).
 */
export function Reader({ doc, ctx }: { doc: LawDocument; ctx: ReaderOverlayCtx }) {
  const { law, snapshot, units } = doc;
  return (
    <article className={styles.law}>
      <header className={styles.header}>
        <h1 className={styles.title}>{law.titleCs}</h1>
        <p className={styles.citation}>
          {law.citation}
          {law.shortTitle ? ` · ${law.shortTitle}` : ""}
        </p>
        <p className={styles.meta}>
          Účinné znění od {snapshot.effectiveFrom}
          {snapshot.effectiveTo ? ` do ${snapshot.effectiveTo}` : " (aktuální)"}
          {snapshot.amendingAct ? ` · ${snapshot.amendingAct}` : ""}
        </p>
      </header>

      <div className={styles.body}>
        {units.map((unit) => (
          <ReaderUnitView key={unit.nodeId} unit={unit} depth={0} ctx={ctx} />
        ))}
      </div>
    </article>
  );
}
