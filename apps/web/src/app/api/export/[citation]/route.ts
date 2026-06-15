import type { ReaderUnit } from "@legisnote/shared";

import { pdfResponse, renderPdf } from "~/server/export/render";
import { buildTypst, type ExportAnnotations, type UnitExport } from "~/server/export/typst";
import { createCaller } from "~/server/routers/_app";
import type { ExamHighlightInfo } from "~/server/routers/study";
import { createContext } from "~/server/trpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * On-demand export of a consolidated snapshot to PDF (FR-18/19/20). The PDF now
 * carries the annotation overlay (tags/notes/comments), highlights, and — when
 * `?exam=<id>` is given — exam relevance per provision.
 *   ?format=screen → Typst PDF (RGB, screen reading; default)
 *   ?format=print  → + Ghostscript /prepress pass (embed fonts, high-res).
 */
function parseSlug(slug: string): { number: string; year: number } | null {
  const m = /^(.+)-(\d{4})$/.exec(decodeURIComponent(slug));
  if (!m || !m[1] || !m[2]) return null;
  return { number: m[1], year: Number(m[2]) };
}

export async function GET(req: Request, { params }: { params: { citation: string } }): Promise<Response> {
  const parsed = parseSlug(params.citation);
  if (!parsed) return new Response("invalid citation", { status: 400 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "print" ? "print" : "screen";
  const seq = url.searchParams.get("seq") ? Number(url.searchParams.get("seq")) : undefined;
  const asOf = url.searchParams.get("asOf") ?? undefined;
  const examId = url.searchParams.get("exam");
  const validExam = examId && UUID_RE.test(examId) ? examId : null;

  const ctx = await createContext();
  const caller = createCaller(ctx);
  const doc = await caller.law.getDocument({ number: parsed.number, year: parsed.year, seq, asOf });
  if (!doc) return new Response("law not found", { status: 404 });

  const lawId = doc.law.id;
  const authed = Boolean(ctx.session?.user);

  // nodeId → own text (to quote word-level highlights/tags in the PDF).
  const textByNode = new Map<string, string>();
  const walk = (units: ReaderUnit[]) => {
    for (const u of units) {
      if (u.text) textByNode.set(u.nodeId, u.text);
      walk(u.children);
    }
  };
  walk(doc.units);

  const [overlay, ranges, exams, examHl, myHl] = await Promise.all([
    caller.overlay.forLaw({ lawId }),
    caller.overlay.rangesForLaw({ lawId }),
    validExam ? caller.study.exams() : Promise.resolve([]),
    validExam ? caller.study.examHighlightsForLaw({ lawId, examId: validExam }) : Promise.resolve({} as Record<string, ExamHighlightInfo>),
    authed ? caller.study.myHighlightsForLaw({ lawId }) : Promise.resolve({}),
  ]);
  const examName = validExam ? (exams.find((e) => e.id === validExam)?.name ?? null) : null;

  const ann: ExportAnnotations = {};
  const bucket = (id: string): UnitExport => (ann[id] ??= { tags: [], notes: [], comments: [], highlights: [], exam: null });

  for (const [nodeId, o] of Object.entries(overlay)) {
    const b = bucket(nodeId);
    for (const t of o.tags) b.tags.push(t.name);
    for (const a of o.annotations) b.notes.push(a.text);
    for (const c of o.comments) b.comments.push(c.body);
  }
  for (const [nodeId, decos] of Object.entries(ranges)) {
    const b = bucket(nodeId);
    const full = textByNode.get(nodeId) ?? "";
    for (const d of decos) {
      const quote = full.slice(d.start, d.end).trim();
      if (d.kind === "tag") b.tags.push(quote ? `${d.label ?? ""} («${quote}»)` : (d.label ?? ""));
      else if (d.kind === "annotation") b.notes.push(quote ? `${d.label ?? ""} («${quote}»)` : (d.label ?? ""));
      else if (d.kind === "highlight" && quote) b.highlights.push(quote);
    }
  }
  for (const nodeId of Object.keys(myHl)) bucket(nodeId).highlights.push("celé ustanovení");
  if (examName) for (const [nodeId, info] of Object.entries(examHl)) bucket(nodeId).exam = info.note ? `${examName} — ${info.note}` : examName;

  try {
    const bytes = await renderPdf(buildTypst(doc, ann, examName), format);
    const filename = `${parsed.number}-${parsed.year}${validExam ? "-zkouska" : ""}${format === "print" ? "-tisk" : ""}.pdf`;
    return pdfResponse(bytes, filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`export failed: ${message}`, { status: 500 });
  }
}
