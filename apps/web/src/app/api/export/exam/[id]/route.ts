import { pdfResponse, renderPdf } from "~/server/export/render";
import { buildExamTypst } from "~/server/export/typst";
import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Export an exam's condensed highlight summary (the /exams/[id] view) as a PDF. */
export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  if (!UUID_RE.test(params.id)) return new Response("invalid exam id", { status: 400 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "print" ? "print" : "screen";

  const caller = createCaller(await createContext());
  const detail = await caller.study.examDetail({ examId: params.id });
  if (!detail) return new Response("exam not found", { status: 404 });

  try {
    const bytes = await renderPdf(buildExamTypst(detail), format);
    const safe = detail.exam.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "zkouska";
    return pdfResponse(bytes, `zkouska-${safe}${format === "print" ? "-tisk" : ""}.pdf`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`export failed: ${message}`, { status: 500 });
  }
}
