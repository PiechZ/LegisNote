"use client";

import type { RangeDeco, RangeSelector } from "@legisnote/shared";
import { type CSSProperties, type MouseEvent, type ReactNode, useEffect, useRef, useState, useTransition } from "react";

import {
  type ActionResult,
  addAnnotationAction,
  addTagAction,
  deleteAnnotationAction,
  removeTagAction,
} from "~/server/actions/overlay";
import { addHighlightAction, removeHighlightAction } from "~/server/actions/study";

import styles from "./unittext.module.css";

interface Props {
  nodeId: string;
  text: string;
  slug: string;
  isEditor: boolean;
  isAuthed: boolean;
  ranges: RangeDeco[];
}

interface Sel {
  start: number;
  end: number;
  quote: string;
  x: number;
  y: number;
}

/** Char offset of (node, offset) within `root`, summing preceding text nodes. */
function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  if (node === root) {
    let total = 0;
    for (let i = 0; i < offset && i < root.childNodes.length; i++) total += (root.childNodes[i]?.textContent ?? "").length;
    return total;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let n = walker.nextNode();
  while (n) {
    if (n === node) return total + offset;
    total += (n.textContent ?? "").length;
    n = walker.nextNode();
  }
  return total + offset;
}

function decoStyle(r: RangeDeco): CSSProperties {
  if (r.kind === "highlight") return { background: `color-mix(in srgb, ${r.color ?? "#ffd54f"} 45%, transparent)` };
  if (r.kind === "tag") return { borderBottom: `2px solid ${r.color ?? "#3366cc"}` };
  return { borderBottom: "2px dotted currentColor" };
}

function decoTitle(r: RangeDeco): string {
  if (r.kind === "tag") return `Štítek: ${r.label ?? ""}`;
  if (r.kind === "annotation") return `Poznámka: ${r.label ?? ""}`;
  return "Moje zvýraznění";
}

function canRemove(d: RangeDeco, isEditor: boolean): boolean {
  return d.kind === "highlight" ? Boolean(d.mine) : isEditor;
}

export function UnitText({ nodeId, text, slug, isEditor, isAuthed, ranges }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [mode, setMode] = useState<"menu" | "tag" | "note">("menu");
  const [tagName, setTagName] = useState("");
  const [note, setNote] = useState("");
  const [popover, setPopover] = useState<{ x: number; y: number; deco: RangeDeco } | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setSel(null);
    setMode("menu");
    setTagName("");
    setNote("");
    window.getSelection()?.removeAllRanges();
  }

  useEffect(() => {
    if (!sel && !popover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        reset();
        setPopover(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sel, popover]);

  function onMouseUp() {
    const s = window.getSelection();
    if (!s || s.isCollapsed || s.rangeCount === 0 || !ref.current) return;
    const r = s.getRangeAt(0);
    if (!ref.current.contains(r.commonAncestorContainer)) return;
    const a0 = offsetOf(ref.current, r.startContainer, r.startOffset);
    const b0 = offsetOf(ref.current, r.endContainer, r.endOffset);
    const start = Math.min(a0, b0);
    const end = Math.max(a0, b0);
    if (end - start < 1) return;
    const rect = r.getBoundingClientRect();
    setPopover(null);
    setSel({ start, end, quote: text.slice(start, end), x: rect.left, y: rect.bottom });
    setMode("menu");
  }

  function apply(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        reset();
        setPopover(null);
      }
    });
  }

  const selector: RangeSelector | undefined = sel ? { start: sel.start, end: sel.end, quote: sel.quote } : undefined;

  function removeDeco(d: RangeDeco): Promise<ActionResult> {
    if (d.kind === "tag" && d.tagId) return removeTagAction(slug, d.tagId, d.anchorId);
    if (d.kind === "annotation" && d.itemId) return deleteAnnotationAction(slug, d.itemId);
    if (d.kind === "highlight") return removeHighlightAction(slug, d.anchorId);
    return Promise.resolve({ ok: true });
  }

  function renderText(): ReactNode {
    if (ranges.length === 0) return text;
    const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
    const out: ReactNode[] = [];
    let cursor = 0;
    let key = 0;
    for (const r of sorted) {
      const s = Math.max(r.start, cursor);
      const e = Math.min(r.end, text.length);
      if (e <= s) continue;
      if (s > cursor) out.push(<span key={key++}>{text.slice(cursor, s)}</span>);
      out.push(
        <mark
          key={key++}
          className={styles.deco}
          style={decoStyle(r)}
          title={decoTitle(r)}
          onClick={(ev: MouseEvent<HTMLElement>) => {
            ev.stopPropagation();
            const rect = ev.currentTarget.getBoundingClientRect();
            setSel(null);
            setPopover({ x: rect.left, y: rect.bottom, deco: r });
          }}
        >
          {text.slice(s, e)}
        </mark>,
      );
      cursor = e;
    }
    if (cursor < text.length) out.push(<span key={key++}>{text.slice(cursor)}</span>);
    return out;
  }

  return (
    <span className={styles.wrap}>
      <span ref={ref} className={styles.text} onMouseUp={onMouseUp}>
        {renderText()}
      </span>

      {sel ? (
        <div className={styles.toolbar} style={{ left: sel.x, top: sel.y + 6 }} onMouseDown={(e) => e.preventDefault()}>
          {mode === "menu" ? (
            <>
              {isAuthed ? (
                <button type="button" disabled={pending} onClick={() => apply(() => addHighlightAction(slug, nodeId, selector))}>
                  🖊️ Zvýraznit
                </button>
              ) : null}
              {isEditor ? (
                <button type="button" disabled={pending} onClick={() => setMode("tag")}>
                  🏷️ Štítek
                </button>
              ) : null}
              {isEditor ? (
                <button type="button" disabled={pending} onClick={() => setMode("note")}>
                  📝 Poznámka
                </button>
              ) : null}
              {!isAuthed ? <span className={styles.hint}>Přihlaste se pro zvýraznění</span> : null}
            </>
          ) : mode === "tag" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (tagName.trim()) apply(() => addTagAction(slug, nodeId, tagName.trim(), undefined, selector));
              }}
            >
              <input autoFocus placeholder="štítek" value={tagName} onChange={(e) => setTagName(e.target.value)} />
              <button type="submit" disabled={pending}>uložit</button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) apply(() => addAnnotationAction(slug, nodeId, note.trim(), selector));
              }}
            >
              <input autoFocus placeholder="poznámka" value={note} onChange={(e) => setNote(e.target.value)} />
              <button type="submit" disabled={pending}>uložit</button>
            </form>
          )}
        </div>
      ) : null}

      {popover ? (
        <div className={styles.popover} style={{ left: popover.x, top: popover.y + 6 }} onMouseDown={(e) => e.preventDefault()}>
          <span className={styles.popLabel}>{decoTitle(popover.deco)}</span>
          {canRemove(popover.deco, isEditor) ? (
            <button type="button" disabled={pending} onClick={() => apply(() => removeDeco(popover.deco))}>
              odebrat
            </button>
          ) : null}
          <button type="button" className={styles.close} onClick={() => setPopover(null)}>
            ×
          </button>
        </div>
      ) : null}
    </span>
  );
}
