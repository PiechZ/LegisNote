"use client";

import { useState, useTransition } from "react";

import {
  type ActionResult,
  publishSnapshotAction,
  unpublishSnapshotAction,
  updateUnitTextAction,
} from "~/server/actions/editorial";

import styles from "./editor.module.css";

interface EditableUnit {
  unitId: string;
  nodeId: string;
  nodeType: string;
  label: string | null;
  depth: number;
  text: string | null;
}

interface SnapshotMeta {
  id: string;
  seq: number;
  status: "draft" | "published";
  effectiveFrom: string;
  amendingAct: string | null;
}

export function DraftEditor({
  slug,
  snapshot,
  units,
}: {
  slug: string;
  snapshot: SnapshotMeta;
  units: EditableUnit[];
}) {
  const editable = snapshot.status === "draft";
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(units.filter((u) => u.text != null).map((u) => [u.unitId, u.text as string])),
  );
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    startTransition(async () => {
      setError(null);
      const res = await action();
      if (res.ok) onSuccess?.();
      else setError(res.error);
    });
  }

  function saveUnit(unitId: string) {
    apply(
      () => updateUnitTextAction(slug, unitId, drafts[unitId] ?? ""),
      () => setDirty((d) => ({ ...d, [unitId]: false })),
    );
  }

  function saveAllDirty() {
    const ids = Object.keys(dirty).filter((id) => dirty[id]);
    if (ids.length === 0) return;
    startTransition(async () => {
      setError(null);
      for (const id of ids) {
        const res = await updateUnitTextAction(slug, id, drafts[id] ?? "");
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDirty((d) => ({ ...d, [id]: false }));
      }
    });
  }

  const dirtyCount = Object.values(dirty).filter(Boolean).length;

  return (
    <div>
      <div className={styles.toolbar}>
        <span className={snapshot.status === "published" ? styles.badgePublished : styles.badgeDraft}>
          {snapshot.status === "published" ? "PUBLIKOVÁNO" : "KONCEPT"}
        </span>
        <span className={styles.meta}>
          znění #{snapshot.seq} · účinnost od {snapshot.effectiveFrom}
          {snapshot.amendingAct ? ` · ${snapshot.amendingAct}` : ""}
        </span>
        <span style={{ flex: 1 }} />
        {editable ? (
          <>
            <button type="button" disabled={pending || dirtyCount === 0} onClick={saveAllDirty}>
              Uložit vše{dirtyCount ? ` (${dirtyCount})` : ""}
            </button>
            <button
              type="button"
              className={styles.publish}
              disabled={pending || dirtyCount > 0}
              title={dirtyCount > 0 ? "Nejprve uložte rozpracované změny." : "Zpřístupní toto znění čtenářům."}
              onClick={() => {
                if (confirm("Publikovat toto znění? Stane se viditelným pro čtenáře a aktuálním zněním zákona.")) {
                  apply(() => publishSnapshotAction(slug, snapshot.id));
                }
              }}
            >
              Publikovat znění →
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Vrátit publikované znění do konceptu? Přestane být viditelné pro čtenáře.")) {
                apply(() => unpublishSnapshotAction(slug, snapshot.id));
              }
            }}
          >
            Vrátit do konceptu
          </button>
        )}
      </div>

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      {!editable ? (
        <p className={styles.note}>
          Toto znění je publikované, a proto je jen ke čtení. Pro úpravy ho vraťte do konceptu (tlačítko výše).
        </p>
      ) : null}

      <ol className={styles.list}>
        {units.map((u) => (
          <li
            key={u.unitId}
            className={styles.row}
            style={{ marginLeft: `${u.depth * 1.25}rem` }}
            data-node-type={u.nodeType}
          >
            {u.label ? <div className={styles.label}>{u.label}</div> : null}
            {u.text != null ? (
              <div className={styles.unit}>
                <textarea
                  className={styles.textarea}
                  value={drafts[u.unitId] ?? ""}
                  disabled={!editable || pending}
                  rows={Math.min(10, Math.max(2, Math.ceil((drafts[u.unitId]?.length ?? 0) / 90)))}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDrafts((d) => ({ ...d, [u.unitId]: v }));
                    setDirty((d) => ({ ...d, [u.unitId]: v !== u.text }));
                  }}
                />
                {editable ? (
                  <div className={styles.unitActions}>
                    <button type="button" disabled={pending || !dirty[u.unitId]} onClick={() => saveUnit(u.unitId)}>
                      Uložit
                    </button>
                    {dirty[u.unitId] ? <span className={styles.dirtyDot}>• neuloženo</span> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
