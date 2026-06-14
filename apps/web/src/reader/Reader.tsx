import type { LawDocument } from "@legisnote/shared";

import { ReaderUnitView } from "./ReaderUnit";
import styles from "./reader.module.css";

/**
 * Pure, loader-agnostic renderer for a consolidated law snapshot. Takes a fully
 * resolved {@link LawDocument} (no data fetching here) so the same component can
 * be fed by the tRPC/DB loader or by a static build. Each unit renders with a
 * stable `data-anchor`, the seam future annotation/highlight decorations attach
 * to (architecture §2.2).
 */
export function Reader({ doc }: { doc: LawDocument }) {
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
          <ReaderUnitView key={unit.nodeId} unit={unit} depth={0} />
        ))}
      </div>
    </article>
  );
}
