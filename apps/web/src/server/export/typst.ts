import type { LawDocument, ReaderUnit } from "@legisnote/shared";

import type { ExamDetail } from "~/server/routers/study";

/**
 * Renders consolidated snapshots and exam summaries to Typst markup (FR-18/19/20).
 * All user/legal text is passed as Typst *string literals* (never markup), so it
 * can't be interpreted as Typst syntax. The screen PDF is Typst's output as-is;
 * the print path post-processes it with Ghostscript (see the export route).
 */
function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Annotation overlay for one node, flattened for the PDF (FR-3/4/5 + study). */
export interface UnitExport {
  tags: string[];
  notes: string[]; // annotation texts (whole-unit + range)
  comments: string[];
  highlights: string[]; // highlighted quotes / "celé ustanovení"
  exam: string | null; // "Exam name — note"
}
export type ExportAnnotations = Record<string, UnitExport>;

const EMPTY: UnitExport = { tags: [], notes: [], comments: [], highlights: [], exam: null };

/** Typst string-array literal, e.g. ["a","b"] → ("a", "b",). Empty → (). */
function arr(items: string[]): string {
  if (items.length === 0) return "()";
  return `(${items.map((s) => `"${esc(s)}"`).join(", ")},)`;
}

const PREAMBLE = `#let gold = rgb("#b07d0a")
#let plum = rgb("#401e5c")

#let annblock(tags, notes, comments, highlights, exam) = {
  block(
    inset: (left: 0.7em, top: 0.4em, bottom: 0.4em, right: 0.5em),
    stroke: (left: 1.5pt + gold),
    fill: rgb("#faf3e1"),
    radius: 2pt,
    width: 100%,
    breakable: false,
    {
      set text(8pt)
      if exam != none [#text(fill: plum, weight: "bold")[★ Zkouška: #exam]\\ ]
      if tags.len() > 0 [#text(fill: gold, weight: "bold")[Štítky: ]#tags.join(", ")\\ ]
      if highlights.len() > 0 [#text(weight: "bold")[Zvýraznění: ]#highlights.map(h => "«" + h + "»").join(", ")\\ ]
      for n in notes [• #emph[Poznámka:] #n\\ ]
      for c in comments [• #emph[Komentář:] #c\\ ]
    },
  )
  v(0.2em)
}

#let unit(depth, kind, label, body, tags: (), notes: (), comments: (), highlights: (), exam: none) = {
  let hasann = tags.len() > 0 or notes.len() > 0 or comments.len() > 0 or highlights.len() > 0 or exam != none
  if kind == "part" or kind == "title" or kind == "chapter" {
    v(0.8em)
    align(center, strong(upper(label)))
    if body != "" { align(center, emph(body)) }
    if hasann { annblock(tags, notes, comments, highlights, exam) }
    v(0.3em)
  } else if kind == "section" or kind == "paragraph" {
    v(0.4em)
    if label != "" { strong(label); linebreak() }
    if body != "" { body }
    if hasann { annblock(tags, notes, comments, highlights, exam) }
    parbreak()
  } else {
    pad(left: depth * 1.0em, {
      if label != "" { strong(label); h(0.4em) }
      if body != "" { body }
    })
    if hasann { pad(left: depth * 1.0em, annblock(tags, notes, comments, highlights, exam)) }
    parbreak()
  }
}`;

export function buildTypst(doc: LawDocument, ann: ExportAnnotations = {}, examName?: string | null): string {
  const title = esc(doc.law.titleCs);
  const citation = esc(doc.law.citation);
  const eff = esc(doc.snapshot.effectiveFrom);
  const hasAnn = Object.keys(ann).length > 0;

  const lines: string[] = [];
  const emit = (u: ReaderUnit, depth: number) => {
    const a = ann[u.nodeId] ?? EMPTY;
    lines.push(
      `#unit(${depth}, "${esc(u.nodeType)}", "${esc(u.label)}", "${esc(u.text)}", ` +
        `tags: ${arr(a.tags)}, notes: ${arr(a.notes)}, comments: ${arr(a.comments)}, ` +
        `highlights: ${arr(a.highlights)}, exam: ${a.exam ? `"${esc(a.exam)}"` : "none"})`,
    );
    for (const c of u.children) emit(c, depth + 1);
  };
  for (const u of doc.units) emit(u, 0);

  const subtitleLines = [`text(1.1em, "${citation}")`, `v(0.3em)`, `text(0.9em, "Účinné znění od ${eff}")`];
  if (examName) subtitleLines.push(`v(0.5em)`, `text(0.9em, fill: plum, emph("Se studijním zvýrazněním pro: ${esc(examName)}"))`);
  if (hasAnn) subtitleLines.push(`v(0.3em)`, `text(0.8em, emph("Včetně poznámek, štítků a zvýraznění"))`);

  return `#set document(title: "${title}", author: "LegisNote")
#set text(lang: "cs", size: 10pt)
#set par(justify: true, leading: 0.65em)
#set page(
  paper: "a5",
  margin: (x: 1.8cm, top: 2cm, bottom: 2cm),
  numbering: "1",
  header: align(right, text(8pt, "${citation}")),
)

${PREAMBLE}

#align(center + horizon, {
  text(1.7em, strong("${title}"))
  v(0.6em)
  ${subtitleLines.join("\n  ")}
  v(2em)
  text(0.8em, emph("Vytištěno z aplikace LegisNote"))
})
#pagebreak()

${lines.join("\n")}
`;
}

/** Render an exam's condensed highlight summary (the /exams/[id] view) as a PDF. */
export function buildExamTypst(detail: ExamDetail): string {
  const name = esc(detail.exam.name);
  const desc = esc(detail.exam.description);

  const body: string[] = [];
  for (const law of detail.laws) {
    body.push(`#lawhead("${esc(law.citation)}")`);
    for (const it of law.items) {
      body.push(`#prov("${esc(it.label)}", "${esc(it.note)}", "${esc(it.snippet)}")`);
    }
  }

  return `#set document(title: "${name} — studijní zvýraznění", author: "LegisNote")
#set text(lang: "cs", size: 10pt)
#set par(justify: true, leading: 0.65em)
#set page(
  paper: "a5",
  margin: (x: 1.8cm, top: 2cm, bottom: 2cm),
  numbering: "1",
  header: align(right, text(8pt, "${name}")),
)

#let gold = rgb("#b07d0a")
#let plum = rgb("#401e5c")

#let lawhead(citation) = {
  v(1em)
  block(width: 100%, stroke: (bottom: 1pt + gold), inset: (bottom: 0.3em), text(1.15em, fill: plum, weight: "bold", citation))
  v(0.4em)
}
#let prov(label, note, snippet) = {
  block(inset: (left: 0.6em), stroke: (left: 2pt + gold), {
    strong(label)
    if note != "" [ — #text(fill: plum)[#note]]
    if snippet != "" { linebreak(); text(8.5pt, fill: luma(90), snippet) }
  })
  v(0.5em)
}

#align(center + horizon, {
  text(0.8em, fill: gold, tracking: 0.2em, upper("Studijní zvýraznění"))
  v(0.5em)
  text(1.8em, strong("${name}"))
  ${desc ? `v(0.5em)\n  text(1em, emph("${desc}"))` : ""}
  v(1em)
  text(0.9em, "Označeno ustanovení: ${detail.count}")
  v(2em)
  text(0.8em, emph("Vytištěno z aplikace LegisNote"))
})
#pagebreak()

${body.join("\n")}
`;
}
