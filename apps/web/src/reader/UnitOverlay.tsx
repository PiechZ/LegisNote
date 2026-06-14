"use client";

import type { NodeOverlay } from "@legisnote/shared";
import { useState, useTransition } from "react";

import {
  type ActionResult,
  addAnnotationAction,
  addCommentAction,
  addLinkAction,
  addTagAction,
  deleteAnnotationAction,
  deleteCommentAction,
  deleteLinkAction,
  removeTagAction,
} from "~/server/actions/overlay";
import {
  addExamHighlightAction,
  removeExamHighlightAction,
  toggleMyHighlightAction,
} from "~/server/actions/study";

import styles from "./overlay.module.css";

const LINK_KINDS = ["reference", "cross_law", "definition", "related", "amends", "see_also", "custom"] as const;

const EMPTY: NodeOverlay = { tags: [], annotations: [], comments: [], links: [] };

interface Props {
  nodeId: string;
  overlay?: NodeOverlay;
  isEditor: boolean;
  isAuthed: boolean;
  slug: string;
  nodes: { nodeId: string; label: string }[];
  labelByNode: Record<string, string>;
  exams: { id: string; name: string }[];
  currentExamId: string | null;
  examHl: { anchorId: string } | null;
  isMine: boolean;
}

export function UnitOverlay({
  nodeId,
  overlay,
  isEditor,
  isAuthed,
  slug,
  nodes,
  labelByNode,
  exams,
  currentExamId,
  examHl,
  isMine,
}: Props) {
  const o = overlay ?? EMPTY;
  const hasContent = o.tags.length + o.annotations.length + o.comments.length + o.links.length > 0;

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // add-form fields
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("");
  const [annotation, setAnnotation] = useState("");
  const [comment, setComment] = useState("");
  const [linkDst, setLinkDst] = useState("");
  const [linkKind, setLinkKind] = useState<(typeof LINK_KINDS)[number]>("reference");
  const [linkLabel, setLinkLabel] = useState("");
  const [examSel, setExamSel] = useState(currentExamId ?? "");
  const [examNote, setExamNote] = useState("");

  if (!hasContent && !isEditor && !isAuthed) return null;

  function apply(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    startTransition(async () => {
      setError(null);
      const res = await action();
      if (res.ok) onSuccess?.();
      else setError(res.error);
    });
  }

  const otherNodes = nodes.filter((n) => n.nodeId !== nodeId);

  return (
    <div className={styles.overlay}>
      <div className={styles.summary}>
        {o.tags.map((t) => (
          <span key={t.tagId} className={styles.chip} style={t.color ? { borderColor: t.color } : undefined}>
            {t.color ? <span className={styles.dot} style={{ background: t.color }} /> : null}
            {t.name}
            {isEditor ? (
              <button
                type="button"
                className={styles.chipX}
                title="Odebrat štítek"
                disabled={pending}
                onClick={() => apply(() => removeTagAction(slug, t.tagId, t.anchorId))}
              >
                ×
              </button>
            ) : null}
          </span>
        ))}

        <button type="button" className={styles.toggle} onClick={() => setOpen((v) => !v)}>
          {o.annotations.length > 0 ? <span title="Poznámky">📝 {o.annotations.length}</span> : null}
          {o.comments.length > 0 ? <span title="Komentáře">💬 {o.comments.length}</span> : null}
          {o.links.length > 0 ? <span title="Odkazy">🔗 {o.links.length}</span> : null}
          <span className={styles.manage}>{open ? "▾" : isEditor ? "✎ spravovat" : "zobrazit"}</span>
        </button>
      </div>

      {open ? (
        <div className={styles.panel}>
          {error ? <p className={styles.error}>{error}</p> : null}

          {o.annotations.length > 0 ? (
            <section>
              <h4>Poznámky</h4>
              <ul className={styles.items}>
                {o.annotations.map((a) => (
                  <li key={a.id}>
                    <span>{a.text}</span>
                    {isEditor ? (
                      <button type="button" disabled={pending} onClick={() => apply(() => deleteAnnotationAction(slug, a.id))}>
                        smazat
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {o.comments.length > 0 ? (
            <section>
              <h4>Komentáře</h4>
              <ul className={styles.items}>
                {o.comments.map((c) => (
                  <li key={c.id}>
                    <span>{c.body}</span>
                    {isEditor ? (
                      <button type="button" disabled={pending} onClick={() => apply(() => deleteCommentAction(slug, c.id))}>
                        smazat
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {o.links.length > 0 ? (
            <section>
              <h4>Odkazy</h4>
              <ul className={styles.items}>
                {o.links.map((l) => (
                  <li key={l.id}>
                    <span>
                      {l.direction === "from" ? "→ " : "← "}
                      {labelByNode[l.otherNodeId] ?? l.otherNodeId}
                      <em className={styles.kind}> ({l.kind}{l.label ? `: ${l.label}` : ""})</em>
                    </span>
                    {isEditor ? (
                      <button type="button" disabled={pending} onClick={() => apply(() => deleteLinkAction(slug, l.id))}>
                        smazat
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {isEditor ? (
            <div className={styles.forms}>
              <form
                className={styles.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!tagName.trim()) return;
                  apply(() => addTagAction(slug, nodeId, tagName.trim(), tagColor || undefined), () => {
                    setTagName("");
                    setTagColor("");
                  });
                }}
              >
                <input placeholder="Nový štítek" value={tagName} onChange={(e) => setTagName(e.target.value)} />
                <input type="color" value={tagColor || "#888888"} onChange={(e) => setTagColor(e.target.value)} title="Barva štítku" />
                <button type="submit" disabled={pending}>+ štítek</button>
              </form>

              <form
                className={styles.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!annotation.trim()) return;
                  apply(() => addAnnotationAction(slug, nodeId, annotation.trim()), () => setAnnotation(""));
                }}
              >
                <textarea placeholder="Poznámka…" value={annotation} onChange={(e) => setAnnotation(e.target.value)} rows={2} />
                <button type="submit" disabled={pending}>+ poznámka</button>
              </form>

              <form
                className={styles.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  apply(() => addCommentAction(slug, nodeId, comment.trim()), () => setComment(""));
                }}
              >
                <textarea placeholder="Komentář…" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
                <button type="submit" disabled={pending}>+ komentář</button>
              </form>

              <form
                className={styles.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!linkDst) return;
                  apply(() => addLinkAction(slug, nodeId, linkDst, linkKind, linkLabel || undefined), () => {
                    setLinkDst("");
                    setLinkLabel("");
                  });
                }}
              >
                <select value={linkDst} onChange={(e) => setLinkDst(e.target.value)}>
                  <option value="">— cíl odkazu —</option>
                  {otherNodes.map((n) => (
                    <option key={n.nodeId} value={n.nodeId}>{n.label}</option>
                  ))}
                </select>
                <select value={linkKind} onChange={(e) => setLinkKind(e.target.value as (typeof LINK_KINDS)[number])}>
                  {LINK_KINDS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <input placeholder="popis (volitelné)" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
                <button type="submit" disabled={pending}>+ odkaz</button>
              </form>
            </div>
          ) : null}

          {isAuthed || isEditor ? (
            <div className={styles.study}>
              {isAuthed ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => apply(() => toggleMyHighlightAction(slug, nodeId))}
                >
                  {isMine ? "★ odebrat moje zvýraznění" : "☆ moje zvýraznění"}
                </button>
              ) : null}

              {isEditor && exams.length > 0 ? (
                <form
                  className={styles.form}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!examSel) return;
                    apply(() => addExamHighlightAction(slug, examSel, nodeId, examNote || undefined), () => setExamNote(""));
                  }}
                >
                  <select value={examSel} onChange={(e) => setExamSel(e.target.value)}>
                    <option value="">— zkouška —</option>
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name}
                      </option>
                    ))}
                  </select>
                  <input placeholder="poznámka (volitelné)" value={examNote} onChange={(e) => setExamNote(e.target.value)} />
                  <button type="submit" disabled={pending}>+ označit pro zkoušku</button>
                </form>
              ) : null}

              {isEditor && currentExamId && examHl ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => apply(() => removeExamHighlightAction(slug, currentExamId, examHl.anchorId))}
                >
                  odebrat z aktuální zkoušky
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
