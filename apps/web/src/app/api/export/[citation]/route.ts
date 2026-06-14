import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { buildTypst } from "~/server/export/typst";
import { createCaller } from "~/server/routers/_app";
import { createContext } from "~/server/trpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const exec = promisify(execFile);

/**
 * On-demand export of a consolidated snapshot to PDF (FR-18/19/20).
 *   ?format=screen → Typst PDF (RGB, screen reading; default)
 *   ?format=print  → + Ghostscript /prepress pass (embed fonts, high-res).
 * Strict PDF/X-1a CMYK is finalized against the chosen printer's ICC (D4).
 * Heavy/concurrent exports should move to a pg-boss worker (services/export).
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

  const caller = createCaller(await createContext());
  const doc = await caller.law.getDocument({ number: parsed.number, year: parsed.year, seq, asOf });
  if (!doc) return new Response("law not found", { status: 404 });

  const dir = await mkdtemp(join(tmpdir(), "legisnote-export-"));
  try {
    const inPath = join(dir, "law.typ");
    const typstPdf = join(dir, "screen.pdf");
    await writeFile(inPath, buildTypst(doc), "utf8");

    // Typst → PDF
    await exec("typst", ["compile", "--root", dir, inPath, typstPdf]);

    let outPath = typstPdf;
    if (format === "print") {
      outPath = join(dir, "print.pdf");
      // Print-ready pass: embed fonts, high-res images, prepress profile.
      await exec("gs", [
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-sDEVICE=pdfwrite",
        "-dPDFSETTINGS=/prepress",
        "-dCompatibilityLevel=1.4",
        "-dEmbedAllFonts=true",
        "-dSubsetFonts=true",
        `-sOutputFile=${outPath}`,
        typstPdf,
      ]);
    }

    const bytes = await readFile(outPath);
    const filename = `${parsed.number}-${parsed.year}${format === "print" ? "-tisk" : ""}.pdf`;
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`export failed: ${message}`, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
