import type { ReaderUnit } from "@legisnote/shared";

import styles from "./reader.module.css";
import type { ReaderOverlayCtx } from "./types";
import { UnitOverlay } from "./UnitOverlay";

/**
 * Recursively renders one structural unit and its children. The wrapper carries
 * `data-anchor` (stable node id) and `data-node-type` so the overlay layer
 * (tags/annotations/comments/links) can target it without mutating the
 * canonical text. Text uses `white-space: pre-line` to keep source line breaks.
 */
export function ReaderUnitView({
  unit,
  depth,
  ctx,
}: {
  unit: ReaderUnit;
  depth: number;
  ctx: ReaderOverlayCtx;
}) {
  const examHl = ctx.examHighlightByNode[unit.nodeId];
  const myHl = ctx.myHighlightByNode[unit.nodeId];
  const highlightStyle = myHl
    ? { background: `color-mix(in srgb, ${myHl.color ?? "#ffd54f"} 30%, transparent)` }
    : undefined;

  return (
    <section
      id={unit.nodeId}
      className={styles.unit}
      data-anchor={unit.nodeId}
      data-node-type={unit.nodeType}
      data-depth={depth}
      data-exam-relevant={examHl ? "1" : undefined}
      style={{ scrollMarginTop: "1rem", ...highlightStyle }}
    >
      {examHl ? (
        <span className={styles.examPill}>📌 relevantní pro zkoušku{examHl.note ? `: ${examHl.note}` : ""}</span>
      ) : null}
      {unit.label ? (
        <span className={styles.label} data-node-type={unit.nodeType}>
          {unit.label}
        </span>
      ) : null}

      {(() => {
        const change = ctx.changeByNode[unit.nodeId];
        if (!change) return null;
        return (
          <div className={styles.change} data-status={change.status}>
            <span className={styles.changeBadge}>
              {change.status === "added"
                ? "nové ustanovení"
                : `změněno${change.timesChanged > 1 ? ` ${change.timesChanged}×` : ""}`}
              {change.lastChangedOn ? ` · od ${change.lastChangedOn}` : ""}
            </span>
            {change.diff ? (
              <details className={styles.diffDetails}>
                <summary>zobrazit změnu</summary>
                <p className={styles.diffBody}>
                  {change.diff.map((seg, i) => (
                    <span key={i} className={styles[`seg_${seg.type}`]}>
                      {seg.text}
                    </span>
                  ))}
                </p>
              </details>
            ) : null}
          </div>
        );
      })()}

      {unit.text ? <div className={styles.text}>{unit.text}</div> : null}

      <UnitOverlay
        nodeId={unit.nodeId}
        overlay={ctx.overlayByNode[unit.nodeId]}
        isEditor={ctx.isEditor}
        isAuthed={ctx.isAuthed}
        slug={ctx.slug}
        nodes={ctx.nodes}
        labelByNode={ctx.labelByNode}
        exams={ctx.exams}
        currentExamId={ctx.currentExamId}
        examHl={examHl ? { anchorId: examHl.anchorId } : null}
        isMine={Boolean(myHl)}
      />

      {unit.children.length > 0 ? (
        <div className={styles.children}>
          {unit.children.map((child) => (
            <ReaderUnitView key={child.nodeId} unit={child} depth={depth + 1} ctx={ctx} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
