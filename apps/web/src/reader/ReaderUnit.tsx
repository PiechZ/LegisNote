import type { ReaderUnit } from "@legisnote/shared";

import styles from "./reader.module.css";

/**
 * Recursively renders one structural unit and its children. The wrapper carries
 * `data-anchor` (stable node id) and `data-node-type` so whole-unit annotations,
 * tags, comments, links, and study highlights can target it without mutating the
 * canonical text. Text is rendered with `white-space: pre-line` so source line
 * breaks are preserved.
 */
export function ReaderUnitView({ unit, depth }: { unit: ReaderUnit; depth: number }) {
  return (
    <section
      className={styles.unit}
      data-anchor={unit.nodeId}
      data-node-type={unit.nodeType}
      data-depth={depth}
    >
      {unit.label ? (
        <span className={styles.label} data-node-type={unit.nodeType}>
          {unit.label}
        </span>
      ) : null}

      {unit.text ? <div className={styles.text}>{unit.text}</div> : null}

      {unit.children.length > 0 ? (
        <div className={styles.children}>
          {unit.children.map((child) => (
            <ReaderUnitView key={child.nodeId} unit={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
