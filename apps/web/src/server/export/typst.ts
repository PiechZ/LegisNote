import type { LawDocument, ReaderUnit } from "@legisnote/shared";

/**
 * Renders a consolidated snapshot to Typst markup (FR-18/19/20). Unit text is
 * passed as Typst *string literals* (not markup), so legal text can't be
 * interpreted as Typst syntax. The screen PDF is Typst's output as-is; the
 * print path post-processes it with Ghostscript (see the export route).
 */
function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTypst(doc: LawDocument): string {
  const title = esc(doc.law.titleCs);
  const citation = esc(doc.law.citation);
  const eff = esc(doc.snapshot.effectiveFrom);

  const lines: string[] = [];
  const emit = (u: ReaderUnit, depth: number) => {
    lines.push(`#unit(${depth}, "${esc(u.nodeType)}", "${esc(u.label)}", "${esc(u.text)}")`);
    for (const c of u.children) emit(c, depth + 1);
  };
  for (const u of doc.units) emit(u, 0);

  return `#set document(title: "${title}", author: "LegisNote")
#set text(lang: "cs", size: 10pt)
#set par(justify: true, leading: 0.65em)
#set page(
  paper: "a5",
  margin: (x: 1.8cm, top: 2cm, bottom: 2cm),
  numbering: "1",
  header: align(right, text(8pt, "${citation}")),
)

#let unit(depth, kind, label, body) = {
  if kind == "part" or kind == "title" or kind == "chapter" {
    v(0.8em)
    align(center, strong(upper(label)))
    if body != "" { align(center, emph(body)) }
    v(0.3em)
  } else if kind == "section" or kind == "paragraph" {
    v(0.4em)
    if label != "" { strong(label); linebreak() }
    if body != "" { body }
    parbreak()
  } else {
    pad(left: depth * 1.0em, {
      if label != "" { strong(label); h(0.4em) }
      if body != "" { body }
    })
    parbreak()
  }
}

#align(center + horizon, {
  text(1.7em, strong("${title}"))
  v(0.6em)
  text(1.1em, "${citation}")
  v(0.3em)
  text(0.9em, "Účinné znění od ${eff}")
  v(2em)
  text(0.8em, emph("Vytištěno z aplikace LegisNote"))
})
#pagebreak()

${lines.join("\n")}
`;
}
