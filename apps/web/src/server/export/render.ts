import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Compile Typst markup to PDF bytes. `print` adds a Ghostscript /prepress pass
 * (embed fonts, high-res) for press output; `screen` returns Typst's PDF as-is.
 */
export async function renderPdf(source: string, format: "screen" | "print"): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "legisnote-export-"));
  try {
    const inPath = join(dir, "doc.typ");
    const typstPdf = join(dir, "screen.pdf");
    await writeFile(inPath, source, "utf8");
    await exec("typst", ["compile", "--root", dir, inPath, typstPdf]);

    let outPath = typstPdf;
    if (format === "print") {
      outPath = join(dir, "print.pdf");
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

    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function pdfResponse(bytes: Buffer, filename: string): Response {
  // new Uint8Array(buffer) copies into a fresh ArrayBuffer (not ArrayBufferLike),
  // which satisfies the DOM BodyInit typing.
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
